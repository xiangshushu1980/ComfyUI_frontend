// Owner: Sean. Shared business operations for HTTP, CLI and bound PiWeb agents.
import { readFileSync } from 'node:fs'
import { hash, requireThat } from './store.mjs'
import { createSource, propose, adopt } from './domain.mjs'
const threeView = JSON.parse(
  readFileSync(new URL('../templates/qwen/threeview.v1.json', import.meta.url))
)
export const definitions = [
  {
    id: 'StructureNovel',
    version: 1,
    name: '小说导入与分章',
    target: 'project',
    operations: ['structure_novel', 'refine_chapters']
  },
  {
    id: 'ExtractEntities',
    version: 1,
    name: '章节实体提取',
    target: 'project',
    operations: ['propose_entities']
  },
  {
    id: 'CreateEntity',
    version: 1,
    name: '实体形象创建',
    target: 'entity',
    operations: ['add_reference', 'generate_concepts']
  },
  {
    id: 'GenerateThreeView',
    version: 1,
    name: '正式形象三视图',
    target: 'entity',
    operations: ['generate_threeview']
  }
].map((d) => ({ owner: 'Sean', ...d }))
const terminal = new Set(['succeeded', 'failed', 'cancelled'])
const ref = (o) => ({ id: o.id, revision: o.revision, kind: o.kind })
export class Workflows {
  constructor(store, execution) {
    this.store = store
    this.execution = execution
    this.stopped = false
  }
  migrate(projectId) {
    const normalize = (name) => (name || '').replace(/^#+\s*/, '')
    const all = this.store.list(projectId, 'chapter')
    for (const chapter of all.filter((c) => c.sourceId && !c.supersededBy)) {
      const legacy = all.find(
        (c) =>
          !this.store.get(c.id).sourceId &&
          normalize(c.name) === normalize(chapter.name)
      )
      if (!legacy) continue
      const { id, revision, ...fields } = chapter
      this.store.update(legacy.id, legacy.revision, {
        ...fields,
        name: normalize(chapter.name),
        brief: legacy.brief || chapter.brief
      })
      this.store.update(chapter.id, chapter.revision, {
        supersededBy: legacy.id
      })
      this.relation(projectId, chapter.sourceId, legacy.id, 'contains')
    }
  }
  open(projectId, body) {
    this.store.project(projectId)
    const definition = definitions.find((d) => d.id === body.workflowId)
    requireThat(definition, 'unknown business Workflow')
    const targetId =
      definition.target === 'entity'
        ? this.store.sameProject(body.targetId, projectId, 'entity').id
        : projectId
    // Resume a purpose-scoped work instance, never reuse an unrelated conversation silently.
    const old = this.store
      .list(projectId, 'workflow_session')
      .find(
        (s) =>
          s.workflowId === definition.id && s.targetId === targetId && !s.closed
      )
    if (old && !body.newInstance) return old
    let discussion = body.discussionId
      ? this.store.sameProject(body.discussionId, projectId, 'discussion')
      : null
    if (discussion)
      requireThat(
        !this.store
          .list(projectId, 'workflow_session')
          .some((s) => s.discussionId === discussion.id),
        'discussion already belongs to a Workflow',
        409
      )
    discussion ||= this.store.create(projectId, 'discussion', {
      name: definition.name,
      goal: body.goal || definition.name,
      links: [],
      status: 'idle'
    })
    return this.store.create(projectId, 'workflow_session', {
      name: definition.name,
      workflowId: definition.id,
      definitionVersion: definition.version,
      targetId,
      discussionId: discussion.id,
      goal: body.goal || definition.name,
      status: 'ready',
      createdAt: new Date().toISOString(),
      closed: false
    })
  }
  session(id) {
    const session = this.store.get(id)
    requireThat(
      session.kind === 'workflow_session',
      'Workflow Session required'
    )
    return session
  }
  close(id) {
    const session = this.session(id)
    requireThat(!session.closed, 'Workflow conversation already removed', 409)
    const activeTurn = this.store
      .list(session.projectId, 'pi_turn')
      .some(
        (turn) =>
          turn.discussionId === session.discussionId &&
          [
            'prepared',
            'sending',
            'received',
            'accepted',
            'delivery_unknown'
          ].includes(turn.status)
      )
    requireThat(
      !activeTurn,
      'Cannot remove a conversation with an active or uncertain Pi turn',
      409
    )
    return this.store.update(session.id, session.revision, {
      closed: true,
      status: 'closed',
      closedAt: new Date().toISOString()
    })
  }
  context(id) {
    const session = this.session(id),
      all = this.store.list(session.projectId)
    const target =
      session.targetId === session.projectId
        ? null
        : this.store.get(session.targetId)
    const chapters = all.filter((o) => o.kind === 'chapter' && !o.supersededBy)
    const related = target
      ? chapters.filter((c) =>
          (target.sources || []).some(
            (s) =>
              s.sourceId === c.sourceId &&
              (c.anchorIds || []).includes(s.anchorId)
          )
        )
      : chapters
    const sourceIds = new Set(related.map((c) => c.sourceId).filter(Boolean))
    const objects = all.filter(
      (o) =>
        o.id === target?.id ||
        related.some((c) => c.id === o.id) ||
        (o.kind === 'source' && (!target || sourceIds.has(o.id))) ||
        (o.kind === 'resource' && o.entityId === target?.id) ||
        (o.kind === 'entity' && !target) ||
        (o.kind === 'workflow_run' && o.sessionId === id)
    )
    // References plus chapter ranges; never inject an entire novel into the system prompt.
    return {
      session,
      project: this.store.project(session.projectId),
      objects: objects.map((o) => ({
        ...ref(o),
        name: o.name,
        sourceId: o.sourceId,
        anchorIds: o.anchorIds,
        role: o.role
      })),
      grants: all
        .filter((o) => o.kind === 'workflow_grant' && o.sessionId === id)
        .map((g) => ({
          id: g.id,
          status: g.status,
          conceptRemaining: g.conceptRemaining,
          threeViewRemaining: g.threeViewRemaining,
          expiresAt: g.expiresAt
        })),
      confirmedAppearance: target?.appearanceAssetId || null,
      definitions: definitions.filter((d) => d.id === session.workflowId)
    }
  }
  structure(projectId, body) {
    const source = body.sourceId
      ? this.store.sameProject(body.sourceId, projectId, 'source')
      : createSource(this.store, projectId, body)
    const existing = this.store
      .list(projectId, 'chapter')
      .filter((c) => c.sourceId === source.id && !c.supersededBy)
    if (existing.length) return { source, chapters: existing }
    const headings = [
      ...source.text.matchAll(
        /^(?:第[零〇一二三四五六七八九十百千万\d]+[章节回卷部][^\n]*|chapter\s+\d+[^\n]*|#{1,3}\s+[^\n]+)\s*$/gim
      )
    ]
    const spans = headings.length
      ? headings.map((m, i) => ({
          name: m[0].trim().replace(/^#+\s*/, ''),
          start: m.index,
          end: headings[i + 1]?.index ?? source.text.length
        }))
      : [{ name: source.name, start: 0, end: source.text.length }]
    if (
      headings.length &&
      headings[0].index > 0 &&
      source.text.slice(0, headings[0].index).trim()
    )
      spans.unshift({ name: '卷首', start: 0, end: headings[0].index })
    const chapters = spans.map((span, order) => {
      const fields = {
        ...span,
        order,
        sourceId: source.id,
        sourceRevision: source.revision,
        anchorIds: source.anchors
          .filter((a) => a.end > span.start && a.start < span.end)
          .map((a) => a.id),
        contentHash: hash(source.text.slice(span.start, span.end)),
        brief: ''
      }
      const legacy = this.store
        .list(projectId, 'chapter')
        .find((c) => !c.sourceId && c.name === span.name)
      return legacy
        ? this.store.update(legacy.id, legacy.revision, {
            ...fields,
            brief: legacy.brief
          })
        : this.store.create(projectId, 'chapter', fields)
    })
    for (const chapter of chapters)
      this.relation(projectId, source.id, chapter.id, 'contains')
    return { source, chapters }
  }
  refineChapters(sessionId, body) {
    const session = this.session(sessionId)
    requireThat(
      session.workflowId === 'StructureNovel',
      'use 小说导入与分章 Workflow',
      403
    )
    const source = this.store.sameProject(
      body.sourceId,
      session.projectId,
      'source'
    )
    requireThat(
      body.sourceRevision === source.revision,
      'source revision changed; reload before refining chapters',
      409
    )
    requireThat(
      Array.isArray(body.chapters) &&
        body.chapters.length > 0 &&
        body.chapters.length <= 500,
      'chapters must contain 1..500 entries'
    )
    const anchors = source.anchors || []
    requireThat(anchors.length > 0, 'source has no paragraph anchors')
    let nextAnchorIndex = 0
    const spans = body.chapters.map((chapter, order) => {
      const startIndex = anchors.findIndex(
        (anchor) => anchor.id === chapter.startAnchorId
      )
      const endIndex = anchors.findIndex(
        (anchor) => anchor.id === chapter.endAnchorId
      )
      requireThat(
        typeof chapter.name === 'string' &&
          chapter.name.trim().length > 0 &&
          chapter.name.trim().length <= 160,
        `chapter ${order + 1} requires a name`
      )
      requireThat(
        startIndex === nextAnchorIndex && endIndex >= startIndex,
        `chapter ${order + 1} must start at the next uncovered source anchor`,
        409
      )
      const range = anchors.slice(startIndex, endIndex + 1)
      nextAnchorIndex = endIndex + 1
      return {
        name: chapter.name.trim(),
        start: range[0].start,
        end: range.at(-1).end,
        order,
        sourceId: source.id,
        sourceRevision: source.revision,
        anchorIds: range.map((anchor) => anchor.id),
        contentHash: hash(source.text.slice(range[0].start, range.at(-1).end)),
        brief: typeof chapter.brief === 'string' ? chapter.brief.trim() : ''
      }
    })
    requireThat(
      nextAnchorIndex === anchors.length,
      'chapter ranges must cover every source anchor exactly once',
      409
    )

    const oldChapters = this.store
      .list(session.projectId, 'chapter')
      .filter(
        (chapter) => chapter.sourceId === source.id && !chapter.supersededBy
      )
    const usedIds = new Set()
    const chapters = spans.map((fields) => {
      const best = oldChapters
        .filter((chapter) => !usedIds.has(chapter.id))
        .map((chapter) => ({
          chapter,
          overlap: Math.max(
            0,
            Math.min(chapter.end, fields.end) -
              Math.max(chapter.start, fields.start)
          )
        }))
        .sort((a, b) => b.overlap - a.overlap)[0]
      if (!best?.overlap)
        return this.store.create(session.projectId, 'chapter', fields)
      usedIds.add(best.chapter.id)
      return this.store.update(best.chapter.id, best.chapter.revision, fields)
    })
    for (const chapter of chapters)
      this.relation(session.projectId, source.id, chapter.id, 'contains')

    const supersededChapterIds = []
    for (const old of oldChapters) {
      if (usedIds.has(old.id)) continue
      const replacement = chapters
        .map((chapter) => ({
          chapter,
          overlap: Math.max(
            0,
            Math.min(old.end, chapter.end) - Math.max(old.start, chapter.start)
          )
        }))
        .sort((a, b) => b.overlap - a.overlap)[0]?.chapter
      if (!replacement) continue
      this.store.update(old.id, old.revision, { supersededBy: replacement.id })
      supersededChapterIds.push(old.id)
    }
    return { source, chapters, supersededChapterIds }
  }
  relation(projectId, fromId, toId, type) {
    this.store.sameProject(fromId, projectId)
    this.store.sameProject(toId, projectId)
    const old = this.store
      .list(projectId, 'data_relation')
      .find((r) => r.fromId === fromId && r.toId === toId && r.type === type)
    return (
      old ||
      this.store.create(projectId, 'data_relation', {
        fromId,
        toId,
        type,
        scope: 'data'
      })
    )
  }
  proposeEntities(sessionId, body) {
    const s = this.session(sessionId)
    requireThat(
      s.workflowId === 'ExtractEntities',
      'use ExtractEntities Workflow',
      403
    )
    const chapter = this.store.sameProject(
      body.chapterId,
      s.projectId,
      'chapter'
    )
    requireThat(
      body.items.every(
        (i) =>
          (i.sources || []).length &&
          i.sources.every(
            (r) =>
              r.sourceId === chapter.sourceId &&
              chapter.anchorIds.includes(r.anchorId)
          )
      ),
      'all candidates require selected chapter source anchors'
    )
    const run = this.store.create(s.projectId, 'workflow_run', {
      name: '章节实体提取',
      workflowId: s.workflowId,
      definitionVersion: 1,
      sessionId,
      targetId: chapter.id,
      status: 'waiting_confirmation',
      inputs: [ref(chapter)],
      parameters: {},
      outputs: [],
      executionRelations: [],
      createdAt: new Date().toISOString()
    })
    const proposal = propose(this.store, s.projectId, {
      ...body,
      basis: [ref(chapter)],
      discussionId: s.discussionId,
      workflowRunId: run.id
    })
    this.store.update(run.id, run.revision, {
      proposalId: proposal.id,
      outputs: [proposal.id]
    })
    this.store.update(s.id, s.revision, { status: 'waiting_confirmation' })
    return { run: this.store.get(run.id), proposal }
  }
  confirmCandidate(proposalId, body) {
    const result = adopt(this.store, proposalId, body)
    const p = this.store.get(proposalId)
    for (const entity of result.adopted.filter((o) => o.kind === 'entity'))
      for (const c of this.store.list(p.projectId, 'chapter'))
        if (
          (entity.sources || []).some(
            (s) =>
              s.sourceId === c.sourceId && c.anchorIds?.includes(s.anchorId)
          )
        )
          this.relation(p.projectId, c.id, entity.id, 'mentions')
    if (p.workflowRunId) {
      const run = this.store.get(p.workflowRunId)
      this.store.update(run.id, run.revision, {
        status: p.status === 'adopted' ? 'succeeded' : 'waiting_confirmation',
        outputs: [
          ...new Set([...run.outputs, ...result.adopted.map((o) => o.id)])
        ]
      })
      const s = this.session(run.sessionId)
      this.store.update(s.id, s.revision, {
        status: p.status === 'adopted' ? 'ready' : 'waiting_confirmation'
      })
    }
    return result
  }
  addReference(sessionId, body) {
    const s = this.session(sessionId)
    requireThat(
      s.workflowId === 'CreateEntity',
      'use CreateEntity Workflow',
      403
    )
    requireThat(
      ['text', 'image'].includes(body.type),
      'reference type required'
    )
    const asset =
      body.type === 'image'
        ? this.store.sameProject(body.assetId, s.projectId, 'asset')
        : null
    requireThat(
      asset ||
        (typeof body.text === 'string' &&
          body.text.trim() &&
          body.text.length <= 12000),
      'reference content required'
    )
    const resource = this.store.create(s.projectId, 'resource', {
      name: body.name || '参考元素',
      entityId: s.targetId,
      role: 'reference',
      type: body.type,
      text: body.text || '',
      assetId: asset?.id || null,
      sources: body.sources || [],
      sourceUrl: body.sourceUrl || null,
      status: 'available'
    })
    this.relation(s.projectId, s.targetId, resource.id, 'owns')
    return resource
  }
  authorize(sessionId, body) {
    const s = this.session(sessionId)
    requireThat(
      ['CreateEntity', 'GenerateThreeView'].includes(s.workflowId),
      'not an image Workflow'
    )
    requireThat(
      body.confirmed === true,
      'human workflow authorization required',
      403
    )
    requireThat(
      Number.isInteger(body.conceptCount) &&
        body.conceptCount >= 0 &&
        body.conceptCount <= 4,
      '0..4 concept candidates'
    )
    requireThat(
      s.workflowId !== 'GenerateThreeView' || body.conceptCount === 0,
      'threeview-only scope'
    )
    const entity = this.store.get(s.targetId)
    for (const grant of this.store
      .list(s.projectId, 'workflow_grant')
      .filter((g) => g.sessionId === s.id && g.status === 'authorized'))
      this.store.update(grant.id, grant.revision, { status: 'revoked' })
    return this.store.create(s.projectId, 'workflow_grant', {
      sessionId,
      targetId: s.targetId,
      entityRevision: entity.revision,
      conceptRemaining: body.conceptCount,
      threeViewRemaining: body.threeView === true ? 1 : 0,
      status: 'authorized',
      expiresAt: Date.now() + 24 * 3600000,
      actor: entity.origin === 'test_fixture' ? 'automated_test' : 'human'
    })
  }
  grant(sessionId, stage) {
    const s = this.session(sessionId),
      field = stage === 'concept' ? 'conceptRemaining' : 'threeViewRemaining'
    const grant = this.store
      .list(s.projectId, 'workflow_grant')
      .findLast(
        (g) =>
          g.sessionId === sessionId &&
          g.status === 'authorized' &&
          g.expiresAt > Date.now() &&
          g[field] > 0
      )
    requireThat(
      grant,
      'Workflow generation needs bounded human authorization',
      403
    )
    const entity = this.store.get(s.targetId)
    requireThat(
      entity.revision === grant.entityRevision,
      'authorized entity changed; reauthorize',
      409
    )
    return grant
  }
  generate(sessionId, body, stage = 'concept') {
    const s = this.session(sessionId)
    requireThat(
      stage === 'concept'
        ? s.workflowId === 'CreateEntity'
        : ['CreateEntity', 'GenerateThreeView'].includes(s.workflowId),
      'Workflow scope mismatch',
      403
    )
    const entity = this.store.get(s.targetId),
      grant = this.grant(sessionId, stage)
    const resources = this.store
      .list(s.projectId, 'resource')
      .filter((r) => r.entityId === entity.id && r.role === 'reference')
    const assets =
      stage === 'threeview'
        ? [entity.appearanceAssetId]
        : body.referenceIds === undefined
          ? resources.filter((r) => r.assetId).map((r) => r.assetId)
          : body.referenceIds
    requireThat(
      Array.isArray(assets) &&
        assets.length <= 16 &&
        (stage !== 'threeview' || assets[0]),
      'confirmed appearance needed for threeview'
    )
    const references = assets.map((id) => {
      const a = this.store.sameProject(id, s.projectId, 'asset')
      return {
        assetId: a.id,
        hash: a.hash,
        image: `sean_entity_canvas/${a.hash}.png`
      }
    })
    const count =
      stage === 'threeview' ? 1 : (body.count ?? grant.conceptRemaining)
    requireThat(
      Number.isInteger(count) &&
        count > 0 &&
        count <= (stage === 'concept' ? grant.conceptRemaining : 1),
      'candidate budget exceeded'
    )
    const prompt =
      stage === 'threeview'
        ? threeView.prompt
        : body.prompt ||
          `${entity.description}\nFull-body concept portrait, one subject. ${resources
            .filter((r) => r.type === 'text')
            .map((r) => r.text)
            .join('\n')}`
    const inputs = [ref(entity), ...assets.map((id) => ref(this.store.get(id)))]
    const business = this.store.create(s.projectId, 'workflow_run', {
      name: stage === 'concept' ? '概念图候选' : '正式形象三视图',
      workflowId: stage === 'concept' ? 'CreateEntity' : 'GenerateThreeView',
      definitionVersion: 1,
      sessionId,
      targetId: entity.id,
      stage,
      grantId: grant.id,
      parentRunId: body.parentRunId || null,
      status: 'running',
      inputs,
      parameters: {
        prompt,
        count,
        seed: body.seed ?? 42,
        steps: body.steps ?? 25
      },
      outputs: [],
      childRunIds: [],
      executionRelations: [],
      createdAt: new Date().toISOString()
    })
    const children = []
    for (let i = 0; i < count; i++) {
      const input = {
        prompt,
        references,
        seed: (body.seed ?? 42) + i,
        steps: body.steps ?? 25,
        width: 1536,
        height: 1024
      }
      children.push(
        this.execution.prepareBusinessRun({
          projectId: s.projectId,
          targetEntityId: entity.id,
          workflowRunId: business.id,
          sessionId,
          input,
          stage
        })
      )
    }
    this.store.update(business.id, business.revision, {
      childRunIds: children.map((c) => c.id),
      executionRelations: children.map((c) => ({
        scope: 'execution',
        fromId: entity.id,
        toId: c.id,
        role: 'input'
      }))
    })
    this.store.update(grant.id, grant.revision, {
      [stage === 'concept' ? 'conceptRemaining' : 'threeViewRemaining']:
        (stage === 'concept'
          ? grant.conceptRemaining
          : grant.threeViewRemaining) - count
    })
    this.store.update(s.id, s.revision, { status: 'working' })
    // Schedule after transaction commits; API, CLI and tools all use this operation.
    setTimeout(
      () =>
        children.forEach((c) => {
          if (
            !this.stopped &&
            this.store.db.prepare('SELECT id FROM objects WHERE id=?').get(c.id)
          )
            void this.execution.execute(c.id)
        }),
      0
    ).unref()
    return this.store.get(business.id)
  }
  confirmAppearance(entityId, body) {
    const entity = this.store.get(entityId),
      asset = this.store.sameProject(body.assetId, entity.projectId, 'asset'),
      run = this.store.sameProject(asset.runId, entity.projectId, 'run')
    requireThat(
      run.targetEntityId === entityId &&
        run.status === 'succeeded' &&
        run.stage !== 'threeview',
      'only successful concept target can be confirmed'
    )
    requireThat(
      entity.revision === body.expectedRevision,
      'appearance conflict',
      409
    )
    for (const resource of this.store
      .list(entity.projectId, 'resource')
      .filter((r) => r.assetId === asset.id && r.entityId === entityId))
      this.store.update(resource.id, resource.revision, { status: 'confirmed' })
    const selection = this.store.create(
      entity.projectId,
      'appearance_selection',
      {
        entityId,
        assetId: asset.id,
        actor: entity.origin === 'test_fixture' ? 'automated_test' : 'human',
        inputHash: run.inputHash,
        workflowRunId: run.workflowRunId || null
      }
    )
    const updated = this.store.update(entity.id, entity.revision, {
      appearanceAssetId: asset.id,
      appearanceSelectionId: selection.id
    })
    // Confirmation preserves the bounded workflow scope across this intentional entity revision.
    const sessionId = run.sessionId
    if (sessionId) {
      for (const g of this.store
        .list(entity.projectId, 'workflow_grant')
        .filter(
          (g) =>
            g.sessionId === sessionId &&
            g.status === 'authorized' &&
            g.entityRevision === entity.revision
        ))
        this.store.update(g.id, g.revision, {
          entityRevision: updated.revision
        })
      const parent = this.store.get(run.workflowRunId)
      this.store.update(parent.id, parent.revision, {
        status: 'succeeded',
        selectedAssetId: asset.id
      })
      // Already-scoped downstream work is deterministic; no fake user/model message needed.
      const grant = this.store
        .list(entity.projectId, 'workflow_grant')
        .findLast(
          (g) =>
            g.sessionId === sessionId &&
            g.status === 'authorized' &&
            g.threeViewRemaining > 0 &&
            g.expiresAt > Date.now()
        )
      if (grant)
        this.generate(sessionId, { parentRunId: parent.id }, 'threeview')
    }
    return selection
  }
  sync() {
    if (this.stopped) return
    for (const row of this.store.db
      .prepare("SELECT body FROM objects WHERE kind='workflow_run'")
      .all()) {
      const run = JSON.parse(row.body)
      if (
        !['running', 'submission_unknown'].includes(run.status) ||
        !run.childRunIds?.length
      )
        continue
      const children = run.childRunIds.map((id) => this.store.get(id))
      const outputs = children.flatMap((c) => c.outputs || [])
      const status = children.some((c) => c.status === 'submission_unknown')
        ? 'submission_unknown'
        : children.every((c) => terminal.has(c.status))
          ? children.some((c) => c.status !== 'succeeded')
            ? 'failed'
            : run.stage === 'concept'
              ? 'waiting_confirmation'
              : 'succeeded'
          : 'running'
      if (hash(outputs) === hash(run.outputs) && status === run.status) continue
      this.store.transaction(() => {
        for (const id of outputs) {
          if (
            this.store
              .list(run.projectId, 'resource')
              .some((r) => r.assetId === id)
          )
            continue
          const asset = this.store.get(id)
          const resource = this.store.create(run.projectId, 'resource', {
            name: run.stage === 'threeview' ? '正侧背三视图' : '概念图候选',
            entityId: run.targetId,
            type: 'image',
            role: run.stage === 'threeview' ? 'threeview' : 'concept',
            assetId: id,
            workflowRunId: run.id,
            sourceAssetIds: asset.sourceAssetIds,
            status: run.stage === 'threeview' ? 'generated' : 'candidate'
          })
          this.relation(run.projectId, run.targetId, resource.id, 'owns')
        }
        this.store.update(run.id, this.store.get(run.id).revision, {
          outputs,
          status,
          executionRelations: [
            ...run.inputs.map((i) => ({
              scope: 'execution',
              fromId: i.id,
              toId: run.id,
              role: 'input'
            })),
            ...outputs.map((id) => ({
              scope: 'execution',
              fromId: run.id,
              toId: id,
              role: 'output'
            }))
          ]
        })
        const s = this.session(run.sessionId)
        this.store.update(s.id, s.revision, {
          status:
            status === 'running'
              ? 'working'
              : status === 'waiting_confirmation'
                ? status
                : status === 'succeeded'
                  ? 'ready'
                  : status
        })
      })
    }
  }
  operate(sessionId, operation, body, actor = 'agent') {
    const s = this.session(sessionId),
      definition = definitions.find((d) => d.id === s.workflowId)
    requireThat(
      definition.operations.includes(operation),
      'operation outside current Workflow; switch Workflow',
      403
    )
    return this.store.write(`workflow:${sessionId}:${operation}`, body, () => {
      if (operation === 'structure_novel')
        return this.structure(s.projectId, body)
      if (operation === 'refine_chapters')
        return this.refineChapters(sessionId, body)
      if (operation === 'propose_entities')
        return this.proposeEntities(sessionId, body)
      if (operation === 'add_reference')
        return this.addReference(sessionId, body)
      if (operation === 'generate_concepts')
        return this.generate(sessionId, body)
      if (operation === 'generate_threeview')
        return this.generate(sessionId, body, 'threeview')
      requireThat(false, 'unknown operation')
    })
  }
}
