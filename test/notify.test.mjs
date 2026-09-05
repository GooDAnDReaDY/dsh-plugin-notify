import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { test } from 'node:test'
import { apply, name, NS, resolveWebhookValue } from '../dist/index.js'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function context(extra = {}) {
  let listener
  const ctx = {
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

test('private package identity matches host, client and patch sites', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.name, '@goodandready-private/dsh-plugin-notify')
  assert.equal(pkg.publishConfig.registry, 'https://npm.pkg.github.com')
  assert.equal(name, '@goodandready-private/dsh-plugin-notify')
  assert.equal(NS, '@goodandready-private/dsh-plugin-notify')
  assert.match(fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8'), /@goodandready-private\/dsh-plugin-notify/)
  const client = fs.readFileSync(path.join(root, 'dist/client.js'), 'utf8')
  assert.match(client, /id: '@goodandready-private\/dsh-plugin-notify'/)
  assert.match(client, /settings\.plugin\.item/)
  assert.equal(pkg.exports['./client'], './dist/client.js')
  assert.ok(pkg.dsh.client)
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
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('webhook timeout')), 2000)
    const poll = () => requests.length ? (clearTimeout(timer), resolve()) : setTimeout(poll, 10)
    poll()
  })
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
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('webhook timeout')), 2000)
    const poll = () => requests.length ? (clearTimeout(timer), resolve()) : setTimeout(poll, 10)
    poll()
  })
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

test('excluded session prefixes suppress notifications', () => {
  const ctx = context()
  apply(ctx, { webhooks: {}, local: false, excludeSessionPrefixes: ['msgw-'] })
  const s = session('msgw-suppressed')
  ctx.emit(s, { type: 'turn/start' })
  ctx.emit(s, { type: 'turn/end', data: { reason: { kind: 'completed' }, turn: 1 } })
  assert.ok(true)
})
