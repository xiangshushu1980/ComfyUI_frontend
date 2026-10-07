// Owner: Sean. Shared v0.2 business contracts; GPU execution is replaced at its boundary.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from './store.mjs'
import { Execution } from './execution.mjs'
import { Workflows } from './workflows.mjs'
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'sean-workflow-')),
    store = new Store(join(dir, 'db.sqlite'))
  const execution = new Execution(store, dir, 'http://unused')
  execution.execute = async () => {}
  const workflows = new Workflows(store, execution)
  const project = store.transaction(() =>
    store.createProject({ name: 'Workflow test' })
  )
  return {
    store,
    execution,
    workflows,
    project,
    close() {
      workflows.stopped = true
      store.close()
    }
  }
}
test('novel chapters retain source ranges; resume Workflow and read latest context without copying whole novel', () => {
  const f = fixture(),
    { store, workflows: w, project: p } = f
  const novel = store.write('novel', { requestId: 'a' }, () =>
    w.structure(p.id, {
      name: '小说',
      text: '序言\n\n第一章 初见\n\n林乔走进值班室。\n\n第二章 归还\n\n铜钥匙交给周衡。'
    })
  )
  assert.equal(novel.chapters.length, 3)
  const chapter = novel.chapters[1]
  assert.match(novel.source.text.slice(chapter.start, chapter.end), /林乔/)
  assert.ok(chapter.anchorIds.length)
  const s = store.transaction(() =>
    w.open(p.id, { workflowId: 'ExtractEntities' })
  )
  assert.equal(
    store.transaction(() => w.open(p.id, { workflowId: 'ExtractEntities' })).id,
    s.id
  )
  assert.ok(w.context(s.id).objects.some((o) => o.id === chapter.id))
  assert.equal(
    w.context(s.id).objects.find((o) => o.kind === 'source').text,
    undefined
  )
  f.close()
})
test('chapter extraction supports individual human adoption and stable relationship endpoint mapping', () => {
  const f = fixture(),
    { store, workflows: w, project: p } = f
  const novel = store.transaction(() =>
    w.structure(p.id, { text: '第一章 初见\n\n林乔和周衡是同事。' })
  )
  const s = store.transaction(() =>
    w.open(p.id, { workflowId: 'ExtractEntities' })
  )
  const sources = [{ sourceId: novel.source.id, revision: 1, anchorId: 'P2' }]
  const result = w.operate(s.id, 'propose_entities', {
    requestId: 'extract',
    chapterId: novel.chapters[0].id,
    items: [
      { key: 'a', kind: 'entity', type: 'character', name: '林乔', sources },
      { key: 'b', kind: 'entity', type: 'character', name: '周衡', sources },
      {
        key: 'r',
        kind: 'relation',
        from: 'a',
        to: 'b',
        description: '同事',
        sources
      }
    ]
  })
  const confirm = (key) =>
    store.write('confirm:' + key, { requestId: key }, () =>
      w.confirmCandidate(result.proposal.id, {
        expectedHash: result.proposal.contentHash,
        selectedKeys: [key]
      })
    )
  const first = confirm('a')
  assert.equal(store.get(result.proposal.id).status, 'pending')
  confirm('b')
  const relation = confirm('r')
  assert.equal(relation.adopted[0].fromId, first.adopted[0].id)
  assert.equal(store.get(result.run.id).status, 'succeeded')
  assert.equal(
    store.list(p.id, 'data_relation').filter((r) => r.type === 'mentions')
      .length,
    2
  )
  assert.throws(
    () => w.operate(s.id, 'generate_concepts', { requestId: 'wrong' }),
    /scope|outside/
  )
  f.close()
})
test('bounded parallel concepts, durable provenance, confirmation-triggered serial threeview and no duplicate replay', () => {
  const f = fixture(),
    { store, workflows: w, project: p, execution } = f
  const entity = store.transaction(() =>
    store.create(p.id, 'entity', {
      name: '林乔',
      type: 'character',
      description: '黑色短发'
    })
  )
  const s = store.transaction(() =>
    w.open(p.id, { workflowId: 'CreateEntity', targetId: entity.id })
  )
  assert.throws(
    () => w.operate(s.id, 'generate_concepts', { requestId: 'no-grant' }),
    /authorization/
  )
  store.transaction(() =>
    w.authorize(s.id, { confirmed: true, conceptCount: 2, threeView: true })
  )
  const request = { requestId: 'concepts', seed: 42 }
  const run = w.operate(s.id, 'generate_concepts', request)
  assert.equal(run.childRunIds.length, 2)
  assert.equal(w.operate(s.id, 'generate_concepts', request).id, run.id)
  assert.throws(
    () =>
      w.operate(s.id, 'generate_concepts', { requestId: 'extra', count: 1 }),
    /authorization/
  )
  let asset
  store.transaction(() => {
    for (const id of run.childRunIds) {
      asset = store.create(p.id, 'asset', {
        runId: id,
        hash: 'a'.repeat(64),
        mime: 'image/png',
        sourceAssetIds: []
      })
      store.update(id, 1, { status: 'succeeded', outputs: [asset.id] })
    }
  })
  w.sync()
  assert.equal(store.get(run.id).status, 'waiting_confirmation')
  assert.equal(store.list(p.id, 'resource').length, 2)
  w.sync()
  assert.equal(store.list(p.id, 'resource').length, 2)
  const decision = store.write('appearance', { requestId: 'choose' }, () =>
    w.confirmAppearance(entity.id, { assetId: asset.id, expectedRevision: 1 })
  )
  assert.equal(decision.actor, 'human')
  const downstream = store
    .list(p.id, 'workflow_run')
    .find((r) => r.stage === 'threeview')
  assert.equal(downstream.parentRunId, run.id)
  const low = store.get(downstream.childRunIds[0])
  assert.equal(low.inputSnapshot.input.references[0].assetId, asset.id)
  assert.match(
    low.inputSnapshot.input.prompt,
    /Front View, Clean Side Profile, and Back View/
  )
  assert.equal(low.workflow.nodes.length, 10)
  assert.equal(
    low.workflow.nodes.find((n) => n.type === 'KSampler').widgets_values_named
      .control_after_generate,
    'fixed'
  )
  assert.equal(
    store.list(p.id, 'data_relation').some((r) => r.fromId === run.id),
    false
  )
  execution.update(low.id, { status: 'submission_unknown' })
  w.sync()
  assert.equal(store.get(downstream.id).status, 'submission_unknown')
  execution.update(low.id, { status: 'succeeded', outputs: [] })
  w.sync()
  assert.equal(store.get(downstream.id).status, 'succeeded')
  f.close()
})
test('legacy chapter identity survives migration and rerunning migration is harmless', () => {
  const f = fixture(),
    { store, workflows: w, project: p } = f
  const old = store.transaction(() =>
    store.create(p.id, 'chapter', { name: '## 第一章 初见', brief: '旧章节' })
  )
  const novel = store.transaction(() =>
    w.structure(p.id, { text: '# 第一章 初见\n\n林乔进门。' })
  )
  store.transaction(() => w.migrate(p.id))
  assert.equal(store.get(old.id).sourceId, novel.source.id)
  assert.equal(store.get(novel.chapters[0].id).supersededBy, old.id)
  const revision = store.get(old.id).revision
  store.transaction(() => w.migrate(p.id))
  assert.equal(store.get(old.id).revision, revision)
  f.close()
})
