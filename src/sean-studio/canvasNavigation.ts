// Owner: Sean. Display hierarchy and routes; never rewrite persisted business facts.
export type CanvasObject = {
  id: string
  kind: string
  name?: string
  text?: string
  sourceId?: string
  parentId?: string
  chapterId?: string
  entityId?: string
  start?: number
  end?: number
  order?: number
  supersededBy?: string
  anchorIds?: string[]
  sources?: { sourceId: string; anchorId: string }[]
  fromId?: string
  toId?: string
  type?: string
  basis?: { id: string }[]
  status?: string
  role?: string
  assetId?: string
  outputs?: string[]
}
export type CanvasRoute = { projectId: string; path: string[] }
export function chapterHierarchy(objects: CanvasObject[]) {
  const byId = new Map(objects.map((o) => [o.id, o]))
  const parents = new Map<string, string>()
  const stacks = new Map<string, { id: string; level: number }[]>()
  const chapters = objects
    .filter((o) => o.kind === 'chapter' && !o.supersededBy)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
  for (const chapter of chapters) {
    const raw = (byId.get(chapter.sourceId || '')?.text || '')
      .slice(chapter.start, chapter.end)
      .split('\n')[0]
    const markdown = /^(#{1,6})\s/.exec(raw)
    const heading = chapter.name || ''
    const level = markdown
      ? markdown[1].length
      : /^第[零〇一二三四五六七八九十百千万\d]+[卷部]/.test(heading)
        ? 0
        : /^第[零〇一二三四五六七八九十百千万\d]+节/.test(heading)
          ? 2
          : 1
    const key = chapter.sourceId || ''
    const stack = stacks.get(key) || []
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop()
    const parent = chapter.parentId || stack.at(-1)?.id || chapter.sourceId
    if (parent && byId.has(parent) && parent !== chapter.id)
      parents.set(chapter.id, parent)
    stack.push({ id: chapter.id, level })
    stacks.set(key, stack)
  }
  return parents
}
export function objectHierarchy(objects: CanvasObject[]) {
  const parents = chapterHierarchy(objects)
  const ids = new Set(objects.map((o) => o.id))
  for (const o of objects) {
    if (o.kind === 'chapter') continue
    const parent = o.parentId || o.chapterId || o.entityId
    if (parent && parent !== o.id && ids.has(parent)) parents.set(o.id, parent)
  }
  return parents
}
export function isWithin(
  id: string,
  ancestor: string,
  parents: Map<string, string>
) {
  const seen = new Set<string>()
  while (id && !seen.has(id)) {
    if (id === ancestor) return true
    seen.add(id)
    id = parents.get(id) || ''
  }
  return false
}
export function objectPath(id: string, parents: Map<string, string>) {
  const path: string[] = []
  while (id && !path.includes(id)) {
    path.unshift(id)
    id = parents.get(id) || ''
  }
  return path
}
export function projectScope<T extends CanvasObject>(
  objects: T[],
  scopeId: string,
  showAllResources = false
): T[] {
  const parents = objectHierarchy(objects)
  const scope = objects.find((o) => o.id === scopeId)
  if (scopeId && !scope) return []
  const descendants = new Set(
    objects
      .filter((o) => scope && isWithin(o.id, scope.id, parents))
      .map((o) => o.id)
  )
  const related = new Set<string>()
  for (const relation of objects)
    if (
      ['data_relation', 'relation'].includes(relation.kind) &&
      descendants.has(relation.fromId || '') &&
      relation.toId
    )
      related.add(relation.toId)
  const chapters = objects.filter(
    (c) => c.kind === 'chapter' && descendants.has(c.id)
  )
  for (const entity of objects.filter((o) => o.kind === 'entity'))
    if (
      entity.sources?.some((s) =>
        chapters.some(
          (c) => c.sourceId === s.sourceId && c.anchorIds?.includes(s.anchorId)
        )
      )
    )
      related.add(entity.id)
  // Hide every location ancestor, including the current container itself.
  const excluded = new Set(scope ? objectPath(scope.id, parents) : [])
  return objects.filter((o) => {
    if (excluded.has(o.id) || o.supersededBy) return false
    if (o.kind === 'proposal')
      return (
        o.status === 'pending' &&
        (!scope || o.basis?.some((b) => descendants.has(b.id)))
      )
    if (o.kind === 'resource') {
      if (scope?.kind === 'workflow_run')
        return scope.outputs?.includes(o.assetId || '') || false
      if (scope?.kind === 'entity')
        return o.entityId === scope.id || descendants.has(o.id)
      return (
        (!scope || descendants.has(o.id) || related.has(o.entityId || '')) &&
        (showAllResources || ['concept', 'threeview'].includes(o.role || ''))
      )
    }
    return (
      ['source', 'chapter', 'scene', 'entity'].includes(o.kind) &&
      (!scope || descendants.has(o.id) || related.has(o.id))
    )
  })
}
export function routeHash(route: CanvasRoute) {
  return (
    '#/canvas/' +
    [route.projectId, ...route.path].map(encodeURIComponent).join('/')
  )
}
export function readRoute(hash: string): CanvasRoute | null {
  if (!hash.startsWith('#/canvas/')) return null
  try {
    const [projectId, ...path] = hash
      .slice(9)
      .split('/')
      .map(decodeURIComponent)
    return projectId ? { projectId, path: path.filter(Boolean) } : null
  } catch {
    return null
  }
}

// Use the geometry just drawn, independent of the upstream editor spatial index.
export function hitCanvasNode<
  T extends { pos: ArrayLike<number>; size: ArrayLike<number> }
>(nodes: T[], x: number, y: number) {
  return nodes.findLast(
    (node) =>
      x >= node.pos[0] &&
      x <= node.pos[0] + node.size[0] &&
      y >= node.pos[1] - 32 &&
      y <= node.pos[1] + node.size[1]
  )
}
