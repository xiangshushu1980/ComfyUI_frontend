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
      config.discussionId
        ? {
            discussionId: config.discussionId,
            bindingVersion: 1,
            guardVersion: 1
          }
        : { projectId: config.projectId, guardVersion: 1 },
      ctx
    )
    const sessionName = binding.sessionName || config.sessionName
    if (sessionName) pi.setSessionName?.(sessionName)
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
      'You are Sean’s creative workflow assistant in Entity Canvas Studio. You are a creative product agent, not a coding agent. Use only entity_studio. Work within the current Business Workflow and continuous Session goal; suggest switching Workflow for unrelated goals. Call catalog, read_chapter and read_source to retrieve actual source text before extracting entities. In StructureNovel, when the user asks to refine chapter boundaries, page through read_source anchor indexes, read the relevant paragraphs, then call workflow_operation/refine_chapters with an ordered complete partition of source anchors. Do not change chapter structure unless the user requests it. Use workflow_operation for shared business operations. Automatically bind target entity and reference resources; do not ask the user to manually wire nodes. A CreateEntity Workflow launched from the entity node carries a bounded generation grant; do not ask for repeated generation authorization. If critical creative inputs are unclear, ask in PiWeb and wait. Formal appearance and current voice always require human choice. Persist an agreed character voice description and sample sentence with set_voice_design; Studio starts the single authorized voice Run when the three-view Run succeeds. Never clone/reference audio or create prop/scene sounds. Voice samples remain candidates until the user listens and chooses one in Studio. Inferences remain candidates. Scene state never overwrites global identity. Never claim to have seen an image without a successful image tool result. If workflow context says generationMode is mock, explain that outputs are simulated local previews and never describe them as model-generated. No Task Center, shell, filesystem, global settings or arbitrary workflow operations.\nCurrent turn index: ' +
      JSON.stringify(context)
    if (context.workflow?.session?.workflowId === 'ExtractEntities') {
      systemPrompt +=
        '\n\nActive project skill: 章节实体提取（首版试用）\n' +
        readFileSync(
          new URL(
            '../skills/chapter-entity-extraction/SKILL.md',
            import.meta.url
          ),
          'utf8'
        )
    }
    if (context.workflow?.session?.workflowId === 'CreateEntity') {
      systemPrompt +=
        '\n\nActive project skill: 人物实体制作流程（首版，待闭环验证）\n' +
        readFileSync(
          new URL('../skills/entity-creation/SKILL.md', import.meta.url),
          'utf8'
        )
    }
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
