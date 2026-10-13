// Owner: Sean. All human adoption is transactional and version checked.
import { hash, requireThat } from './store.mjs'
export function createSource(store, projectId, body) {
  requireThat(
    typeof body.text === 'string' &&
      body.text.trim() &&
      Buffer.byteLength(body.text) <= 10 * 1024 * 1024,
    'source must be nonempty and <=10MB'
  )
  let offset = 0
  const anchors = body.text.split(/\n\s*\n/).map((text, i) => {
    const start = body.text.indexOf(text, offset)
    offset = start + text.length
    return { id: `P${i + 1}`, start, end: offset, hash: hash(text) }
  })
  return store.create(projectId, 'source', {
    name: body.name || '原文',
    text: body.text,
    hash: hash(body.text),
    anchors
  })
}
export function validateSources(store, projectId, sources = []) {
  requireThat(Array.isArray(sources), 'sources must be array')
  for (const s of sources) {
    const source = store.sameProject(s.sourceId, projectId, 'source')
    requireThat(
      s.revision === source.revision &&
        source.anchors.some((a) => a.id === s.anchorId),
      'invalid source anchor'
    )
  }
}
export function propose(store, projectId, body) {
  requireThat(
    Array.isArray(body.items) &&
      body.items.length > 0 &&
      body.items.length <= 40,
    'proposal requires 1..40 items'
  )
  requireThat(
    new Set(body.items.map((i) => i.key)).size === body.items.length,
    'duplicate candidate keys'
  )
  for (const item of body.items) {
    requireThat(
      typeof item.key === 'string' && item.key.trim().length > 0,
      'each candidate needs a unique nonempty key'
    )
    if (item.kind === 'entity')
      requireThat(
        ['character', 'location', 'prop'].includes(item.type) &&
          typeof item.name === 'string' &&
          item.name.trim(),
        'entity type/name required'
      )
    requireThat(
      ['entity', 'relation', 'entity_use', 'image_input'].includes(item.kind),
      'unsupported proposal kind'
    )
    requireThat(
      !(item.kind === 'entity' && (item.sceneId || item.scope === 'scene')),
      'scene state must use entity_use, not a global entity'
    )
    validateSources(store, projectId, item.sources)
    if (item.targetId) store.sameProject(item.targetId, projectId)
    if (item.kind === 'entity_use')
      store.sameProject(item.sceneId, projectId, 'scene')
  }
  const basis = body.basis || []
  for (const b of basis)
    requireThat(
      store.sameProject(b.id, projectId).revision === b.revision,
      'stale proposal basis',
      409
    )
  return store.create(projectId, 'proposal', {
    items: body.items,
    basis,
    discussionId: body.discussionId || null,
    status: 'pending',
    workflowRunId: body.workflowRunId || null,
    resolved: {},
    contentHash: hash({ items: body.items, basis })
  })
}
export function adopt(store, id, body, actor = 'human') {
  const p = store.get(id)
  requireThat(
    p.kind === 'proposal' && p.status === 'pending',
    'proposal is not pending',
    409
  )
  requireThat(
    body.expectedHash === p.contentHash,
    'proposal hash conflict',
    409
  )
  for (const b of p.basis)
    requireThat(
      store.get(b.id).revision === b.revision,
      'adoption basis conflict',
      409
    )
  requireThat(
    Array.isArray(body.selectedKeys) && body.selectedKeys.length,
    'select candidates'
  )
  const resolved = p.resolved || {}
  const selected = p.items.filter(
    (i) => body.selectedKeys.includes(i.key) && !resolved[i.key]
  )
  requireThat(
    selected.length === body.selectedKeys.length,
    'unknown selected key'
  )
  for (const item of selected)
    requireThat(
      typeof item.key === 'string' &&
        !(item.kind === 'entity' && (item.sceneId || item.scope === 'scene')),
      'legacy proposal schema invalid; ask PI for corrected candidates',
      409
    )
  const map = Object.fromEntries(
      Object.entries(resolved)
        .filter(([, v]) => v.objectId)
        .map(([k, v]) => [k, v.objectId])
    ),
    adopted = []
  const endpoint = (key) =>
    map[key] || store.sameProject(key, p.projectId, 'entity').id
  for (const i of selected.filter((i) => i.kind === 'entity')) {
    requireThat(
      ['character', 'location', 'prop'].includes(i.type) &&
        typeof i.name === 'string' &&
        i.name.trim(),
      'entity type/name required'
    )
    const isNew = !i.targetId
    const fields = {
      type: i.type,
      name: i.name,
      description: i.description || '',
      sources: i.sources || [],
      proposalId: p.id,
      ...(actor === 'agent_auto' && isNew
        ? { origin: 'ai_agent', flags: ['ai-created'] }
        : {})
    }
    const entity = i.targetId
      ? store.update(i.targetId, i.expectedRevision, fields)
      : store.create(p.projectId, 'entity', fields)
    map[i.key] = entity.id
    adopted.push(entity)
  }
  for (const i of selected.filter((i) => i.kind === 'relation')) {
    const fromId = endpoint(i.from),
      toId = endpoint(i.to)
    adopted.push(
      store.create(p.projectId, 'relation', {
        fromId,
        toId,
        description: i.description,
        scope: i.sceneId ? 'scene' : 'global',
        sceneId: i.sceneId || null,
        sources: i.sources || [],
        proposalId: p.id
      })
    )
    if (i.sceneId) store.sameProject(i.sceneId, p.projectId, 'scene')
  }
  for (const i of selected.filter((i) => i.kind === 'entity_use')) {
    const entityId = endpoint(i.entityId),
      entity = store.get(entityId, i.entityRevision)
    requireThat(
      entity.projectId === p.projectId && entity.kind === 'entity',
      'invalid fixed entity revision'
    )
    store.sameProject(i.sceneId, p.projectId, 'scene')
    for (const prop of i.propIds || [])
      store.sameProject(prop, p.projectId, 'entity')
    adopted.push(
      store.create(p.projectId, 'entity_use', {
        sceneId: i.sceneId,
        entityId,
        entityRevision: entity.revision,
        state: i.state,
        propIds: i.propIds || [],
        sources: i.sources || [],
        proposalId: p.id
      })
    )
  }
  requireThat(
    !selected.some((i) => i.kind === 'image_input'),
    'image input adoption adapter not ready',
    503
  )
  const decision = store.create(p.projectId, 'decision', {
    proposalId: id,
    selectedKeys: body.selectedKeys,
    mapping: map,
    adoptedIds: adopted.map((i) => i.id),
    actor,
    sources: selected.flatMap((i) => i.sources || [])
  })
  for (const item of selected)
    resolved[item.key] = {
      decisionId: decision.id,
      objectId: map[item.key] || null,
      status: 'adopted'
    }
  const fullyResolved = p.items.every((item) => resolved[item.key])
  const allAdopted = p.items.every(
    (item) => resolved[item.key]?.status === 'adopted'
  )
  store.update(id, p.revision, {
    status: fullyResolved ? (allAdopted ? 'adopted' : 'resolved') : 'pending',
    resolved,
    decisionId: decision.id
  })
  return { decision, adopted }
}

