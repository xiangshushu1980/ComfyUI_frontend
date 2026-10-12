// Owner: Sean. Prevent Pi Web empty-session fallback to another conversation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PiBridge } from './pi-bridge.mjs'
test('exact session must enter native catalog before returning its navigation URL', async () => {
  const binding = {
    id: 'binding',
    sessionId: 'exact',
    discussionId: 'discussion',
    cwd: '/approved/workspace'
  }
  const bridge = new PiBridge({ get: () => binding }, '/private')
  let calls = 0,
    sent
  bridge.request = async () => ({
    sessions: calls++
      ? [{ id: 'exact', cwd: '/approved/workspace' }]
      : [{ id: 'unrelated', cwd: '/other/workspace' }]
  })
  bridge.send = async (id, body) => {
    sent = { id, body }
  }
  const result = await bridge.ensureNavigable(binding)
  assert.match(result.piWebUrl, /session=exact$/)
  assert.equal(
    new URL(result.piWebWorkspaceUrl).searchParams.get('cwd'),
    '/approved/workspace'
  )
  assert.equal(sent.id, 'discussion')
  assert.equal(sent.body.requestId, 'initialize:exact')
  assert.match(sent.body.text, /不得绕过人工采纳、生成配置确认或结果确认/)
  sent = undefined
  await bridge.ensureNavigable(binding)
  assert.equal(sent, undefined)
})

test('product workspace deploys registered skills and their referenced documents', async () => {
  const { mkdtempSync, readFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { Store } = await import('./store.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'sean-skills-'))
  const store = new Store(join(dir, 'studio.sqlite'))
  try {
    const discussion = store.transaction(() => {
      const project = store.createProject({ name: 'Skill deployment' })
      return store.create(project.id, 'discussion', { name: 'Concept plan' })
    })
    const bridge = new PiBridge(store, dir)
    const binding = await bridge.prepareWorkspace(discussion.id)
    const registry = JSON.parse(readFileSync(join(binding.cwd, '.pi/skills/workflow-skill-registry.json'), 'utf8'))
    for (const file of [registry.common, ...Object.values(registry.workflows)])
      assert.match(readFileSync(join(binding.cwd, '.pi/skills', file), 'utf8'), /Owner: Sean/)
    assert.match(readFileSync(join(binding.cwd, '.pi/skills/entity-creation/references/qwen-image-2-1-prompting.md'), 'utf8'), /<image1>/)
    assert.equal(binding.sessionId, null)
  } finally { store.close() }
})
