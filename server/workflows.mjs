// Owner: Sean. Shared business operations for HTTP, CLI and bound PiWeb agents.
import { readFileSync } from 'node:fs'
import { hash, requireThat } from './store.mjs'
import { createSource, propose, adopt, rejectCandidate } from './domain.mjs'
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
    name: '人物实体制作',
    target: 'entity',
    operations: [
      'add_reference',
      'update_resource',
      'update_entity_profile',
      'generate_concepts',
      'prepare_appearance_adjustment',
      'select_references',
      'set_voice_design'
    ]
  },
  {
    id: 'GenerateThreeView',
    version: 1,
    name: '正式形象三视图（旧入口）',
    target: 'entity',
    operations: ['generate_threeview'],
    deprecated: true
  }
].map((d) => ({ owner: 'Sean', ...d }))
const terminal = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'paused_generation_mode'
])
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
    for (const entity of this.store.list(projectId, 'entity'))
      this.ensureEntityIntroduction(entity)
  }
  ensureEntityIntroduction(entity) {
    const current = this.store
      .list(entity.projectId, 'resource')
      .find(
        (resource) =>
          resource.entityId === entity.id &&
          resource.role === 'entity_introduction'
      )
    if (current) return current
    const introduction = this.store.create(entity.projectId, 'resource', {
      name: '实体介绍',
      entityId: entity.id,
      role: 'entity_introduction',
      type: 'text',
      text: entity.description || '',
      description: '',
      status: 'available'
    })
    this.relation(entity.projectId, entity.id, introduction.id, 'owns')
    return introduction
  }
  open(projectId, body) {
    this.store.project(projectId)
    const definition = definitions.find((d) => d.id === body.workflowId)
    requireThat(definition, 'unknown business Workflow')
    const targetId =
      definition.target === 'entity'
        ? this.store.sameProject(body.targetId, projectId, 'entity').id
        : projectId
    const context = body.contextId
      ? this.store.sameProject(body.contextId, projectId)
      : null
    if (context)
      requireThat(
        ['source', 'chapter', 'scene', 'entity', 'resource'].includes(
          context.kind
        ),
        'unsupported Workflow context object'
      )
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai'
    }).format(new Date())
    const target = targetId === projectId ? null : this.store.get(targetId)
    if (target?.kind === 'entity') this.ensureEntityIntroduction(target)
    const scopedSessions = this.store
      .list(projectId, 'workflow_session')
      .filter(
        (session) =>
          session.workflowId === definition.id &&
          session.targetId === targetId &&
          (session.contextId || null) === (context?.id || null) &&
          session.createdAt &&
          new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'Asia/Shanghai'
          }).format(new Date(session.createdAt)) === today
      )
    const contextName = context?.name || context?.kind || target?.name
    const sessionName = [
      definition.name,
      contextName,
      today,
      String(scopedSessions.length + 1).padStart(2, '0')
    ]
      .filter(Boolean)
      .join(' · ')
    // Resume a purpose-scoped work instance, never reuse an unrelated conversation silently.
    const old = this.store
      .list(projectId, 'workflow_session')
      .find(
        (s) =>
          s.workflowId === definition.id &&
          s.targetId === targetId &&
          (s.contextId || null) === (context?.id || null) &&
          !s.closed
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
      name: sessionName,
      goal: body.goal || definition.name,
      links: [],
      status: 'idle'
    })
    return this.store.create(projectId, 'workflow_session', {
      name: sessionName,
      workflowId: definition.id,
      definitionVersion: definition.version,
      targetId,
      contextId: context?.id || null,
      discussionId: discussion.id,
      goal:
        body.goal ||
        `${definition.name}${context ? ` · ${context.name || context.kind}` : ''}`,
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
    const context = session.contextId ? this.store.get(session.contextId) : null
    const chapters = all.filter(
      (o) =>
        o.kind === 'chapter' &&
        !o.supersededBy &&
        (!context || context.kind !== 'chapter' || o.id === context.id)
    )
    const related = target
      ? chapters.filter((c) =>
          (target.sources || []).some(
            (s) =>
              s.sourceId === c.sourceId &&
              (c.anchorIds || []).includes(s.anchorId)
          )
        )
      : context?.kind === 'chapter'
        ? chapters
        : context?.kind === 'source'
          ? chapters.filter((chapter) => chapter.sourceId === context.id)
          : context?.kind === 'entity'
            ? chapters.filter((chapter) =>
                (context.sources || []).some(
                  (source) =>
                    source.sourceId === chapter.sourceId &&
                    (chapter.anchorIds || []).includes(source.anchorId)
                )
              )
            : chapters
    const sourceIds = new Set(related.map((c) => c.sourceId).filter(Boolean))
    const objects = all.filter(
      (o) =>
        o.id === context?.id ||
        o.id === target?.id ||
        related.some((c) => c.id === o.id) ||
        (o.kind === 'source' && (!target || sourceIds.has(o.id))) ||
        (o.kind === 'resource' && o.entityId === target?.id) ||
        (o.kind === 'entity' &&
          !target &&
          (!context || context.kind !== 'entity' || o.id === context.id)) ||
        (o.kind === 'workflow_run' && o.sessionId === id)
    )
    // References plus chapter ranges; never inject an entire novel into the system prompt.
    return {
      session,
      generationMode: this.execution.mode,
      generationNotice:
        this.execution.mode === 'mock'
          ? '模拟模式：图片与声音均为本地合成预览，不会调用生成模型或 ComfyUI。'
          : '真实生成模式：每次 Run 仍需在 Studio 中确认。',
      project: this.store.project(session.projectId),
      context: context
        ? { ...ref(context), name: context.name, kind: context.kind }
        : null,
      objects: objects.map((o) => ({
        ...ref(o),
        name: o.name,
        sourceId: o.sourceId,
        anchorIds: o.anchorIds,
        role: o.role,
        type: o.type,
        assetId: o.assetId,
        sourceResourceIds: o.sourceResourceIds,
        workflowRunId: o.workflowRunId,
        entityId: o.entityId,
        status: o.status,
        description: o.description,
        text:
          typeof o.text === 'string'
            ? o.text.slice(0, o.kind === 'resource' ? 12000 : 2000)
            : undefined
      })),
      grants: all
        .filter((o) => o.kind === 'workflow_grant' && o.sessionId === id)
        .map((g) => ({
          id: g.id,
          status: g.status,
          conceptRemaining: g.conceptRemaining,
          threeViewRemaining: g.threeViewRemaining,
          voiceRemaining: g.voiceRemaining || 0,
          expiresAt: g.expiresAt
        })),
      selectedReferenceIds: session.selectedReferenceIds || [],
      confirmedAppearance: target?.appearanceAssetId || null,
      confirmedVoice: target?.voiceAssetId || null,
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
    if (existing.length) return { source, chapters: existing, run: null }
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
    const run = this.store.create(projectId, 'workflow_run', {
      name: '小说导入与分章',
      workflowId: 'StructureNovel',
      definitionVersion: 1,
      sessionId: body.sessionId || null,
      targetId: source.id,
      status: 'succeeded',
      inputs: [ref(source)],
      parameters: { mode: 'structure_novel' },
      outputs: chapters.map((chapter) => chapter.id),
      executionRelations: [],
      createdAt: new Date().toISOString()
    })
    return { source, chapters, run }
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
    const run = this.store.create(session.projectId, 'workflow_run', {
      name: '小说导入与分章',
      workflowId: 'StructureNovel',
      definitionVersion: session.definitionVersion,
      sessionId: session.id,
      targetId: source.id,
      status: 'succeeded',
      inputs: [
        { ...ref(source), revision: body.sourceRevision },
        ...oldChapters.map(ref)
      ],
      parameters: { mode: 'refine_chapters' },
      outputs: chapters.map((chapter) => chapter.id),
      executionRelations: [],
      createdAt: new Date().toISOString()
    })
    return { source, chapters, supersededChapterIds, run }
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
    const scopedContext = s.contextId
      ? this.store.sameProject(s.contextId, s.projectId)
      : null
    if (scopedContext?.kind === 'chapter')
      requireThat(
        chapter.id === scopedContext.id,
        'chapter is outside the selected Workflow context',
        403
      )
    if (scopedContext?.kind === 'source')
      requireThat(
        chapter.sourceId === scopedContext.id,
        'chapter is outside the selected source context',
        403
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
    for (const entity of result.adopted.filter((o) => o.kind === 'entity')) {
      this.ensureEntityIntroduction(entity)
      for (const c of this.store.list(p.projectId, 'chapter'))
        if (
          (entity.sources || []).some(
            (s) =>
              s.sourceId === c.sourceId && c.anchorIds?.includes(s.anchorId)
          )
        )
          this.relation(p.projectId, c.id, entity.id, 'mentions')
    }
    if (p.workflowRunId) {
      const run = this.store.get(p.workflowRunId)
      this.store.update(run.id, run.revision, {
        status: ['adopted', 'resolved'].includes(p.status)
          ? 'succeeded'
          : 'waiting_confirmation',
        outputs: [
          ...new Set([...run.outputs, ...result.adopted.map((o) => o.id)])
        ]
      })
      const s = this.session(run.sessionId)
      this.store.update(s.id, s.revision, {
        status: ['adopted', 'resolved'].includes(p.status)
          ? 'ready'
          : 'waiting_confirmation'
      })
    }
    return result
  }
  rejectCandidate(proposalId, body) {
    const result = rejectCandidate(this.store, proposalId, body)
    const proposal = result.proposal
    if (proposal.workflowRunId) {
      const run = this.store.get(proposal.workflowRunId)
      const done = ['adopted', 'resolved'].includes(proposal.status)
      this.store.update(run.id, run.revision, {
        status: done ? 'succeeded' : 'waiting_confirmation'
      })
      const session = this.session(run.sessionId)
      this.store.update(session.id, session.revision, {
        status: done ? 'ready' : 'waiting_confirmation'
      })
    }
    return result
  }
  rejectProposal(proposalId, body) {
    const proposal = this.store.get(proposalId)
    requireThat(proposal.kind === 'proposal', 'proposal required')
    const updated = this.store.update(proposal.id, body.expectedRevision, {
      status: 'rejected'
    })
    if (proposal.workflowRunId) {
      const run = this.store.get(proposal.workflowRunId)
      this.store.update(run.id, run.revision, { status: 'cancelled' })
      if (run.sessionId) {
        const session = this.session(run.sessionId)
        this.store.update(session.id, session.revision, { status: 'ready' })
      }
    }
    return updated
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
    requireThat(
      body.description === undefined ||
        (typeof body.description === 'string' &&
          body.description.length <= 12000),
      'reference description too long'
    )
    const resource = this.store.create(s.projectId, 'resource', {
      name: body.name || '参考元素',
      entityId: s.targetId,
      role: 'reference',
      type: body.type,
      text: body.text || '',
      description: body.description || '',
      assetId: asset?.id || null,
      sources: body.sources || [],
      sourceUrl: body.sourceUrl || null,
      status: 'available'
    })
    this.relation(s.projectId, s.targetId, resource.id, 'owns')
    return resource
  }
  cancelPendingImageRuns(projectId, entityId, resourceId = null) {
    for (const run of this.store
      .list(projectId, 'workflow_run')
      .filter(
        (item) =>
          item.targetId === entityId &&
          item.status === 'awaiting_input_confirmation' &&
          (!resourceId || item.inputs?.some((input) => input.id === resourceId))
      )) {
      this.store.update(run.id, run.revision, {
        status: 'cancelled',
        cancellationReason: 'source_resource_changed'
      })
      const promptId = run.parameters?.promptResourceId
      const prompt = promptId && this.store.get(promptId)
      if (prompt && prompt.status !== 'needs_refresh')
        this.store.update(prompt.id, prompt.revision, {
          status: 'needs_refresh'
        })
    }
  }
  setPromptResourceStatus(run, status) {
    const promptId = run?.parameters?.promptResourceId
    const prompt = promptId && this.store.get(promptId)
    if (prompt && prompt.status !== status)
      return this.store.update(prompt.id, prompt.revision, { status })
    return prompt || null
  }
  updateEntityProfileData(entityId, body) {
    const entity = this.store.get(entityId)
    requireThat(entity.kind === 'entity', 'Entity required')
    requireThat(
      entity.revision === body.expectedRevision,
      'entity revision conflict',
      409
    )
    const fields = {}
    for (const key of ['name', 'description'])
      if (body.fields?.[key] !== undefined) fields[key] = body.fields[key]
    requireThat(Object.keys(fields).length > 0, 'entity fields required')
    if (fields.name !== undefined)
      requireThat(String(fields.name).trim().length > 0, 'entity name required')
    if (fields.description !== undefined)
      requireThat(
        String(fields.description).length <= 12000,
        'entity introduction too long'
      )
    const introduction = this.ensureEntityIntroduction(entity)
    this.cancelPendingImageRuns(entity.projectId, entity.id, introduction.id)
    const updated = this.store.update(entity.id, entity.revision, fields)
    const currentIntroduction = this.store.get(introduction.id)
    this.store.update(currentIntroduction.id, currentIntroduction.revision, {
      text: fields.description ?? currentIntroduction.text ?? ''
    })
    for (const grant of this.store
      .list(entity.projectId, 'workflow_grant')
      .filter(
        (item) =>
          item.targetId === entity.id &&
          item.status === 'authorized' &&
          item.entityRevision === entity.revision
      ))
      this.store.update(grant.id, grant.revision, {
        entityRevision: updated.revision
      })
    return updated
  }
  updateEntityResource(projectId, entityId, body) {
    const entity = this.store.sameProject(entityId, projectId, 'entity')
    const resource = this.store.sameProject(
      body.resourceId,
      projectId,
      'resource'
    )
    requireThat(
      resource.entityId === entity.id,
      'resource belongs to a different entity',
      403
    )
    requireThat(
      resource.revision === body.expectedRevision,
      'resource revision conflict',
      409
    )
    requireThat(
      [
        'reference',
        'entity_introduction',
        'concept_prompt',
        'appearance_prompt',
        'threeview_prompt'
      ].includes(resource.role),
      'this entity resource cannot be edited here',
      403
    )
    const fields = {}
    for (const key of ['name', 'description', 'text'])
      if (body.fields?.[key] !== undefined) fields[key] = body.fields[key]
    requireThat(Object.keys(fields).length > 0, 'resource fields required')
    if (fields.name !== undefined)
      requireThat(
        String(fields.name).trim().length > 0 &&
          String(fields.name).length <= 200,
        'resource name required (max 200 chars)'
      )
    if (fields.description !== undefined)
      requireThat(
        String(fields.description).length <= 12000,
        'resource description too long'
      )
    if (fields.text !== undefined)
      requireThat(
        String(fields.text).trim().length > 0 &&
          String(fields.text).length <= 12000,
        'resource text required (max 12000 chars)'
      )
    const updated = this.store.update(resource.id, resource.revision, fields)
    if (resource.role === 'entity_introduction') {
      this.cancelPendingImageRuns(projectId, entity.id, resource.id)
      const currentEntity = this.store.get(entity.id)
      const updatedEntity = this.store.update(
        entity.id,
        currentEntity.revision,
        {
          description: fields.text ?? currentEntity.description ?? ''
        }
      )
      for (const grant of this.store
        .list(projectId, 'workflow_grant')
        .filter(
          (item) =>
            item.targetId === entity.id &&
            item.status === 'authorized' &&
            item.entityRevision === entity.revision
        ))
        this.store.update(grant.id, grant.revision, {
          entityRevision: updatedEntity.revision
        })
      return updated
    }
    if (resource.role === 'reference') {
      this.cancelPendingImageRuns(projectId, entity.id, resource.id)
      return updated
    }
    for (const run of this.store
      .list(projectId, 'workflow_run')
      .filter(
        (item) =>
          item.parameters?.promptResourceId === resource.id &&
          item.status === 'awaiting_input_confirmation'
      )) {
      const prompt = String(updated.text || '').trim()
      requireThat(prompt.length > 0, 'prompt cannot be empty')
      this.store.update(run.id, run.revision, {
        parameters: {
          ...run.parameters,
          prompt,
          promptHash: hash(prompt),
          promptResourceRevision: updated.revision
        },
        inputs: run.inputs.map((input) =>
          input.id === updated.id ? ref(updated) : input
        )
      })
    }
    return updated
  }
  updateEntityResourceForSession(sessionId, body) {
    const session = this.session(sessionId)
    requireThat(
      session.workflowId === 'CreateEntity',
      'use entity creation Workflow',
      403
    )
    return this.updateEntityResource(session.projectId, session.targetId, body)
  }
  updateEntityProfile(sessionId, body) {
    const session = this.session(sessionId)
    requireThat(
      session.workflowId === 'CreateEntity',
      'use entity creation Workflow',
      403
    )
    const entity = this.store.sameProject(
      session.targetId,
      session.projectId,
      'entity'
    )
    return this.updateEntityProfileData(entity.id, body)
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
    const existing = this.store
      .list(s.projectId, 'workflow_grant')
      .findLast(
        (g) =>
          g.sessionId === s.id &&
          g.status === 'authorized' &&
          g.expiresAt > Date.now() &&
          g.entityRevision === entity.revision &&
          (g.conceptRemaining > 0 ||
            g.threeViewRemaining > 0 ||
            g.voiceRemaining > 0)
      )
    if (existing) {
      const hasVoiceRun = this.store
        .list(s.projectId, 'workflow_run')
        .some((run) => run.sessionId === s.id && run.stage === 'voice')
      if (
        body.voice === true &&
        entity.type === 'character' &&
        existing.voiceRemaining === undefined &&
        !hasVoiceRun
      )
        return this.store.update(existing.id, existing.revision, {
          voiceRemaining: 1
        })
      return existing
    }
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
      voiceRemaining:
        body.voice === true && entity.type === 'character' ? 1 : 0,
      status: 'authorized',
      expiresAt: Date.now() + 24 * 3600000,
      actor: entity.origin === 'test_fixture' ? 'automated_test' : 'human'
    })
  }
  grant(sessionId, stage) {
    const s = this.session(sessionId),
      field = ['concept', 'appearance'].includes(stage)
        ? 'conceptRemaining'
        : stage === 'threeview'
          ? 'threeViewRemaining'
          : 'voiceRemaining'
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
      ['concept', 'appearance', 'threeview'].includes(stage) &&
        (stage === 'threeview'
          ? ['CreateEntity', 'GenerateThreeView'].includes(s.workflowId)
          : s.workflowId === 'CreateEntity'),
      'Workflow scope mismatch',
      403
    )
    const entity = this.store.sameProject(s.targetId, s.projectId, 'entity')
    const grant = this.grant(sessionId, stage)
    const resources = this.store
      .list(s.projectId, 'resource')
      .filter((r) => r.entityId === entity.id)
    const allowedReferenceIds = new Set(
      resources
        .filter(
          (r) =>
            [
              'reference',
              'concept',
              'appearance_candidate',
              'appearance_current'
            ].includes(r.role) &&
            r.type === 'image' &&
            r.assetId
        )
        .map((r) => r.assetId)
    )
    if (stage === 'threeview')
      requireThat(
        entity.appearanceAssetId,
        'confirm formal appearance first',
        409
      )
    const assets =
      stage === 'threeview'
        ? [entity.appearanceAssetId]
        : body.referenceIds === undefined
          ? (s.selectedReferenceIds || []).filter((id) =>
              allowedReferenceIds.has(id)
            )
          : body.referenceIds
    requireThat(
      Array.isArray(assets) &&
        assets.length <= 16 &&
        (stage !== 'threeview' || assets[0] === entity.appearanceAssetId) &&
        (stage === 'threeview' ||
          assets.every((id) => allowedReferenceIds.has(id))),
      'references must belong to this entity; three-view requires its confirmed appearance'
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
      stage === 'threeview'
        ? 1
        : (body.count ?? Math.min(2, grant.conceptRemaining))
    requireThat(
      Number.isInteger(count) &&
        count > 0 &&
        count <= (stage === 'threeview' ? 1 : grant.conceptRemaining),
      'candidate budget exceeded'
    )
    const prompt =
      stage === 'threeview'
        ? body.prompt || threeView.prompt
        : String(body.prompt || '').trim()
    requireThat(
      prompt.length > 0 && prompt.length <= 12000,
      'prompt required (max 12000 chars)'
    )
    const referenceResources = assets.map((assetId) =>
      resources.find((resource) => resource.assetId === assetId)
    )
    requireThat(
      referenceResources.every(Boolean),
      'reference resource not found',
      409
    )
    const introduction =
      stage === 'threeview' ? null : this.ensureEntityIntroduction(entity)
    const promptNode = this.store.create(s.projectId, 'resource', {
      name:
        stage === 'threeview'
          ? '三视图提示词'
          : stage === 'appearance'
            ? '形象调整提示词'
            : 'Qwen Image 2.1 概念图提示词',
      entityId: entity.id,
      role:
        stage === 'threeview'
          ? 'threeview_prompt'
          : stage === 'appearance'
            ? 'appearance_prompt'
            : 'concept_prompt',
      type: 'text',
      text: prompt,
      description: '',
      sourceResourceIds: [
        ...(introduction ? [introduction.id] : []),
        ...referenceResources.map((resource) => resource.id)
      ],
      status: 'awaiting_input_confirmation'
    })
    if (introduction)
      this.relation(
        s.projectId,
        introduction.id,
        promptNode.id,
        'informs_prompt'
      )
    for (const resource of referenceResources)
      this.relation(s.projectId, resource.id, promptNode.id, 'informs_prompt')
    const inputs = [
      ref(entity),
      ...(introduction ? [ref(introduction)] : []),
      ...referenceResources.map((resource) => ref(resource)),
      ref(promptNode)
    ]
    for (const previous of this.store
      .list(s.projectId, 'workflow_run')
      .filter(
        (run) =>
          run.sessionId === s.id &&
          run.stage === stage &&
          run.status === 'awaiting_input_confirmation'
      )) {
      this.store.update(previous.id, previous.revision, {
        status: 'cancelled',
        cancellationReason: 'superseded_by_new_configuration'
      })
      this.setPromptResourceStatus(previous, 'superseded')
    }
    const business = this.store.create(s.projectId, 'workflow_run', {
      name:
        stage === 'concept'
          ? '概念图 · 待确认配置'
          : stage === 'appearance'
            ? '形象调整 · 待确认配置'
            : '正式形象三视图 · 待确认配置',
      workflowId: 'CreateEntity',
      definitionVersion: 1,
      sessionId,
      targetId: entity.id,
      stage,
      grantId: grant.id,
      simulation: this.execution.mode !== 'real',
      parentRunId: body.parentRunId || null,
      status: 'awaiting_input_confirmation',
      inputs,
      parameters: {
        prompt,
        promptResourceId: promptNode.id,
        promptResourceRevision: promptNode.revision,
        promptHash: hash(prompt),
        sourceResourceIds: promptNode.sourceResourceIds,
        count,
        seed: body.seed ?? 42,
        steps: body.steps ?? 25,
        referenceAssetIds: assets,
        referenceHashes: references.map((item) => item.hash),
        expectedEntityRevision: entity.revision
      },
      outputs: [],
      childRunIds: [],
      executionRelations: [],
      createdAt: new Date().toISOString()
    })
    const attachedPrompt = this.store.update(
      promptNode.id,
      promptNode.revision,
      { workflowRunId: business.id }
    )
    const currentBusiness = this.store.get(business.id)
    this.store.update(currentBusiness.id, currentBusiness.revision, {
      inputs: currentBusiness.inputs.map((input) =>
        input.id === attachedPrompt.id ? ref(attachedPrompt) : input
      ),
      parameters: {
        ...currentBusiness.parameters,
        promptResourceRevision: attachedPrompt.revision
      }
    })
    return this.store.get(business.id)
  }
  confirmGeneration(runId, body = {}) {
    const business = this.store.get(runId)
    requireThat(business.kind === 'workflow_run', 'Workflow Run required')
    requireThat(
      business.status === 'awaiting_input_confirmation',
      'Run is not waiting for input confirmation',
      409
    )
    requireThat(body.confirm === true, 'explicit input confirmation required')
    const s = this.session(business.sessionId)
    const entity = this.store.sameProject(
      business.targetId,
      s.projectId,
      'entity'
    )
    const grant = this.grant(s.id, business.stage)
    requireThat(
      grant.id === business.grantId,
      'authorization scope changed',
      409
    )
    const parameters = business.parameters
    requireThat(
      entity.revision === parameters.expectedEntityRevision,
      'entity changed after configuration was prepared; ask Agent to refresh it',
      409
    )
    const promptResource = this.store.sameProject(
      parameters.promptResourceId,
      s.projectId,
      'resource'
    )
    requireThat(
      promptResource.entityId === entity.id &&
        promptResource.revision === parameters.promptResourceRevision &&
        promptResource.text === parameters.prompt &&
        hash(promptResource.text) === parameters.promptHash,
      'prompt node changed after configuration review; ask Agent to refresh it',
      409
    )
    const references = parameters.referenceAssetIds.map((id, i) => {
      const asset = this.store.sameProject(id, s.projectId, 'asset')
      requireThat(
        asset.hash === parameters.referenceHashes[i],
        'reference image changed',
        409
      )
      return {
        assetId: asset.id,
        hash: asset.hash,
        image: `sean_entity_canvas/${asset.hash}.png`
      }
    })
    const submittedPrompt = this.store.update(
      promptResource.id,
      promptResource.revision,
      { status: 'submitted' }
    )
    const running = this.store.update(business.id, business.revision, {
      status: 'running',
      approvedAt: new Date().toISOString(),
      approvedBy: body.actor || 'human',
      parameters: {
        ...parameters,
        promptResourceRevision: submittedPrompt.revision
      },
      inputs: business.inputs.map((input) =>
        input.id === submittedPrompt.id ? ref(submittedPrompt) : input
      )
    })
    const children = []
    for (let i = 0; i < parameters.count; i++) {
      const input = {
        prompt: parameters.prompt,
        references,
        seed: parameters.seed + i,
        steps: parameters.steps,
        width: 1536,
        height: 1024
      }
      children.push(
        this.execution.prepareBusinessRun({
          projectId: s.projectId,
          targetEntityId: entity.id,
          workflowRunId: running.id,
          sessionId: s.id,
          input,
          stage: business.stage
        })
      )
    }
    this.store.update(running.id, running.revision, {
      childRunIds: children.map((c) => c.id),
      executionRelations: children.map((c) => ({
        scope: 'execution',
        fromId: entity.id,
        toId: c.id,
        role: 'input'
      }))
    })
    this.store.update(grant.id, grant.revision, {
      [business.stage === 'threeview'
        ? 'threeViewRemaining'
        : 'conceptRemaining']:
        (business.stage === 'threeview'
          ? grant.threeViewRemaining
          : grant.conceptRemaining) - parameters.count
    })
    this.store.update(s.id, s.revision, { status: 'working' })
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
    return this.store.get(running.id)
  }
  selectReferences(sessionId, body) {
    const s = this.session(sessionId)
    requireThat(s.workflowId === 'CreateEntity', 'use entity creation Workflow')
    requireThat(Array.isArray(body.referenceIds), 'referenceIds required')
    const allowed = new Set(
      this.store
        .list(s.projectId, 'resource')
        .filter(
          (r) =>
            r.entityId === s.targetId &&
            r.role === 'reference' &&
            r.type === 'image' &&
            r.assetId
        )
        .map((r) => r.assetId)
    )
    requireThat(
      body.referenceIds.length <= 16 &&
        body.referenceIds.every((id) => allowed.has(id)),
      'only this character’s reference images can be selected'
    )
    const updated = this.store.update(s.id, s.revision, {
      selectedReferenceIds: [...new Set(body.referenceIds)]
    })
    return {
      session: updated,
      selectedReferenceIds: updated.selectedReferenceIds
    }
  }
  generateVoiceSample(sessionId, body) {
    const s = this.session(sessionId)
    requireThat(
      s.workflowId === 'CreateEntity',
      'use entity creation Workflow',
      403
    )
    const entity = this.store.sameProject(s.targetId, s.projectId, 'entity')
    requireThat(
      entity.type === 'character',
      'voice samples are only for characters',
      403
    )
    requireThat(
      entity.appearanceAssetId,
      'confirm the formal appearance first',
      409
    )
    requireThat(
      this.store
        .list(s.projectId, 'workflow_run')
        .some(
          (run) =>
            run.sessionId === s.id &&
            run.targetId === entity.id &&
            run.stage === 'threeview' &&
            run.status === 'succeeded'
        ),
      'complete the authorized three-view step before voice design',
      409
    )
    const grant = this.grant(sessionId, 'voice')
    const voiceDescription = String(body.voiceDescription || '').trim()
    const sampleText = String(body.sampleText || '').trim()
    requireThat(
      voiceDescription.length > 0 && voiceDescription.length <= 1200,
      'voiceDescription required (max 1200 chars)'
    )
    requireThat(
      sampleText.length > 0 && sampleText.length <= 1200,
      'sampleText required (max 1200 chars)'
    )
    const input = {
      voiceDescription,
      sampleText,
      language: body.language === 'en' ? 'en' : 'zh',
      seed: Number.isInteger(body.seed) ? body.seed : 42,
      cfgScale: Number.isFinite(body.cfgScale) ? body.cfgScale : 1.5,
      entity: { id: entity.id, revision: entity.revision, name: entity.name }
    }
    const business = this.store.create(s.projectId, 'workflow_run', {
      name: '人物声音样音',
      workflowId: 'CreateEntity',
      definitionVersion: 1,
      sessionId,
      targetId: entity.id,
      stage: 'voice',
      grantId: grant.id,
      simulation: this.execution.mode !== 'real',
      status: 'running',
      inputs: [ref(entity)],
      parameters: input,
      outputs: [],
      childRunIds: [],
      executionRelations: [],
      createdAt: new Date().toISOString()
    })
    const child = this.execution.prepareBusinessRun({
      projectId: s.projectId,
      targetEntityId: entity.id,
      workflowRunId: business.id,
      sessionId,
      input,
      stage: 'voice'
    })
    this.store.update(business.id, business.revision, {
      childRunIds: [child.id],
      executionRelations: [
        { scope: 'execution', fromId: entity.id, toId: child.id, role: 'input' }
      ]
    })
    this.store.update(grant.id, grant.revision, {
      voiceRemaining: grant.voiceRemaining - 1
    })
    this.store.update(s.id, s.revision, { status: 'working' })
    setTimeout(() => {
      if (!this.stopped && this.store.get(child.id))
        void this.execution.execute(child.id)
    }, 0).unref()
    return this.store.get(business.id)
  }
  setVoiceDesign(sessionId, body) {
    const s = this.session(sessionId)
    requireThat(
      s.workflowId === 'CreateEntity',
      'use entity creation Workflow',
      403
    )
    const entity = this.store.sameProject(s.targetId, s.projectId, 'entity')
    requireThat(
      entity.type === 'character',
      'voice design is only for characters',
      403
    )
    const design = {
      voiceDescription: String(body.voiceDescription || '').trim(),
      sampleText: String(body.sampleText || '').trim(),
      language: body.language === 'en' ? 'en' : 'zh'
    }
    requireThat(
      design.voiceDescription.length > 0 &&
        design.voiceDescription.length <= 1200,
      'voiceDescription required (max 1200 chars)'
    )
    requireThat(
      design.sampleText.length > 0 && design.sampleText.length <= 1200,
      'sampleText required (max 1200 chars)'
    )
    this.store.update(s.id, s.revision, { voiceDesign: design })
    const voiceRun = this.maybeStartVoiceSample(s.id)
    return { session: this.session(s.id), voiceRun }
  }
  maybeStartVoiceSample(sessionId) {
    const s = this.session(sessionId)
    if (s.workflowId !== 'CreateEntity' || !s.voiceDesign || s.voiceRunId)
      return null
    const entity = this.store.get(s.targetId)
    const ready = this.store
      .list(s.projectId, 'workflow_run')
      .some(
        (run) =>
          run.sessionId === s.id &&
          run.targetId === entity.id &&
          run.stage === 'threeview' &&
          run.status === 'succeeded'
      )
    if (!ready || !entity.appearanceAssetId) return null
    const grant = this.store
      .list(s.projectId, 'workflow_grant')
      .findLast(
        (item) =>
          item.sessionId === s.id &&
          item.status === 'authorized' &&
          item.expiresAt > Date.now() &&
          item.voiceRemaining > 0 &&
          item.entityRevision === entity.revision
      )
    if (!grant) return null
    const voiceRun = this.generateVoiceSample(s.id, s.voiceDesign)
    const current = this.session(s.id)
    this.store.update(current.id, current.revision, { voiceRunId: voiceRun.id })
    return voiceRun
  }
  confirmVoice(entityId, body) {
    const entity = this.store.get(entityId)
    requireThat(
      entity.kind === 'entity' && entity.type === 'character',
      'voice is only available for characters',
      403
    )
    const asset = this.store.sameProject(
      body.assetId,
      entity.projectId,
      'asset'
    )
    const run = this.store.sameProject(asset.runId, entity.projectId, 'run')
    requireThat(
      asset.mime === 'audio/wav' &&
        run.stage === 'voice' &&
        run.status === 'succeeded' &&
        run.targetEntityId === entity.id,
      'only a successful voice sample for this character can be selected'
    )
    requireThat(
      entity.revision === body.expectedRevision,
      'voice selection conflict',
      409
    )
    const selection = this.store.create(entity.projectId, 'voice_selection', {
      entityId,
      assetId: asset.id,
      actor: entity.origin === 'test_fixture' ? 'automated_test' : 'human',
      inputHash: run.inputHash,
      workflowRunId: run.workflowRunId,
      createdAt: new Date().toISOString()
    })
    this.store.update(entity.id, entity.revision, {
      voiceAssetId: asset.id,
      voiceSelectionId: selection.id
    })
    for (const resource of this.store
      .list(entity.projectId, 'resource')
      .filter((r) => r.assetId === asset.id && r.entityId === entityId))
      this.store.update(resource.id, resource.revision, {
        status: 'confirmed',
        role: 'voice_current'
      })
    const parent = this.store.get(run.workflowRunId)
    this.store.update(parent.id, parent.revision, {
      status: 'succeeded',
      selectedAssetId: asset.id
    })
    if (run.sessionId) {
      const session = this.session(run.sessionId)
      this.store.update(session.id, session.revision, { status: 'ready' })
    }
    return selection
  }
  confirmThreeView(entityId, body) {
    const entity = this.store.get(entityId)
    requireThat(entity.kind === 'entity', 'Entity required')
    const asset = this.store.sameProject(
      body.assetId,
      entity.projectId,
      'asset'
    )
    const run = this.store.sameProject(asset.runId, entity.projectId, 'run')
    requireThat(
      run.targetEntityId === entity.id &&
        run.stage === 'threeview' &&
        run.status === 'succeeded' &&
        asset.mime === 'image/png',
      'only a successful three-view image for this entity can be confirmed'
    )
    const parent = this.store.sameProject(
      run.workflowRunId,
      entity.projectId,
      'workflow_run'
    )
    requireThat(
      parent.status === 'waiting_confirmation',
      'three-view Run is not awaiting result confirmation',
      409
    )
    for (const resource of this.store
      .list(entity.projectId, 'resource')
      .filter(
        (item) => item.assetId === asset.id && item.entityId === entity.id
      ))
      this.store.update(resource.id, resource.revision, {
        status: 'confirmed',
        role: 'threeview_current'
      })
    const selection = this.store.create(
      entity.projectId,
      'threeview_selection',
      {
        entityId: entity.id,
        assetId: asset.id,
        actor: 'human',
        workflowRunId: parent.id,
        createdAt: new Date().toISOString()
      }
    )
    this.store.update(parent.id, parent.revision, {
      status: 'succeeded',
      selectedAssetId: asset.id,
      resultSelectionId: selection.id
    })
    this.setPromptResourceStatus(parent, 'result_confirmed')
    if (parent.sessionId) {
      const session = this.session(parent.sessionId)
      this.store.update(session.id, session.revision, { status: 'ready' })
      this.maybeStartVoiceSample(session.id)
    }
    return selection
  }
  confirmAppearance(entityId, body) {
    const entity = this.store.get(entityId),
      asset = this.store.sameProject(body.assetId, entity.projectId, 'asset'),
      run = this.store.sameProject(asset.runId, entity.projectId, 'run')
    requireThat(
      run.targetEntityId === entityId &&
        run.status === 'succeeded' &&
        ['concept', 'appearance'].includes(run.stage) &&
        asset.mime === 'image/png',
      'only successful concept target can be confirmed'
    )
    requireThat(
      entity.revision === body.expectedRevision,
      'appearance conflict',
      409
    )
    this.cancelPendingImageRuns(entity.projectId, entityId)
    for (const resource of this.store
      .list(entity.projectId, 'resource')
      .filter((r) => r.assetId === asset.id && r.entityId === entityId))
      this.store.update(resource.id, resource.revision, {
        status: 'confirmed',
        role: 'appearance_current'
      })
    for (const resource of this.store
      .list(entity.projectId, 'resource')
      .filter(
        (r) =>
          r.entityId === entityId &&
          r.role === 'appearance_current' &&
          r.assetId !== asset.id
      ))
      this.store.update(resource.id, resource.revision, {
        status: 'superseded',
        role: 'appearance_candidate'
      })
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
      this.setPromptResourceStatus(parent, 'result_confirmed')
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
        this.generate(
          sessionId,
          { parentRunId: parent.id, prompt: threeView.prompt },
          'threeview'
        )
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
            : ['concept', 'appearance', 'threeview', 'voice'].includes(
                  run.stage
                )
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
            name: `${asset.simulation ? '[模拟] ' : ''}${
              run.stage === 'voice'
                ? '人物声音样音'
                : run.stage === 'threeview'
                  ? '正侧背三视图'
                  : run.stage === 'appearance'
                    ? '形象调整候选'
                    : '概念图候选'
            }`,
            entityId: run.targetId,
            type: run.stage === 'voice' ? 'audio' : 'image',
            role:
              run.stage === 'voice'
                ? 'voice_candidate'
                : run.stage === 'threeview'
                  ? 'threeview'
                  : run.stage === 'appearance'
                    ? 'appearance_candidate'
                    : 'concept',
            assetId: id,
            workflowRunId: run.id,
            sourceAssetIds: asset.sourceAssetIds,
            status: 'candidate',
            simulation: Boolean(asset.simulation)
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
        if (status === 'waiting_confirmation')
          this.setPromptResourceStatus(run, 'awaiting_result_confirmation')
        else if (status === 'failed' || status === 'submission_unknown')
          this.setPromptResourceStatus(run, status)
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
      if (run.stage === 'threeview' && status === 'succeeded' && run.sessionId)
        this.maybeStartVoiceSample(run.sessionId)
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
        return this.structure(s.projectId, { ...body, sessionId: s.id })
      if (operation === 'refine_chapters')
        return this.refineChapters(sessionId, body)
      if (operation === 'propose_entities')
        return this.proposeEntities(sessionId, body)
      if (operation === 'add_reference')
        return this.addReference(sessionId, body)
      if (operation === 'update_resource')
        return this.updateEntityResourceForSession(sessionId, body)
      if (operation === 'update_entity_profile')
        return this.updateEntityProfile(sessionId, body)
      if (operation === 'generate_concepts')
        return this.generate(sessionId, body)
      if (operation === 'prepare_appearance_adjustment')
        return this.generate(sessionId, body, 'appearance')
      if (operation === 'generate_threeview')
        return this.generate(sessionId, body, 'threeview')
      if (operation === 'select_references')
        return this.selectReferences(sessionId, body)
      if (operation === 'set_voice_design')
        return this.setVoiceDesign(sessionId, body)
      requireThat(false, 'unknown operation')
    })
  }
}
