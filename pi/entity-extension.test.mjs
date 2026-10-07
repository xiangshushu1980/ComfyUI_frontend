// Owner: Sean.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installEntityExtension } from './entity-extension.mjs'
test('only business tool is active; foreign, nested and missing-receipt calls blocked', async () => {
  const hooks = new Map(),
    tools = [],
    active = []
  const pi = {
    on: (k, f) => hooks.set(k, f),
    registerTool: (t) => tools.push(t),
    setActiveTools: (t) => active.push(t)
  }
  const ctx = { sessionManager: { getSessionId: () => 'native-real' } }
  installEntityExtension(pi, {
    config: { apiUrl: 'http://test', capability: 'secret', discussionId: 'd' },
    fetch: async (url, r) => {
      const b = JSON.parse(r.body)
      assert.equal(b.sessionId, 'native-real')
      return Response.json(
        url.endsWith('receipt')
          ? { id: b.turnId, receipt: b.receipt }
          : { ok: true }
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
    action: 'handled'
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
  const payload = await hooks.get('before_provider_request')({ payload: {
    tools: [{ name: 'bash' }, { function: { name: 'entity_studio' } }],
    messages: [{ role: 'system', content: 'coding host identity' },
      { role: 'developer', content: 'foreign instructions' },
      { role: 'user', content: 'review source' }]
  } }, ctx)
  assert.equal(payload.tools.length, 1)
  assert.equal(payload.tools[0].function.name, 'entity_studio')
  assert.equal(payload.messages.length, 2)
  assert.match(payload.messages[0].content, /creative product agent/)
  assert.equal(payload.messages[1].content, 'review source')
  assert.equal(tools.length, 1)
})
