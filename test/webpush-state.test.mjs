import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  generateVapidKeys,
  resolveStatePath,
  loadState,
  saveState,
  getVapidKeys,
  addSubscription,
  removeSubscription,
  listSubscriptions,
  VAPID_PUBLIC_ENV,
  VAPID_PRIVATE_ENV,
} from '../lib/index.js'

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pn-webpush-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

const BASE64URL = /^[A-Za-z0-9_-]+$/

test('generateVapidKeys returns base64url P-256 keys', () => {
  const keys = generateVapidKeys()
  assert.match(keys.publicKey, BASE64URL)
  assert.match(keys.privateKey, BASE64URL)
  // Raw uncompressed point (65 bytes → 87 base64url chars) and raw scalar
  // (32 bytes → 43 chars) — the shapes web-push and applicationServerKey expect.
  assert.equal(keys.publicKey.length, 87)
  assert.equal(keys.privateKey.length, 43)
  // Two calls never collide.
  const again = generateVapidKeys()
  assert.notEqual(again.publicKey, keys.publicKey)
})

test('resolveStatePath: explicit stateFile wins, then DSH_HOME, then ~/.dsh', (t) => {
  const prevHome = process.env.DSH_HOME
  t.after(() => {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  })

  assert.equal(resolveStatePath({ stateFile: ' /tmp/x/state.json ' }), path.normalize('/tmp/x/state.json'))

  process.env.DSH_HOME = '/tmp/dsh-home'
  // Relative path is resolved against DSH_HOME
  assert.equal(resolveStatePath({ stateFile: 'custom-state.json' }), path.join('/tmp/dsh-home', 'custom-state.json'))
  assert.equal(resolveStatePath({}), path.join('/tmp/dsh-home', 'plugin-notify-state.json'))
  assert.equal(resolveStatePath(), path.join('/tmp/dsh-home', 'plugin-notify-state.json'))

  delete process.env.DSH_HOME
  assert.equal(resolveStatePath({}), path.join(os.homedir(), '.dsh', 'plugin-notify-state.json'))
})

test('loadState tolerates missing and corrupted files', async (t) => {
  const dir = tempDir(t)
  const missing = await loadState(path.join(dir, 'nope.json'))
  assert.deepEqual(missing, { vapid: null, subscriptions: [] })

  const corrupted = path.join(dir, 'bad.json')
  fs.writeFileSync(corrupted, '{ not json', 'utf8')
  assert.deepEqual(await loadState(corrupted), { vapid: null, subscriptions: [] })
})

test('saveState round-trips and leaves no temp files behind', async (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 'state.json')
  await saveState(file, { vapid: { publicKey: 'pub', privateKey: 'priv' }, subscriptions: [] })
  const loaded = await loadState(file)
  assert.equal(loaded.vapid.publicKey, 'pub')
  const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp'))
  assert.deepEqual(leftovers, [])
})

test('getVapidKeys generates once, persists, then reuses', async (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 'state.json')
  const ctx = { logger: { info() {}, warn() {} } }

  const first = await getVapidKeys(ctx, { stateFile: file })
  assert.ok(first.publicKey && first.privateKey)
  const savedAt = fs.statSync(file).mtimeMs

  const second = await getVapidKeys(ctx, { stateFile: file })
  assert.equal(second.publicKey, first.publicKey)
  assert.equal(second.privateKey, first.privateKey)
  // No regeneration rewrite on the second call.
  assert.equal(fs.statSync(file).mtimeMs, savedAt)
})

test('getVapidKeys env override wins over the state file', async (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 'state.json')
  const prev = { pub: process.env[VAPID_PUBLIC_ENV], priv: process.env[VAPID_PRIVATE_ENV] }
  process.env[VAPID_PUBLIC_ENV] = 'env-public-key'
  process.env[VAPID_PRIVATE_ENV] = 'env-private-key'
  t.after(() => {
    if (prev.pub === undefined) delete process.env[VAPID_PUBLIC_ENV]
    else process.env[VAPID_PUBLIC_ENV] = prev.pub
    if (prev.priv === undefined) delete process.env[VAPID_PRIVATE_ENV]
    else process.env[VAPID_PRIVATE_ENV] = prev.priv
  })

  const keys = await getVapidKeys(null, { stateFile: file })
  assert.equal(keys.publicKey, 'env-public-key')
  assert.equal(keys.privateKey, 'env-private-key')
  // Env mode must not create the state file.
  assert.equal(fs.existsSync(file), false)
})

function validSub(endpoint = 'https://fcm.googleapis.com/fcm/send/abc') {
  return { endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }
}

