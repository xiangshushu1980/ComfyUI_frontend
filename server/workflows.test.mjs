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
test('canvas deletes persisted node kinds independently and only hides active Run nodes', () => {
  const f = fixture(),
    { store, workflows: w, project: p } = f
  const entity = store.transaction(() =>
    store.create(p.id, 'entity', {
      name: '齿轮',
      type: 'prop',
      description: '黄铜齿轮'
    })
  )
  const asset = store.transaction(() =>
    store.create(p.id, 'asset', {
      runId: 'finished-concept-run',
      hash: 'b'.repeat(64),
      mime: 'image/png',
      sourceAssetIds: []
    })
  )
  const finishedRun = store.transaction(() =>
    store.create(p.id, 'workflow_run', {
      targetEntityId: entity.id,
      stage: 'concept',
      status: 'succeeded'
    })
  )
  store.transaction(() =>
    store.update(asset.id, asset.revision, { runId: finishedRun.id })
  )
  const brief = store.transaction(() =>
    store.create(p.id, 'resource', {
      entityId: entity.id,
      role: 'concept_brief',
      type: 'text',
      text: '独立设计说明',
      conceptId: 1,
      conceptPlanId: 'plan:delete-test',
      status: 'available'
    })
  )
  const prompt = store.transaction(() =>
    store.create(p.id, 'resource', {
      entityId: entity.id,
      role: 'concept_prompt',
      type: 'text',
      text: 'independent prompt',
      conceptPlanId: brief.conceptPlanId,
      sourceResourceIds: [brief.id],
      status: 'available'
    })
  )
  const image = store.transaction(() =>
    store.create(p.id, 'resource', {
      entityId: entity.id,
      role: 'concept',
      type: 'image',
      assetId: asset.id,
      workflowRunId: finishedRun.id,
      sourceResourceIds: [brief.id, prompt.id],
      status: 'candidate'
    })
  )

  w.removeCanvasNode(p.id, brief.id, { expectedRevision: brief.revision })
  assert.equal(store.get(brief.id).status, 'removed')
  assert.equal(store.get(prompt.id).status, 'removed')
  assert.equal(store.get(image.id).status, 'candidate')
  assert.equal(store.get(finishedRun.id).status, 'succeeded')

  w.removeCanvasNode(p.id, image.id, { expectedRevision: image.revision })
  assert.equal(store.get(image.id).status, 'removed')
  assert.equal(store.get(finishedRun.id).status, 'succeeded')

  const activeRun = store.transaction(() =>
    store.create(p.id, 'workflow_run', { stage: 'concept', status: 'running' })
  )
  const hidden = w.removeCanvasNode(p.id, activeRun.id, {
    expectedRevision: activeRun.revision
  })
  assert.equal(hidden.status, 'running')
  assert.equal(hidden.canvasHidden, true)

  const extensionNode = store.transaction(() =>
    store.create(p.id, 'custom_canvas_node', { status: 'available' })
  )
  w.removeCanvasNode(p.id, extensionNode.id, {
    expectedRevision: extensionNode.revision
  })
  assert.equal(store.get(extensionNode.id).status, 'removed')
  assert.throws(() =>
    w.removeCanvasNode(p.id, p.id, { expectedRevision: p.revision })
  )

  f.close()
})
test('confirmed discussion rationale survives a removed conversation and is available to a fresh Workflow', () => {
  const f = fixture(), { store, workflows: w, project: p } = f
  store.updateProjectSettings(p.id, p.revision, {
    visualStyle: {
      text: 'Confirmed watercolor style',
      presetId: 'watercolor_illustration',
      confirmed: true,
      revision: 1
    }
  })
  const entity = store.transaction(() =>
    store.create(p.id, 'entity', { name: '测试角色', type: 'character' })
  )
  const first = store.transaction(() =>
    w.open(p.id, {
      workflowId: 'CreateEntity',
      targetId: entity.id,
      goal: '概念图生成'
    })
  )
  store.transaction(() =>
    w.authorize(first.id, { confirmed: true, conceptCount: 1 })
  )
  const plan = w.operate(first.id, 'prepare_concept', {
    requestId: 'decision-plan',
    confirmedPlan: true,
    description: '半身构图，蓝围巾和酒红夹克',
    decisionNote: '保留蓝围巾作为身份线索；拳击感仅用训练夹克表达，避免添加手套和场景。',
    prompt: 'Half-body watercolor character with a blue scarf and burgundy jacket.',
    referenceIds: []
  })
  assert.equal(plan.brief.description, '保留蓝围巾作为身份线索；拳击感仅用训练夹克表达，避免添加手套和场景。')
  w.updateEntityResource(p.id, entity.id, {
    resourceId: plan.brief.id,
    expectedRevision: plan.brief.revision,
    fields: {
      text: plan.brief.text,
      description: '用户确认：拳击感由夹克传达，避免手套、器械和比赛场景。'
    }
  })
  assert.equal(store.get(plan.prompt.id).status, 'available')

  store.transaction(() => w.close(first.id))
  const second = store.transaction(() =>
    w.open(p.id, {
      workflowId: 'CreateEntity',
      targetId: entity.id,
      goal: '概念图生成'
    })
  )
  assert.notEqual(second.id, first.id)
  assert.notEqual(second.discussionId, first.discussionId)
  const recoveredBrief = w.context(second.id).objects.find(
    (object) => object.id === plan.brief.id
  )
  assert.equal(recoveredBrief.description, '用户确认：拳击感由夹克传达，避免手套、器械和比赛场景。')
  assert.equal(recoveredBrief.text, plan.brief.text)
  assert.ok(w.context(second.id).objects.some((object) => object.id === plan.prompt.id))
  f.close()
})
test('editing concept description invalidates its prompt until the prompt is refreshed', () => {
  const f = fixture(),
    { store, workflows: w, project: p } = f
  const entity = store.transaction(() =>
    store.create(p.id, 'entity', { name: '测试实体', type: 'character' })
  )
  const brief = store.transaction(() =>
    store.create(p.id, 'resource', {
      entityId: entity.id,
      role: 'concept_brief',
      type: 'text',
      text: '旧设计说明',
      conceptPlanId: 'plan:test',
      status: 'available'
    })
  )
  const prompt = store.transaction(() =>
    store.create(p.id, 'resource', {
      entityId: entity.id,
      role: 'concept_prompt',
      type: 'text',
      text: 'old prompt',
      sourceResourceIds: [brief.id],
      conceptPlanId: brief.conceptPlanId,
      status: 'available'
    })
  )

  w.updateEntityResource(p.id, entity.id, {
    resourceId: brief.id,
    expectedRevision: brief.revision,
    fields: { text: '更新后的设计说明' }
  })
  assert.equal(store.get(prompt.id).status, 'needs_refresh')

  const stalePrompt = store.get(prompt.id)
  w.updateEntityResource(p.id, entity.id, {
    resourceId: prompt.id,
    expectedRevision: stalePrompt.revision,
    fields: { text: 'refreshed prompt' }
  })
  assert.equal(store.get(prompt.id).text, 'refreshed prompt')
  assert.equal(store.get(prompt.id).status, 'available')
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
  const resolved = store.get(result.proposal.id).resolved
  const first = store.get(resolved.a.objectId)
  assert.deepEqual(first.flags, ['ai-created'])
  assert.equal(store.get(resolved.b.objectId).origin, 'ai_agent')
  assert.equal(store.get(result.proposal.id).status, 'pending')
  const relation = confirm('r')
  assert.equal(relation.adopted[0].fromId, first.id)
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
test('concept planning never submits; canvas generation is bounded, idempotent and does not start deferred stages', () => {
  const f = fixture(), { store, workflows: w, project: p } = f
  try {
    const entity = store.transaction(() => store.create(p.id, 'entity', { name: '林乔', type: 'character', description: '黑色短发' }))
    store.updateProjectSettings(p.id, store.project(p.id).revision, {
      visualStyle: {
        text: 'Confirmed cinematic style',
        presetId: 'cinematic_realism',
        confirmed: true,
        revision: 1
      }
    })
    const s = store.transaction(() => w.open(p.id, { workflowId: 'CreateEntity', targetId: entity.id, goal: '概念图生成' }))
    store.transaction(() => w.authorize(s.id, { confirmed: true, conceptCount: 1, threeView: false }))
    const plan = w.operate(s.id, 'prepare_concept', { requestId: 'plan', confirmedPlan: true, description: '半身人物', prompt: 'Portrait of a woman with short black hair.', visualStyle: '电影写实', referenceIds: [] })
    assert.equal(store.list(p.id, 'run').length, 0)
    assert.equal(store.list(p.id, 'workflow_run').length, 0)
    assert.throws(() => w.operate(s.id, 'generate_concept', { requestId: 'agent-submit' }), /outside current Workflow/)
    const request = { requestId: 'canvas-submit', confirmedPlan: true, briefResourceId: plan.brief.id, promptResourceId: plan.prompt.id, expectedBriefRevision: plan.brief.revision, expectedPromptRevision: plan.prompt.revision }
    const run = store.write('canvas-concept', request, () => w.generateConceptFromPlan(s.id, request))
    assert.equal(run.childRunIds.length, 1)
    assert.equal(store.write('canvas-concept', request, () => w.generateConceptFromPlan(s.id, request)).id, run.id)
    let asset
    store.transaction(() => {
      asset = store.create(p.id, 'asset', { runId: run.childRunIds[0], hash: 'a'.repeat(64), mime: 'image/png', sourceAssetIds: [] })
      const child = store.get(run.childRunIds[0])
      store.update(child.id, child.revision, { status: 'succeeded', outputs: [asset.id] })
    })
    w.sync()
    const outputCount = store.list(p.id, 'resource').length
    const resource = store.list(p.id, 'resource').find(r => r.assetId === asset.id)
    assert.ok(resource.sourceResourceIds.includes(plan.brief.id))
    w.sync()
    assert.equal(store.list(p.id, 'resource').length, outputCount)
    store.transaction(() => w.confirmAppearance(entity.id, { assetId: asset.id, expectedRevision: store.get(entity.id).revision }))
    assert.equal(store.list(p.id, 'workflow_run').some(r => ['threeview', 'voice'].includes(r.stage)), false)
  } finally { f.close() }
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
test('four Workflow entries keep distinct scoped discussions and resume only the same target', () => {
  const f = fixture(),
    { store, workflows: w, project: p } = f
  const entity = store.transaction(() =>
    store.create(p.id, 'entity', { name: '测试目标', type: 'character' })
  )
  const opened = [
    'StructureNovel',
    'ExtractEntities',
    'CreateEntity',
    'GenerateThreeView'
  ].map((workflowId) =>
    store.transaction(() => w.open(p.id, { workflowId, targetId: entity.id }))
  )
  assert.equal(new Set(opened.map((s) => s.discussionId)).size, 4)
  for (const s of opened)
    assert.equal(
      store.transaction(() =>
        w.open(p.id, { workflowId: s.workflowId, targetId: entity.id })
      ).id,
      s.id
    )
  const other = store.transaction(() =>
    store.create(p.id, 'entity', { name: '其他目标', type: 'character' })
  )
  assert.notEqual(
    store.transaction(() =>
      w.open(p.id, { workflowId: 'CreateEntity', targetId: other.id })
    ).discussionId,
    opened[2].discussionId
  )
  f.close()
})
