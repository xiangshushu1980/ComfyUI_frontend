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
    sessions: calls++ ? [{ id: 'exact' }] : [{ id: 'unrelated' }]
  })
  bridge.send = async (id, body) => {
    sent = { id, body }
  }
  const result = await bridge.ensureNavigable(binding)
  assert.match(result.piWebUrl, /session=exact$/)
  assert.equal(sent.id, 'discussion')
  assert.equal(sent.body.requestId, 'initialize:exact')
  assert.match(sent.body.text, /不生成、不采用、不确认/)
  sent = undefined
  await bridge.ensureNavigable(binding)
  assert.equal(sent, undefined)
})
