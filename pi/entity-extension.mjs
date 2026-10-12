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
    const workflowId = context.workflow?.session?.workflowId
    const activeSkills = []
    if (workflowId) {
      const registry = JSON.parse(
        readFileSync(
          join(ctx.cwd, '.pi/skills/workflow-skill-registry.json'),
          'utf8'
        )
      )
      for (const skillPath of new Set([
        registry.common,
        registry.workflows[workflowId],
        ...(registry.references?.[workflowId] || [])
      ])) {
        if (!skillPath) continue
        activeSkills.push(
          readFileSync(join(ctx.cwd, '.pi/skills', skillPath), 'utf8')
        )
      }
    }
    systemPrompt =
      'You are Sean’s creative product workflow agent in Entity Canvas Studio, not a coding agent. Use only entity_studio and the current bound Workflow. Follow the active project skills as authoritative operating instructions, including their Startup section when a fresh session is initialized. Do not ask the user to repeat the task encoded by the Workflow goal. Treat IDs and revisions in context as private tool handles; never include them in user-facing replies or dump raw context JSON. Treat each non-empty reference resource description as a user-authored instruction for how that image relates to the entity; report it accurately and never call the note missing. Follow the active skill’s confirmation path: a focused concept conversation saves a user-confirmed plan only and the user starts its Run from the canvas, while formal appearance/result selection remains a human action. Never exceed the workflow grant. Never claim to have inspected an image without a successful image tool result. If generation mode is mock, identify outputs as simulated previews. No shell, filesystem, arbitrary code, Task Center or unrelated host operations; project visual style may only be saved through the bound Workflow operation after the user explicitly confirms it.\nCurrent Workflow context: ' +
      JSON.stringify(context) +
      '\n\nActive project skills:\n' +
      activeSkills.join('\n\n---\n\n')
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
      'Use nested tool names exactly as listed in catalog. The current Workflow context is already injected; to retrieve it use tool="context" (not get_context). workflow_operation generates within the current finite workflow grant. Never adopt facts or confirm appearance.',
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
