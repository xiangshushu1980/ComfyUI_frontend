// Owner: Sean. Navigation scope tests use no private data or browser/GPU service.
import test from 'node:test'
import assert from 'node:assert/strict'
import { canDrill, hitCanvasNode, objectHierarchy, objectPath, projectScope, readRoute, routeHash } from '../src/sean-studio/canvasNavigation.ts'
const objects = [
  { id: 'novel', kind: 'source' },
  { id: 'chapter', kind: 'chapter', sourceId: 'novel', name: '第一章', order: 0 },
  { id: 'section', kind: 'chapter', sourceId: 'novel', name: '第一节', order: 1, anchorIds: ['p1'] },
  { id: 'other', kind: 'chapter', sourceId: 'novel', name: '第二章', order: 2 },
  { id: 'scene', kind: 'scene', chapterId: 'section' },
  { id: 'entity', kind: 'entity', sources: [{ sourceId: 'novel', anchorId: 'p1' }] },
  { id: 'image', kind: 'resource', entityId: 'entity', role: 'concept', assetId: 'asset' },
  { id: 'reference', kind: 'resource', entityId: 'entity', role: 'reference' },
  { id: 'run', kind: 'workflow_run', outputs: ['asset'] }
]
const ids = (scope) => projectScope(objects, scope).map((o) => o.id)
test('drilling retains current node and hides ancestors and other branches', () => {
  assert.deepEqual(objectPath('section', objectHierarchy(objects)), ['novel', 'chapter', 'section'])
  assert.deepEqual(ids('chapter'), ['chapter', 'section', 'scene', 'entity'])
  assert.deepEqual(ids('section'), ['section', 'scene', 'entity'])
  assert.deepEqual(ids('scene'), ['scene'])
  assert.deepEqual(ids('missing'), [])
})
test('all entity resources and run outputs retain the current node', () => {
  assert.deepEqual(ids('entity'), ['entity', 'image', 'reference'])
  assert.deepEqual(ids('run'), ['image', 'run'])
  assert.deepEqual(ids('image'), ['image'])
  assert.ok(ids('').includes('novel'))
})
test('refresh and browser history routes preserve exact project and contextual path', () => {
  const route = { projectId: 'test / 工程', path: ['novel', '章/节', 'entity'] }
  assert.deepEqual(readRoute(routeHash(route)), route)
  assert.deepEqual(readRoute(routeHash({ ...route, path: route.path.slice(0, -1) }))?.path, ['novel', '章/节'])
  assert.equal(readRoute('#/canvas/%broken'), null)
  assert.equal(readRoute('#unrelated'), null)
})
test('legacy cyclic parents cannot trap navigation', () => {
  const cyclic = [{ id: 'a', kind: 'scene', parentId: 'b' }, { id: 'b', kind: 'scene', parentId: 'a' }]
  assert.deepEqual(objectPath('a', objectHierarchy(cyclic)), ['b', 'a'])
  assert.deepEqual(projectScope(cyclic, 'a'), [cyclic[0]])
})

test('rapid drill hit detection uses current drawn geometry and includes titles', () => {
  const node = { id: 'new-child', pos: new Float32Array([0, 0]), size: new Float32Array([320, 150]) }
  assert.equal(hitCanvasNode([node], 90, 69)?.id, 'new-child')
  assert.equal(hitCanvasNode([node], 90, -20)?.id, 'new-child')
  assert.equal(hitCanvasNode([node], 90, -40), undefined)
  assert.equal(hitCanvasNode([node], 330, 69), undefined)
})
test('scene drill follows shared entity references without showing scene or chapter parents', () => {
  const shared = [...objects, { id: 'reference-edge', kind: 'data_relation', fromId: 'scene', toId: 'entity', type: 'references' }]
  assert.deepEqual(projectScope(shared, 'scene').map((o) => o.id), ['scene', 'entity'])
  assert.deepEqual(projectScope(shared, 'entity').map((o) => o.id), ['entity', 'image', 'reference'])
})

test('only nodes with descendant or related content can drill', () => {
  for (const id of ['novel', 'chapter', 'section', 'entity', 'run']) assert.equal(canDrill(objects, id), true, id)
  for (const id of ['other', 'scene', 'image', 'reference', 'missing']) assert.equal(canDrill(objects, id), false, id)
})
