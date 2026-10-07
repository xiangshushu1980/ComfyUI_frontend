// Owner: Sean. No model/GPU calls: action semantics and uncertain submission boundaries.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store, hash } from './store.mjs'
import { Execution } from './execution.mjs'
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'sean-action-')),
    s = new Store(join(dir, 'test.sqlite'))
  const p = s.transaction(() => s.createProject({ name: 'action test' })),
    e = s.transaction(() =>
      s.create(p.id, 'entity', { type: 'character', name: 'test' })
    ),
    execution = new Execution(s, dir, 'http://unused')
  let submits = 0
  execution.execute = () => {
    submits++
  }
  const i = s.transaction(() =>
      execution.createInput(e.id, { entityRevision: 1, prompt: 'test' })
    ),
    preview = execution.preview(i.id)
  execution.verify(i.id, {
    workflow: {
      nodes: Object.entries(preview.graph).map(([id, n]) => ({
        id: Number(id),
        type: n.class_type,
        widgets_values: id === '9' ? [n.inputs.filename_prefix] : []
      }))
    },
    output: preview.graph
  })
  return { s, p, e, execution, i, submits: () => submits }
}
test('explicit once, verified input and one active local run; repeated consume returns original', () => {
  const { s, execution, i, submits } = fixture()
  assert.throws(
    () =>
      s.transaction(() =>
        execution.authorize(i.id, { inputRevision: 1, inputHash: i.inputHash })
      ),
    /explicit/
  )
  const a = s.transaction(() =>
    execution.authorize(i.id, {
      inputRevision: 1,
      inputHash: i.inputHash,
      authorizedOnce: true
    })
  )
  const run = execution.consume(a.id)
  assert.equal(submits(), 1)
  assert.equal(execution.consume(a.id).id, run.id)
  assert.equal(submits(), 1)
  const b = s.transaction(() =>
    execution.authorize(i.id, {
      inputRevision: 1,
      inputHash: i.inputHash,
      authorizedOnce: true
    })
  )
  execution.update(run.id, { status: 'submission_unknown' })
  assert.throws(() => execution.consume(b.id), /one local active/)
  assert.equal(s.get(b.id).status, 'authorized')
  s.close()
})
test('expired action rejected and reference bytes use actual SHA256', () => {
  const { s, execution, i } = fixture()
  const a = s.transaction(() =>
    execution.authorize(i.id, {
      inputRevision: 1,
      inputHash: i.inputHash,
      authorizedOnce: true
    })
  )
  s.transaction(() => s.update(a.id, 1, { expiresAt: 0 }))
  assert.throws(() => execution.consume(a.id), /expired/)
  assert.equal(
    hash(Buffer.from('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  )
  s.close()
})
test('unknown submission only reconciles original execution key and never reposts', async () => {
  const { s, execution, i } = fixture()
  const a = s.transaction(() =>
      execution.authorize(i.id, {
        inputRevision: 1,
        inputHash: i.inputHash,
        authorizedOnce: true
      })
    ),
    run = execution.consume(a.id)
  let posts = 0
  execution.comfy = async (path, body) => {
    if (body) posts++
    return path === '/queue' ? { queue_running: [], queue_pending: [] } : {}
  }
  execution.update(run.id, { status: 'submission_unknown' })
  await execution.reconcile(run.id)
  assert.equal(s.get(run.id).status, 'submission_unknown')
  assert.equal(posts, 0)
  s.close()
})
test('new input revokes previous unconsumed generation authorization', () => {
  const { s, execution, i, e, submits } = fixture()
  const action = s.transaction(() => execution.authorize(i.id, {
    inputRevision: i.revision, inputHash: i.inputHash, authorizedOnce: true
  }))
  s.transaction(() => execution.createInput(e.id, {
    entityRevision: e.revision, prompt: 'changed input'
  }))
  assert.equal(s.get(action.id).status, 'revoked')
  assert.throws(() => execution.consume(action.id), /revoked/)
  assert.equal(submits(), 0)
  s.close()
})
