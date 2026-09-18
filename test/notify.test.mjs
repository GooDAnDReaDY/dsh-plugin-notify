import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { apply, Config, name, NS, resolveWebhookValue, broadcastSse } from '../lib/index.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const clientPath = path.join(root, 'lib/client.js')

function context(extra = {}) {
  let listener
  const logs = { warn: [], debug: [], info: [], error: [] }
  const ctx = {
    logger: {
      warn(msg) { logs.warn.push(msg) },
      debug(msg) { logs.debug.push(msg) },
      info(msg) { logs.info.push(msg) },
      error(msg) { logs.error.push(msg) },
    },
    logs,
    on(topic, callback) {
      assert.equal(topic, 'session/event')
      listener = callback
    },
    emit(session, event) {
      listener(session, event)
    },
    inject(deps, cb) {
      if (Array.isArray(deps) && deps.includes('settings')) {
        cb({
          settings: {
            register() {
              return { get: () => null }
            },
          },
        })
      }
      if (Array.isArray(deps) && deps.includes('webServer') && extra.webServer) {
        cb({
          webServer: extra.webServer,
        })
      }
    },
    ...extra,
  }
  return ctx
}

function session(id) {
  return {
    id,
    events: [{
      type: 'user/message',
      data: { content: [{ type: 'text', text: 'test notification' }] },
    }],
  }
}

function waitFor(predicate, ms = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for condition')), ms)
    const poll = () => {
      if (predicate()) {
        clearTimeout(timer)
        resolve()
        return
      }
      setTimeout(poll, 10)
    }
    poll()
  })
}

function loadClient() {
  const source = fs.readFileSync(clientPath, 'utf8')
  let client
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(entry) {
          client = entry.factory((id) => {
            if (id === 'react') return {}
            if (id === '@deepseek-ai/dsh-client-ui-primitives') return {}
            throw new Error(`unexpected client dependency: ${id}`)
          })
        },
      },
    },
    console,
  }
  vm.runInNewContext(source, sandbox)
  return client
}

function localeCtx() {
  const dictionaries = new Map([[`${NS}:ru`, { title: 'from-language-pack' }]])
  const disposers = []
  const ctx = {
    locale: {
      bind: () => (key) => key,
      register(namespace, localeMap) {
        const added = []
        for (const [locale, dictionary] of Object.entries(localeMap)) {
          const key = `${namespace}:${locale}`
          if (dictionaries.has(key)) throw new Error(`duplicate locale ${key}`)
          dictionaries.set(key, dictionary)
          added.push(key)
        }
        return () => {
          for (const key of added) dictionaries.delete(key)
        }
      },
    },
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
    slots: {
      inject(_name, callback) {
        callback()
        return true
      },
      register() {},
    },
  }
  return { ctx, dictionaries, disposers }
}

test('public package identity matches host, client and patch sites', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.name, '@goodandready/dsh-plugin-notify')
  assert.equal(pkg.publishConfig?.access, 'public')
  assert.equal(name, '@goodandready/dsh-plugin-notify')
  assert.equal(NS, '@goodandready/dsh-plugin-notify')
  assert.match(fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8'), /@goodandready\/dsh-plugin-notify/)
  const client = fs.readFileSync(clientPath, 'utf8')
  assert.match(client, /id: '@goodandready\/dsh-plugin-notify'/)
  assert.match(client, /settings\.plugin\.item/)
  assert.match(client, /dataset\.dshPlugin = 'dsh-plugin-notify'/)
  assert.equal(pkg.exports['.'], './lib/index.js')
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.equal(pkg.main, './lib/index.js')
  assert.ok(pkg.dsh.client)
  assert.equal(pkg.devDependencies.typescript, undefined)
  assert.ok(pkg.files.includes('README.zh.md'))
  assert.ok(pkg.files.includes('README.ru.md'))
  assert.ok(!pkg.files.includes('AGENTS.md'))
  assert.ok(!pkg.files.includes('index.md'))
})

