// Owner: Sean. Direct native input must retain project and one-use action boundaries.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from './store.mjs'
import { PiBridge } from './pi-bridge.mjs'
test('PiWeb input binds context and takes pending authorization once; wrong sessions and overlapping turns fail', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sean-direct-'))
  const store = new Store(join(dir, 'test.sqlite'))
  const { d, a } = store.transaction(() => {
    const p = store.createProject({ name: 'direct input' })
    const a = store.create(p.id, 'action', {
      status: 'authorized',
      expiresAt: Date.now() + 10000
    })
    const d = store.create(p.id, 'discussion', {
      links: [],
      pendingActionId: a.id
    })
    store.create(p.id, 'pi_binding', {
      discussionId: d.id,
      sessionId: 'native',
      capability: 'secret',
      guardVersion: 1
    })
    return { d, a }
  })
  const pi = new PiBridge(store, dir)
  assert.throws(
    () => pi.directInput('secret', { sessionId: 'foreign', text: 'x' }),
    /invalid session capability/
  )
  const turn = pi.directInput('secret', {
    sessionId: 'native',
    text: 'generate'
  })
  assert.equal(turn.actionId, a.id)
  assert.equal(store.get(d.id).pendingActionId, null)
  assert.throws(
    () => pi.directInput('secret', { sessionId: 'native', text: 'duplicate' }),
    /active/
  )
  assert.throws(
    () =>
      pi.directEnd('secret', {
        sessionId: 'native',
        turnId: turn.id,
        receipt: 'wrong'
      }),
    /receipt/
  )
  const business = store.transaction(() => {
    const child = store.create(d.projectId, 'run', {
      status: 'failed',
      error: 'CUDA unavailable'
    })
    return store.create(d.projectId, 'workflow_run', {
      status: 'failed',
      childRunIds: [child.id]
    })
  })
  const result = pi.tool('secret', {
    sessionId: 'native',
    turnId: turn.id,
    receipt: turn.receipt,
    tool: 'get_run',
    args: { runId: business.id }
  })
  assert.equal(result.children[0].error, 'CUDA unavailable')
  assert.throws(
    () =>
      pi.tool('secret', {
        sessionId: 'native',
        turnId: turn.id,
        receipt: turn.receipt,
        tool: 'get_run',
        args: { runId: d.id }
      }),
    /Run required/
  )
  pi.directEnd('secret', {
    sessionId: 'native',
    turnId: turn.id,
    receipt: turn.receipt
  })
  assert.equal(
    pi.directInput('secret', { sessionId: 'native', text: 'next' }).actionId,
    null
  )
  store.close()
})