export function rejectCandidate(store, id, body) {
  const proposal = store.get(id)
  requireThat(
    proposal.kind === 'proposal' && proposal.status === 'pending',
    'proposal is not pending',
    409
  )
  requireThat(
    body.expectedHash === proposal.contentHash,
    'proposal hash conflict',
    409
  )
  const candidate = proposal.items.find((item) => item.key === body.key)
  requireThat(candidate, 'unknown candidate key', 404)
  requireThat(
    !proposal.resolved?.[body.key],
    'candidate is already resolved',
    409
  )
  const decision = store.create(proposal.projectId, 'decision', {
    proposalId: proposal.id,
    selectedKeys: [],
    rejectedKeys: [body.key],
    mapping: {},
    adoptedIds: [],
    actor: 'human'
  })
  const resolved = {
    ...(proposal.resolved || {}),
    [body.key]: { decisionId: decision.id, objectId: null, status: 'rejected' }
  }
  const fullyResolved = proposal.items.every((item) => resolved[item.key])
  const updated = store.update(proposal.id, proposal.revision, {
    status: fullyResolved
      ? proposal.items.every((item) => resolved[item.key]?.status === 'adopted')
        ? 'adopted'
        : 'resolved'
      : 'pending',
    resolved,
    decisionId: decision.id
  })
  return { proposal: updated, decision }
}
