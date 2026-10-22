import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  apply,
  settleWebPushDeliveries,
  addSubscription,
  listSubscriptions,
  saveState,
  setWebPushLibrary,
  sseClients,
} from '../lib/index.js'

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pn-dispatch-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function fakeCtx() {
  const handlers = {}
  return {
    handlers,
    routes: [],
    logger: { info() {}, warn() {}, debug() {}, error() {} },
    on(ev, fn) {
      handlers[ev] = fn
    },
    effect(fn) {
      // Match production semantics: registering an effect runs its setup now.
      const cleanup = fn()
      if (typeof cleanup === 'function') cleanup()
    },
    inject() {},
    webServer: {
      register(route) {
        this.routes.push(route)
        return () => {}
      },
      routes: [],
    },
  }
}

function sessionFixture(id = 'sess-1') {
  return {
    id,
    events: [{ type: 'user/message', data: { content: 'do the thing' } }],
  }
}

async function until(fn, ms = 2000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (await fn()) return true
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
  return Boolean(await fn())
}

test.beforeEach(() => {
  sseClients.clear()
})

test.afterEach(() => {
  sseClients.clear()
})

const SUB = { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/dev', keys: { p256dh: 'p', auth: 'a' } }

test('web push delivers approval requests to stored subscriptions', async (t) => {
  const dir = tempDir(t)
  const stateFile = path.join(dir, 'state.json')
  await addSubscription(stateFile, SUB)

  const sends = []
  setWebPushLibrary({ sendNotification: async (sub, payload, opts) => { sends.push({ sub, payload, opts }) } })
  t.after(() => setWebPushLibrary(null))

  const ctx = fakeCtx()
  apply(ctx, { webPush: { enabled: true, onlyWhenAway: true, stateFile } })

  ctx.handlers['session/event'](sessionFixture(), {
    type: 'approval/asked',
    data: { toolName: 'bash', reason: 'runs rm -rf' },
  })

  assert.ok(await until(() => sends.length > 0), 'push should be sent')
  assert.equal(sends.length, 1)
  assert.equal(sends[0].sub.endpoint, 'https://updates.push.services.mozilla.com/wpush/v2/dev')
  const payload = JSON.parse(sends[0].payload)
  assert.equal(payload.kind, 'approval_requested')
  assert.equal(payload.sessionId, 'sess-1')
  assert.ok(payload.title.includes('Approval'))
  assert.ok(payload.body.includes('bash'))
  assert.ok(sends[0].opts.vapidDetails.publicKey)
})

test('turn completion produces a task_done push honoring text options', async (t) => {
  const dir = tempDir(t)
  const stateFile = path.join(dir, 'state.json')
  await addSubscription(stateFile, SUB)

  const sends = []
  setWebPushLibrary({ sendNotification: async (sub, payload) => { sends.push({ sub, payload }) } })
  t.after(() => setWebPushLibrary(null))

  const ctx = fakeCtx()
  apply(ctx, { webPush: { enabled: true, stateFile }, includeDuration: true })

  ctx.handlers['session/event'](sessionFixture(), {
    type: 'turn/start',
    data: {},
  })
  ctx.handlers['session/event'](sessionFixture(), {
    type: 'turn/end',
    data: { turn: 1, reason: { kind: 'completed' } },
  })

  assert.ok(await until(() => sends.length > 0))
  const payload = JSON.parse(sends[0].payload)
  assert.equal(payload.kind, 'task_done')
})

test('onlyWhenAway skips push while a browser client is connected', async (t) => {
  const dir = tempDir(t)
  const stateFile = path.join(dir, 'state.json')
  await addSubscription(stateFile, SUB)

  const sends = []
  setWebPushLibrary({ sendNotification: async (sub, payload) => { sends.push(payload) } })
  t.after(() => setWebPushLibrary(null))

  const ctx = fakeCtx()
  apply(ctx, { webPush: { enabled: true, onlyWhenAway: true, stateFile } })

  const fakeStream = { write() {}, end() {}, on() {} }
  sseClients.add(fakeStream)
  ctx.handlers['session/event'](sessionFixture(), {
    type: 'approval/asked',
    data: { toolName: 'bash' },
  })
  await settleWebPushDeliveries()
  assert.equal(sends.length, 0)
})

test('onlyWhenAway=false pushes even with clients connected', async (t) => {
  const dir = tempDir(t)
  const stateFile = path.join(dir, 'state.json')
  await addSubscription(stateFile, SUB)

  const sends = []
  setWebPushLibrary({ sendNotification: async (sub, payload) => { sends.push(payload) } })
  t.after(() => setWebPushLibrary(null))

  const ctx = fakeCtx()
  apply(ctx, { webPush: { enabled: true, onlyWhenAway: false, stateFile } })

  sseClients.add({ write() {}, end() {}, on() {} })
  ctx.handlers['session/event'](sessionFixture(), {
    type: 'approval/asked',
    data: { toolName: 'bash' },
  })
  assert.ok(await until(() => sends.length > 0))
})

test('disabled web push never sends', async (t) => {
  const dir = tempDir(t)
  const stateFile = path.join(dir, 'state.json')
  await addSubscription(stateFile, SUB)

  const sends = []
  setWebPushLibrary({ sendNotification: async (sub, payload) => { sends.push(payload) } })
  t.after(() => setWebPushLibrary(null))

  const ctx = fakeCtx()
  apply(ctx, { webPush: { enabled: false, stateFile } })

  ctx.handlers['session/event'](sessionFixture(), {
    type: 'approval/asked',
    data: { toolName: 'bash' },
  })
  await settleWebPushDeliveries()
  assert.equal(sends.length, 0)
})

test('DND window suppresses push like every other channel', async (t) => {
  const dir = tempDir(t)
  const stateFile = path.join(dir, 'state.json')
  await addSubscription(stateFile, SUB)

  const sends = []
  setWebPushLibrary({ sendNotification: async (sub, payload) => { sends.push(payload) } })
  t.after(() => setWebPushLibrary(null))

  const ctx = fakeCtx()
  apply(ctx, { webPush: { enabled: true, stateFile }, dnd: { start: '00:00', end: '23:59' } })

  ctx.handlers['session/event'](sessionFixture(), {
    type: 'approval/asked',
    data: { toolName: 'bash' },
  })
  await settleWebPushDeliveries()
  assert.equal(sends.length, 0)
})

test('event filter and session-prefix exclusions apply to push', async (t) => {
  const dir = tempDir(t)
  const stateFile = path.join(dir, 'state.json')
  await addSubscription(stateFile, SUB)

  const sends = []
  setWebPushLibrary({ sendNotification: async (sub, payload) => { sends.push(payload) } })
  t.after(() => setWebPushLibrary(null))

  const ctx = fakeCtx()
  apply(ctx, {
    webPush: { enabled: true, stateFile },
    events: ['task_done'],
    excludeSessionPrefixes: ['msgw-'],
  })

  // approval_requested is filtered out by the events whitelist.
  ctx.handlers['session/event'](sessionFixture(), {
    type: 'approval/asked',
    data: { toolName: 'bash' },
  })
  // msgw- prefixed sessions are excluded entirely.
  ctx.handlers['session/event'](sessionFixture('msgw-7'), {
    type: 'turn/end',
    data: { turn: 1, reason: { kind: 'completed' } },
  })
  await settleWebPushDeliveries()
  assert.equal(sends.length, 0)
})

test('dead subscriptions (404/410) are pruned, live failures are not', async (t) => {
  const dir = tempDir(t)
  const stateFile = path.join(dir, 'state.json')
  await addSubscription(stateFile, SUB)
  await addSubscription(stateFile, { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/gone', keys: { p256dh: 'p', auth: 'a' } })

  const errors = { 'https://updates.push.services.mozilla.com/wpush/v2/gone': Object.assign(new Error('gone'), { statusCode: 410 }) }
  setWebPushLibrary({
    sendNotification: async (sub) => {
      if (errors[sub.endpoint]) throw errors[sub.endpoint]
    },
  })
  t.after(() => setWebPushLibrary(null))

  const ctx = fakeCtx()
  apply(ctx, { webPush: { enabled: true, stateFile } })

  ctx.handlers['session/event'](sessionFixture(), {
    type: 'approval/asked',
    data: { toolName: 'bash' },
  })

  assert.ok(await until(() => listSubscriptions(stateFile).then((s) => s.length === 1)))
  await settleWebPushDeliveries()
  const remaining = await listSubscriptions(stateFile)
  assert.equal(remaining[0].endpoint, 'https://updates.push.services.mozilla.com/wpush/v2/dev')
})

test('no subscriptions means no sends and no errors', async (t) => {
  const dir = tempDir(t)
  const sends = []
  setWebPushLibrary({ sendNotification: async (sub, payload) => { sends.push(payload) } })
  t.after(() => setWebPushLibrary(null))

  const ctx = fakeCtx()
  apply(ctx, { webPush: { enabled: true, stateFile: path.join(dir, 'empty.json') } })

  ctx.handlers['session/event'](sessionFixture(), {
    type: 'approval/asked',
    data: { toolName: 'bash' },
  })
  await settleWebPushDeliveries()
  assert.equal(sends.length, 0)
})

test('deliverWebPush ignores and prunes disallowed endpoints without sending', async (t) => {
  const dir = tempDir(t)
  const stateFile = path.join(dir, 'state.json')

  // Seed state file directly with an attacker SSRF endpoint and a legitimate endpoint
  await saveState(stateFile, {
    vapid: null,
    subscriptions: [
      { endpoint: 'https://attacker.example/exfil', keys: { p256dh: 'a', auth: 'b' } },
      { endpoint: 'https://127.0.0.1:443/internal', keys: { p256dh: 'a', auth: 'b' } },
      { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/legit', keys: { p256dh: 'p', auth: 'a' } },
    ],
  })

  const sends = []
  setWebPushLibrary({ sendNotification: async (sub, payload, opts) => { sends.push(sub.endpoint) } })
  t.after(() => setWebPushLibrary(null))

  const ctx = fakeCtx()
  apply(ctx, { webPush: { enabled: true, onlyWhenAway: true, stateFile } })

  ctx.handlers['session/event'](sessionFixture(), {
    type: 'approval/asked',
    data: { toolName: 'bash', reason: 'runs safe command' },
  })

  assert.ok(await until(() => sends.length > 0), 'push should be sent to legitimate endpoint')
  assert.deepEqual(sends, ['https://updates.push.services.mozilla.com/wpush/v2/legit'])

  const remaining = await listSubscriptions(stateFile)
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].endpoint, 'https://updates.push.services.mozilla.com/wpush/v2/legit')
})