test('client locale registration coexists with Russian language pack', () => {
  const client = loadClient()
  const { ctx, dictionaries } = localeCtx()
  assert.doesNotThrow(() => client.apply(ctx))
  assert.ok(dictionaries.has(`${NS}:ru`))
  assert.ok(dictionaries.has(`${NS}:en`))
  assert.ok(dictionaries.has(`${NS}:zh`))
  assert.equal(dictionaries.has(`${NS}:ru`) && dictionaries.get(`${NS}:ru`).title, 'from-language-pack')
})

test('client apply does not register ru and can reload after effect dispose', () => {
  const client = loadClient()
  const { ctx, dictionaries, disposers } = localeCtx()
  assert.doesNotThrow(() => client.apply(ctx))
  assert.equal(dictionaries.get(`${NS}:ru`).title, 'from-language-pack')
  assert.ok(!Object.prototype.hasOwnProperty.call(dictionaries.get(`${NS}:en`) || {}, 'ru'))
  for (const dispose of disposers.splice(0)) dispose()
  assert.doesNotThrow(() => client.apply(ctx))
  assert.ok(dictionaries.has(`${NS}:en`))
  assert.ok(dictionaries.has(`${NS}:zh`))
  assert.equal(dictionaries.get(`${NS}:ru`).title, 'from-language-pack')
})

test('legacy raw webhook URL still posts (compat)', async () => {
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      requests.push({ method: request.method, body: JSON.parse(body) })
      response.end('ok')
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  const ctx = context()
  apply(ctx, { webhooks: { custom: url }, local: false, events: ['task_done'] })
  const s = session('smoke-session')
  ctx.emit(s, { type: 'turn/start' })
  ctx.emit(s, { type: 'turn/end', data: { reason: { kind: 'completed' }, turn: 1 } })
  await waitFor(() => requests.length > 0)
  server.close()
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].body.kind, 'task_done')
  assert.equal(requests[0].body.sessionId, 'smoke-session')
})

test('credential ref resolves webhook URL via credentials service', async () => {
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      requests.push(JSON.parse(body))
      response.end('ok')
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  const ctx = context({
    credentials: {
      async resolve(ref) {
        assert.equal(String(ref), 'NOTIFY_CUSTOM_HOOK')
        return { value: url }
      },
    },
  })
  apply(ctx, { webhooks: { custom: 'NOTIFY_CUSTOM_HOOK' }, local: false, events: ['task_done'] })
  const s = session('cred-session')
  ctx.emit(s, { type: 'turn/start' })
  ctx.emit(s, { type: 'turn/end', data: { reason: { kind: 'completed' }, turn: 1 } })
  await waitFor(() => requests.length > 0)
  server.close()
  assert.equal(requests[0].sessionId, 'cred-session')
})

test('resolveWebhookValue prefers credentials then env', async () => {
  process.env.NOTIFY_ENV_HOOK = 'https://example.test/from-env'
  const fromCred = await resolveWebhookValue({
    credentials: { resolve: async () => ({ value: 'https://example.test/from-cred' }) },
  }, 'ANY_REF')
  assert.equal(fromCred, 'https://example.test/from-cred')
  const fromEnv = await resolveWebhookValue({}, 'NOTIFY_ENV_HOOK')
  assert.equal(fromEnv, 'https://example.test/from-env')
  delete process.env.NOTIFY_ENV_HOOK
})

test('missing credential name does not post', async () => {
  const posts = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    posts.push({ url, body: JSON.parse(opts.body) })
    return new Response('ok', { status: 200 })
  }
  try {
    const ctx = context({
      credentials: { resolve: async () => ({ value: '' }) },
    })
    apply(ctx, { webhooks: { custom: 'MISSING_HOOK' }, local: false, events: ['task_done'] })
    const s = session('missing-cred')
    ctx.emit(s, { type: 'turn/start' })
    ctx.emit(s, { type: 'turn/end', data: { reason: { kind: 'completed' }, turn: 1 } })
    await new Promise((resolve) => setTimeout(resolve, 80))
    assert.equal(posts.length, 0)
  } finally {
    globalThis.fetch = original
  }
})

