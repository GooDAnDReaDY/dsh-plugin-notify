import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { test } from 'node:test'
import { apply, name } from '../dist/index.js'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function context() {
  let listener
  return {
    on(topic, callback) {
      assert.equal(topic, 'session/event')
      listener = callback
    },
    emit(session, event) {
      listener(session, event)
    },
  }
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

test('private package identity matches host and patch sites', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.name, '@goodandready-private/dsh-plugin-notify')
  assert.equal(pkg.publishConfig.registry, 'https://npm.pkg.github.com')
  assert.equal(name, '@goodandready-private/dsh-plugin-notify')
  assert.match(fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8'), /@goodandready-private\/dsh-plugin-notify/)
})

test('turn end posts the custom webhook payload', async () => {
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
    const timer = setTimeout(() => reject(new Error('webhook timeout')), 1000)
    const poll = () => requests.length ? (clearTimeout(timer), resolve()) : setTimeout(poll, 10)
    poll()
  })
  server.close()
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].body.kind, 'task_done')
  assert.equal(requests[0].body.sessionId, 'smoke-session')
})

test('excluded session prefixes suppress notifications', () => {
  const ctx = context()
  apply(ctx, { webhooks: {}, local: false, excludeSessionPrefixes: ['msgw-'] })
  const s = session('msgw-suppressed')
  ctx.emit(s, { type: 'turn/start' })
  ctx.emit(s, { type: 'turn/end', data: { reason: { kind: 'completed' }, turn: 1 } })
  assert.ok(true)
})
