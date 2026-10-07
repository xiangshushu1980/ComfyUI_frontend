// Owner: Sean. Exercise persistence, atomicity and authorization boundaries.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from './store.mjs'
import { createSource, propose, adopt } from './domain.mjs'
import { compileQwen, verifyWorkflow } from './qwen.mjs'
const fixture = () => {
  const file = join(mkdtempSync(join(tmpdir(), 'sean-domain-')), 'test.sqlite'),
    s = new Store(file)
  const p = s.write('project', { requestId: 'p' }, () =>
    s.createProject({ name: 'test' })
  )
  return { s, p, file }
}
test('same request replays; changed content conflicts; reopen preserves outbox', () => {
  let { s, p, file } = fixture()
  const b = { requestId: 'c', name: 'chapter' }
  const c = s.write('chap', b, () => s.create(p.id, 'chapter', b))
  assert.deepEqual(
    s.write('chap', b, () => {
      throw Error('replayed')
    }),
    c
  )
  assert.throws(
    () => s.write('chap', { ...b, name: 'new' }, () => null),
    /different content/
  )
  s.close()
  s = new Store(file)
  assert.equal(s.get(c.id).name, 'chapter')
  assert.equal(s.events(p.id).length, 2)
  s.close()
})
test('partial adoption with dangling relationship rolls back everything', () => {
  const { s, p } = fixture()
  const source = s.transaction(() =>
    createSource(s, p.id, { text: '人物甲。\n\n人物乙。' })
  )
  const proposal = s.transaction(() =>
    propose(s, p.id, {
      items: [
        {
          key: 'a',
          kind: 'entity',
          type: 'character',
          name: 'A',
          sources: [{ sourceId: source.id, revision: 1, anchorId: 'P1' }]
        },
        { key: 'b', kind: 'entity', type: 'character', name: 'B' },
        { key: 'r', kind: 'relation', from: 'a', to: 'b', description: '同事' }
      ]
    })
  )
  const before = s.events(p.id).length
  assert.throws(() =>
    s.write(
      'adopt',
      {
        requestId: 'x',
        expectedHash: proposal.contentHash,
        selectedKeys: ['a', 'r']
      },
      () =>
        adopt(s, proposal.id, {
          expectedHash: proposal.contentHash,
          selectedKeys: ['a', 'r']
        })
    )
  )
  assert.equal(s.list(p.id, 'entity').length, 0)
  assert.equal(s.get(proposal.id).status, 'pending')
  assert.equal(s.events(p.id).length, before)
  const result = s.write('adopt', { requestId: 'y' }, () =>
    adopt(s, proposal.id, {
      expectedHash: proposal.contentHash,
      selectedKeys: ['a', 'b', 'r']
    })
  )
  assert.equal(result.adopted.length, 3)
  assert.equal(s.list(p.id, 'decision').length, 1)
  s.close()
})
test('stale proposals reject and scene state leaves global/history unchanged', () => {
  const { s, p } = fixture()
  const e = s.transaction(() =>
    s.create(p.id, 'entity', {
      type: 'character',
      name: '林乔',
      description: '深蓝夹克，无伤'
    })
  )
  const chapter = s.transaction(() =>
    s.create(p.id, 'chapter', { name: '第二章' })
  )
  const scene = s.transaction(() =>
    s.create(p.id, 'scene', { chapterId: chapter.id, name: '归还' })
  )
  const prop = s.transaction(() =>
    propose(s, p.id, {
      basis: [{ id: e.id, revision: 1 }],
      items: [
        {
          key: 'local',
          kind: 'entity_use',
          entityId: e.id,
          entityRevision: 1,
          sceneId: scene.id,
          state: { coat: '雨披', hand: '擦伤' }
        }
      ]
    })
  )
  s.write('adopt', { requestId: 'local' }, () =>
    adopt(s, prop.id, {
      expectedHash: prop.contentHash,
      selectedKeys: ['local']
    })
  )
  assert.equal(s.get(e.id).description, '深蓝夹克，无伤')
  assert.equal(s.get(e.id).revision, 1)
  assert.equal(s.list(p.id, 'entity_use')[0].entityRevision, 1)
  const stale = s.transaction(() =>
    propose(s, p.id, {
      basis: [{ id: e.id, revision: 1 }],
      items: [
        {
          key: 'a',
          kind: 'entity',
          targetId: e.id,
          expectedRevision: 1,
          type: 'character',
          name: 'Q'
        }
      ]
    })
  )
  s.transaction(() => s.update(e.id, 1, { description: '人工修改' }))
  assert.throws(
    () =>
      s.write('stale', { requestId: 'no' }, () =>
        adopt(s, stale.id, {
          expectedHash: stale.contentHash,
          selectedKeys: ['a']
        })
      ),
    /basis conflict/
  )
  assert.equal(s.get(e.id, 1).description, '深蓝夹克，无伤')
  s.close()
})
test('source anchor and project boundaries are enforced', () => {
  const { s, p } = fixture()
  const other = s.transaction(() => s.createProject({ name: 'other' }))
  const source = s.transaction(() =>
    createSource(s, other.id, { text: 'other' })
  )
  assert.throws(
    () =>
      s.transaction(() =>
        propose(s, p.id, {
          items: [
            {
              key: 'a',
              kind: 'entity',
              type: 'character',
              name: 'A',
              sources: [{ sourceId: source.id, revision: 1, anchorId: 'P1' }]
            }
          ]
        })
      ),
    /project/
  )
  s.close()
})
test('dual graph verifier rejects unexpected nodes and execution differences', () => {
  const expected = compileQwen()
  const workflow = {
    nodes: Object.entries(expected.graph).map(([id, n]) => ({
      id: Number(id),
      type: n.class_type
    }))
  }
  assert.equal(
    verifyWorkflow({ workflow, output: expected.graph }, expected).verified,
    true
  )
  const output = structuredClone(expected.graph)
  output['7'].inputs.steps = 30
  assert.throws(
    () => verifyWorkflow({ workflow, output }, expected),
    /mismatch/
  )
  assert.throws(
    () =>
      verifyWorkflow(
        {
          workflow: { nodes: [...workflow.nodes, { id: 20, type: 'Unknown' }] },
          output: expected.graph
        },
        expected
      ),
    /unknown/
  )
})
