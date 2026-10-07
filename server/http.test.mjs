// Owner: Sean. Exercise the public/private gateway boundary over real HTTP.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStudioServer } from './index.mjs'
test('native shared writes denied, private settings persist, public snapshots redact capabilities', async () => {
  const { server, store } = createStudioServer({
    dataDir: mkdtempSync(join(tmpdir(), 'sean-http-'))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const root = 'http://127.0.0.1:' + server.address().port
  try {
    for (const path of [
      '/api/prompt',
      '/api/interrupt',
      '/api/free',
      '/api/manager/install',
      '/upload/image'
    ]) {
      const r = await fetch(root + path, { method: 'POST', body: '{}' })
      assert.equal(r.status, 403, path)
    }
    const settings = await fetch(root + '/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ private: true })
    })
    assert.equal(settings.status, 200)
    assert.equal(
      (await (await fetch(root + '/api/settings')).json()).private,
      true
    )
    const p = store.transaction(() => store.createProject({ name: 'test' }))
    store.transaction(() =>
      store.create(p.id, 'pi_binding', {
        capability: 'must-not-leak',
        cwd: '/private/path'
      })
    )
    const snap = await (
      await fetch(root + '/studio-api/v1/projects/' + p.id + '/snapshot')
    ).text()
    assert.ok(!snap.includes('must-not-leak'))
    assert.ok(!snap.includes('/private/path'))
    const events = await (
      await fetch(root + '/studio-api/v1/projects/' + p.id + '/events')
    ).text()
    assert.ok(!events.includes('must-not-leak'))
    const hostile = await fetch(root + '/studio-api/v1/projects', {
      method: 'POST',
      headers: {
        origin: 'https://evil.test',
        'content-type': 'application/json'
      },
      body: '{}'
    })
    assert.equal(hostile.status, 403)
  } finally {
    await new Promise((r) => server.close(r))
  }
})