test('each IM channel posts the expected body shape', async () => {
  const posts = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    posts.push({ url: String(url), body: JSON.parse(opts.body) })
    return new Response('ok', { status: 200 })
  }
  try {
    const ctx = context()
    apply(ctx, {
      local: false,
      events: ['task_done'],
      webhooks: {
        feishu: 'https://example.test/feishu',
        wecom: 'https://example.test/wecom',
        dingtalk: 'https://example.test/dingtalk',
        slack: 'https://example.test/slack',
        discord: 'https://example.test/discord',
        custom: 'https://example.test/custom',
      },
    })
    const s = session('shape-session')
    ctx.emit(s, { type: 'turn/start' })
    ctx.emit(s, { type: 'turn/end', data: { reason: { kind: 'completed' }, turn: 1 } })
    await waitFor(() => posts.length >= 6)
    const byUrl = Object.fromEntries(posts.map((p) => [p.url, p.body]))
    assert.equal(byUrl['https://example.test/feishu'].msg_type, 'text')
    assert.equal(typeof byUrl['https://example.test/feishu'].content.text, 'string')
    assert.equal(byUrl['https://example.test/wecom'].msgtype, 'text')
    assert.equal(byUrl['https://example.test/dingtalk'].msgtype, 'text')
    assert.equal(typeof byUrl['https://example.test/slack'].text, 'string')
    assert.equal(typeof byUrl['https://example.test/discord'].content, 'string')
    assert.equal(byUrl['https://example.test/custom'].kind, 'task_done')
    assert.equal(byUrl['https://example.test/custom'].sessionId, 'shape-session')
  } finally {
    globalThis.fetch = original
  }
})

test('recipient HTTP failure does not throw out of the session loop', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('connect reset')
  }
  try {
    const ctx = context()
    apply(ctx, { webhooks: { custom: 'https://example.test/down' }, local: false, events: ['task_done'] })
    const s = session('down-session')
    ctx.emit(s, { type: 'turn/start' })
    assert.doesNotThrow(() => {
      ctx.emit(s, { type: 'turn/end', data: { reason: { kind: 'completed' }, turn: 1 } })
    })
    await new Promise((resolve) => setTimeout(resolve, 80))
  } finally {
    globalThis.fetch = original
  }
})

test('AbortSignal.timeout is attached to webhook POST', async () => {
  const original = globalThis.fetch
  let seen
  globalThis.fetch = async (_url, opts) => {
    seen = opts.signal
    return new Response('ok', { status: 200 })
  }
  try {
    const ctx = context()
    apply(ctx, { webhooks: { custom: 'https://example.test/timeout' }, local: false, events: ['task_done'], timeoutMs: 1234 })
    const s = session('timeout-session')
    ctx.emit(s, { type: 'turn/start' })
    ctx.emit(s, { type: 'turn/end', data: { reason: { kind: 'completed' }, turn: 1 } })
    await waitFor(() => Boolean(seen))
    assert.equal(typeof seen.aborted, 'boolean')
    assert.equal(seen.aborted, false)
  } finally {
    globalThis.fetch = original
  }
})

test('excluded session prefixes suppress notifications', async () => {
  const posts = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    posts.push(opts)
    return new Response('ok', { status: 200 })
  }
  try {
    const ctx = context()
    apply(ctx, { webhooks: { custom: 'https://example.test/x' }, local: false, excludeSessionPrefixes: ['msgw-'] })
    const s = session('msgw-suppressed')
    ctx.emit(s, { type: 'turn/start' })
    ctx.emit(s, { type: 'turn/end', data: { reason: { kind: 'completed' }, turn: 1 } })
    await new Promise((resolve) => setTimeout(resolve, 80))
    assert.equal(posts.length, 0)
  } finally {
    globalThis.fetch = original
  }
})

