// Owner: Sean. Product-only native PI extension. No shell/read/write tools.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
export function installEntityExtension(pi, options = {}) {
  let binding, turn, systemPrompt
  let config = options.config
  function getConfig(ctx) {
    return (config ||= JSON.parse(
      readFileSync(join(ctx.cwd, '.entity-studio-binding.json'), 'utf8')
    ))
  }
  const fetcher = options.fetch || fetch
  const invoke = async (path, body, ctx) => {
    const config = getConfig(ctx)
    const sessionId = ctx.sessionManager.getSessionId()
    const response = await fetcher(config.apiUrl + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + config.capability
      },
      body: JSON.stringify({ ...body, sessionId })
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Entity bridge unavailable')
    return data
  }
  const narrow = () => pi.setActiveTools(['entity_studio'])
  pi.on('session_start', async (_event, ctx) => {
    const config = getConfig(ctx)
    narrow()
    binding = await invoke(
      '/internal/pi/bind',
      { discussionId: config.discussionId, bindingVersion: 1, guardVersion: 1 },
      ctx
    )
  })
  pi.on('input', async (event, ctx) => {
    narrow()
    const match = event.text?.match(
      /^\[entity-studio-turn:([a-f0-9-]+):([a-f0-9]{64})\]\n/
    )
    if (!match) {
      turn = await invoke(
        '/internal/pi/direct-input',
        { text: event.text },
        ctx
      )
      return { action: 'continue' }
    }
    turn = await invoke(
      '/internal/pi/receipt',
      { turnId: match[1], receipt: match[2] },
      ctx
    )
    return { action: 'transform', text: event.text.slice(match[0].length) }
  })
  pi.on('before_agent_start', async (_event, ctx) => {
    narrow()
    if (!binding || !turn)
      throw new Error('A valid studio turn receipt is required')
    const context = await invoke(
      '/internal/pi/tool',
      { turnId: turn.id, receipt: turn.receipt, tool: 'context', args: {} },
      ctx
    )
    systemPrompt =
      'You are Sean’s creative workflow assistant in Entity Canvas Studio. You are a creative product agent, not a coding agent. Use only entity_studio. Work within the current Business Workflow and continuous Session goal; suggest switching Workflow for unrelated goals. Call catalog, read_chapter and read_source to retrieve actual source text before extracting entities. Use workflow_operation for shared business operations. Automatically bind target entity and reference resources; do not ask the user to manually wire nodes. Read current human generation grant before generating; scoped finite execution only. Key entities and formal appearance require human confirmation. After formal appearance confirmation the authorized fixed ThreeView step is scheduled automatically; inspect runs instead of submitting it again. Inferences remain candidates. Scene state never overwrites global identity. Never claim to have seen an image without a successful image tool result. No Task Center, shell, filesystem, global settings or arbitrary workflow operations.\nCurrent turn index: ' +
      JSON.stringify(context)
    return { systemPrompt }
  })
  pi.on('before_provider_request', async (event, ctx) => {
    if (!turn || !systemPrompt)
      throw new Error('Studio prompt receipt is missing')
    narrow()
    const payload = structuredClone(event.payload)
    const toolName = (t) => t.name || t.function?.name
    if (Array.isArray(payload.tools))
      payload.tools = payload.tools.filter(
        (t) => toolName(t) === 'entity_studio'
      )
    for (const key of ['messages', 'input'])
      if (Array.isArray(payload[key])) {
        payload[key] = payload[key].filter(
          (m) => !['system', 'developer'].includes(m.role)
        )
        payload[key].unshift({ role: 'system', content: systemPrompt })
      }
    if (payload.system !== undefined) payload.system = systemPrompt
    await invoke(
      '/internal/pi/request-audit',
      {
        turnId: turn.id,
        receipt: turn.receipt,
        provider: ctx.model?.provider,
        modelId: ctx.model?.id,
        modelInput: ctx.model?.input || [],
        toolNames: (payload.tools || []).map(toolName),
        systemPrompt
      },
      ctx
    )
    return payload
  })
  pi.on('tool_call', (event) => {
    if (event.toolName !== 'entity_studio' || !turn)
      return {
        block: true,
        reason:
          'Entity Studio permits only its bound business tool, including nested calls.'
      }
  })
  pi.on('user_bash', () => ({
    handled: true,
    result: {
      output: 'Shell disabled in Entity Studio.',
      exitCode: 1,
      cancelled: false,
      truncated: false
    }
  }))
  pi.on('session_shutdown', () => {
    turn = undefined
    binding = undefined
  })
  pi.on('agent_end', async (_event, ctx) => {
    if (turn)
      await invoke(
        '/internal/pi/direct-end',
        { turnId: turn.id, receipt: turn.receipt },
        ctx
      )
    turn = undefined
  })
  pi.registerTool({
    name: 'entity_studio',
    label: '[Sean] Entity Studio',
    description:
      'Read the current Workflow context and call catalog for shared operations. workflow_operation generates within the current finite workflow grant. Legacy submit_action requires a signed one-use action. Never adopt facts or confirm appearance.',
    parameters: {
      type: 'object',
      properties: {
        tool: { type: 'string' },
        args: { type: 'object', additionalProperties: true }
      },
      required: ['tool', 'args'],
      additionalProperties: false
    },
    async execute(_id, params, _signal, _update, ctx) {
      if (!turn) throw new Error('No active studio receipt')
      const data = await invoke(
        '/internal/pi/tool',
        { turnId: turn.id, receipt: turn.receipt, ...params },
        ctx
      )
      return {
        content: data.content || [{ type: 'text', text: JSON.stringify(data) }],
        details: data
      }
    }
  })
}
export default function entityExtension(pi) {
  installEntityExtension(pi)
}
