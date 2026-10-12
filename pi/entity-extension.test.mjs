// Owner: Sean.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installEntityExtension } from './entity-extension.mjs'
test('native PiWeb input obtains bound receipt; foreign and nested tools blocked', async () => {
  const hooks = new Map(),
    tools = [],
    active = []
  const pi = {
    on: (k, f) => hooks.set(k, f),
    registerTool: (t) => tools.push(t),
    setActiveTools: (t) => active.push(t)
  }
  const cwd = mkdtempSync(join(tmpdir(), 'sean-extension-skills-'))
  mkdirSync(join(cwd, '.pi'), { recursive: true })
  cpSync(new URL('./skills/', import.meta.url), join(cwd, '.pi/skills'), { recursive: true })
  const ctx = { cwd, sessionManager: { getSessionId: () => 'native-real' } }
  installEntityExtension(pi, {
    config: { apiUrl: 'http://test', capability: 'secret', discussionId: 'd' },
    fetch: async (url, r) => {
      const b = JSON.parse(r.body)
      assert.equal(b.sessionId, 'native-real')
      return Response.json(
        url.endsWith('direct-input') ? { id: 'direct-turn', receipt: 'b'.repeat(64) } : url.endsWith('receipt')
          ? { id: b.turnId, receipt: b.receipt }
          : { workflow: { session: { workflowId: 'CreateEntity' } } }
      )
    }
  })
  await hooks.get('session_start')({}, ctx)
  assert.deepEqual(active[0], ['entity_studio'])
  assert.equal(hooks.get('tool_call')({ toolName: 'bash' }).block, true)
  assert.equal(
    hooks.get('tool_call')({ toolName: 'entity_studio' }).block,
    true
  )
  assert.deepEqual(await hooks.get('input')({ text: 'unbound' }, ctx), {
    action: 'continue'
  })
  const receipt = 'a'.repeat(64)
  await hooks.get('input')(
    { text: '[entity-studio-turn:abcdef-123:' + receipt + ']\nhello' },
    ctx
  )
  assert.equal(hooks.get('tool_call')({ toolName: 'entity_studio' }), undefined)
  assert.equal(
    hooks.get('tool_call')({ toolName: 'codemode', toolCallId: 'nested/1' })
      .block,
    true
  )
  const prompt = await hooks.get('before_agent_start')({}, ctx)
  assert.match(prompt.systemPrompt, /not a coding agent/)
  assert.match(prompt.systemPrompt, /Qwen Image 2.1 prompting/)
  assert.match(prompt.systemPrompt, /must not submit generation/)
  const payload = await hooks.get('before_provider_request')({ payload: {
    tools: [{ name: 'bash' }, { function: { name: 'entity_studio' } }],
    messages: [{ role: 'system', content: 'coding host identity' },
      { role: 'developer', content: 'foreign instructions' },
      { role: 'user', content: 'review source' }]
  } }, ctx)
  assert.equal(payload.tools.length, 1)
  assert.equal(payload.tools[0].function.name, 'entity_studio')
  assert.equal(payload.messages.length, 2)
  assert.match(payload.messages[0].content, /creative product workflow agent/)
  assert.equal(payload.messages[1].content, 'review source')
  assert.equal(tools.length, 1)
})