test('Config schema validates sound, toast, and desktop notification fields with opt-in defaults', () => {
  const empty = Config({})
  assert.equal(empty.enableSound, false)
  assert.equal(empty.enableToasts, false)
  assert.equal(empty.enableDesktopNotifications, false)
  assert.equal(empty.notifyBackgroundOnly, false)

  const cfg = Config({
    enableSound: true,
    enableToasts: true,
    enableDesktopNotifications: true,
    notifyBackgroundOnly: true,
  })
  assert.equal(cfg.enableSound, true)
  assert.equal(cfg.enableToasts, true)
  assert.equal(cfg.enableDesktopNotifications, true)
  assert.equal(cfg.notifyBackgroundOnly, true)
})

test('SSE route registers on webServer, rejects untrusted requests, and handles trusted stream', async () => {
  let routeDef = null
  const ctx = context({
    webServer: {
      register(def) {
        routeDef = def
        return () => {}
      },
    },
  })
  apply(ctx, { local: false })
  assert.ok(routeDef, 'route should be registered')
  assert.equal(routeDef.kind, 'exact')
  assert.equal(routeDef.path, '/dsh-plugin-notify/events')

  // 1. Untrusted request (missing origin/sec-fetch-site/loopback) -> 403 Forbidden
  const untrustedRes = {
    statusCode: 0,
    writeHead(status) { untrustedRes.statusCode = status },
    end() {},
  }
  routeDef.handler({ method: 'GET', headers: {} }, untrustedRes)
  assert.equal(untrustedRes.statusCode, 403)

  // 2. Trusted request (same-origin sec-fetch-site) -> 200 Stream
  const headers = {}
  const chunks = []
  const listeners = {}

  const req = {
    method: 'GET',
    headers: { 'sec-fetch-site': 'same-origin' },
    on(evt, cb) { listeners[evt] = cb },
  }
  const res = {
    writeHead(status, hdrs) {
      res.statusCode = status
      Object.assign(headers, hdrs)
    },
    write(chunk) { chunks.push(chunk) },
    end() {},
    on(evt, cb) { listeners[evt] = cb },
  }

  routeDef.handler(req, res)
  assert.equal(res.statusCode, 200)
  assert.equal(headers['Content-Type'], 'text/event-stream')
  assert.equal(headers['Cache-Control'], 'no-cache, no-transform')
  assert.ok(chunks.some((c) => c.includes(': connected')))

  // Trigger turn/end event and verify broadcast
  const s = session('sse-test-session')
  ctx.emit(s, { type: 'turn/start' })
  ctx.emit(s, { type: 'turn/end', data: { reason: { kind: 'completed' }, turn: 1 } })

  assert.ok(chunks.some((c) => c.includes('"sessionId":"sse-test-session"') && c.includes('"kind":"task_done"')))

  // Clean close
  if (listeners.close) listeners.close()
})

test('client does not register settings.section slot (issue #16 fix)', () => {
  const registeredSlots = []
  const client = loadClient()
  const ctx = {
    locale: {
      bind: () => (k) => k,
      register: () => () => {},
    },
    effect: (cb) => cb(),
    slots: {
      inject(name, cb) {
        cb()
        return true
      },
      register(entry) {
        registeredSlots.push(entry)
      },
    },
  }
  client.apply(ctx)
  const hasSection = registeredSlots.some((s) => s.name === 'settings.section')
  const hasItem = registeredSlots.some((s) => s.name === 'settings.plugin.item')
  assert.equal(hasSection, false, 'settings.section must not be registered')
  assert.equal(hasItem, true, 'settings.plugin.item must be registered')
})

test('deliveries and warnings are routed through ctx.logger without console calls (issue #22 fix)', async () => {
  const ctx = context()
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('ok', { status: 200 })
  try {
    apply(ctx, { webhooks: { custom: 'https://example.test/logger' }, local: false })
    const s = session('logger-session')
    ctx.emit(s, { type: 'turn/start' })
    ctx.emit(s, { type: 'turn/end', data: { reason: { kind: 'completed' }, turn: 1 } })
    await new Promise((resolve) => setTimeout(resolve, 80))

    const allLogs = [...ctx.logs.debug, ...ctx.logs.info]
    assert.ok(allLogs.some((l) => l.includes('logger-session') && l.includes('task_done')), 'event delivery should be logged to ctx.logger')
  } finally {
    globalThis.fetch = original
  }
})