test('addSubscription validates and dedupes by endpoint', async (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 'state.json')

  await assert.rejects(() => addSubscription(file, { endpoint: 'http://insecure/abc', keys: { p256dh: 'a', auth: 'b' } }))
  await assert.rejects(() => addSubscription(file, { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: {} }))

  assert.equal(await addSubscription(file, validSub()), 1)
  assert.equal(await addSubscription(file, validSub()), 1)
  assert.equal(await addSubscription(file, validSub('https://updates.push.services.mozilla.com/wpush/v2/second')), 2)

  const subs = await listSubscriptions(file)
  assert.equal(subs.length, 2)
  assert.equal(subs[0].endpoint, 'https://fcm.googleapis.com/fcm/send/abc')
})

test('removeSubscription removes and reports', async (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 'state.json')
  await addSubscription(file, validSub())

  assert.equal(await removeSubscription(file, 'https://fcm.googleapis.com/fcm/send/abc'), 1)
  assert.equal(await removeSubscription(file, 'https://fcm.googleapis.com/fcm/send/abc'), 0)
  assert.deepEqual(await listSubscriptions(file), [])
})

test('concurrent saveState calls serialize into a valid file', async (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 'state.json')
  await Promise.all(
    Array.from({ length: 12 }, (_, i) => saveState(file, { vapid: null, subscriptions: [{ endpoint: `https://fcm.googleapis.com/fcm/send/${i}`, keys: { p256dh: 'x', auth: 'y' }, addedAt: i }] })),
  )
  const subs = await listSubscriptions(file)
  assert.equal(subs.length, 1)
})

test('addSubscription strictly rejects SSRF, loopback, private IPs, userinfo, and unapproved hosts', async (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 'state.json')

  // Loopback and internal IPs
  await assert.rejects(() => addSubscription(file, validSub('https://127.0.0.1/push')), /allowed push service/)
  await assert.rejects(() => addSubscription(file, validSub('https://localhost/push')), /allowed push service/)
  await assert.rejects(() => addSubscription(file, validSub('https://10.0.0.1/push')), /allowed push service/)
  await assert.rejects(() => addSubscription(file, validSub('https://192.168.1.1/push')), /allowed push service/)
  await assert.rejects(() => addSubscription(file, validSub('https://169.254.169.254/latest')), /allowed push service/)
  await assert.rejects(() => addSubscription(file, validSub('https://[::1]/push')), /allowed push service/)

  // Attacker / exfil domains
  await assert.rejects(() => addSubscription(file, validSub('https://attacker.example/exfil')), /allowed push service/)
  await assert.rejects(() => addSubscription(file, validSub('https://evil.com/fcm.googleapis.com')), /allowed push service/)

  // Credentials / userinfo in URL
  await assert.rejects(() => addSubscription(file, validSub('https://user:pass@fcm.googleapis.com/push')), /allowed push service/)

  // Non-standard port
  await assert.rejects(() => addSubscription(file, validSub('https://fcm.googleapis.com:8443/push')), /allowed push service/)

  // Insecure scheme
  await assert.rejects(() => addSubscription(file, validSub('http://fcm.googleapis.com/push')), /allowed push service/)

  // Legitimate providers accepted
  assert.equal(await addSubscription(file, validSub('https://fcm.googleapis.com/fcm/send/1')), 1)
  assert.equal(await addSubscription(file, validSub('https://updates.push.services.mozilla.com/wpush/v2/1')), 2)
  assert.equal(await addSubscription(file, validSub('https://web.push.apple.com/QC8')), 3)
  assert.equal(await addSubscription(file, validSub('https://db5p.notify.windows.com/w/?token=1')), 4)

  // Custom allowedHosts honored
  await assert.rejects(() => addSubscription(file, validSub('https://custom.corp.push/endpoint')), /allowed push service/)
  assert.equal(await addSubscription(file, validSub('https://custom.corp.push/endpoint'), ['custom.corp.push']), 5)
  assert.equal(await addSubscription(file, validSub('https://sub.mycorp.push/endpoint'), ['*.mycorp.push']), 6)
})

test('addSubscription enforces subscription capacity bound (max 100)', async (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 'state.json')

  // Set tight limit of 3 for testing bound
  assert.equal(await addSubscription(file, validSub('https://fcm.googleapis.com/fcm/send/1'), [], 3), 1)
  assert.equal(await addSubscription(file, validSub('https://fcm.googleapis.com/fcm/send/2'), [], 3), 2)
  assert.equal(await addSubscription(file, validSub('https://fcm.googleapis.com/fcm/send/3'), [], 3), 3)

  // Existing endpoint can still be updated
  assert.equal(await addSubscription(file, validSub('https://fcm.googleapis.com/fcm/send/2'), [], 3), 3)

  // 4th distinct endpoint rejected with limit error
  await assert.rejects(
    () => addSubscription(file, validSub('https://fcm.googleapis.com/fcm/send/4'), [], 3),
    /limit reached/
  )
})
