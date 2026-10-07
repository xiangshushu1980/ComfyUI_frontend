// Owner: Sean. Fixed template compiler and UI/API contract verification.
import { readFileSync } from 'node:fs'
import { hash, requireThat } from './store.mjs'
const base = JSON.parse(
  readFileSync(new URL('../templates/qwen/api.v1.json', import.meta.url))
).graph
export function compileQwen(input = {}, prefix = 'sean_entity_canvas_preview') {
  const g = structuredClone(base)
  const prompt =
    input.prompt ||
    'A cinematic photorealistic character portrait, neutral gray background.'
  requireThat(
    typeof prompt === 'string' && prompt.length <= 12000,
    'invalid prompt'
  )
  const seed = input.seed ?? 42,
    steps = input.steps ?? 25,
    width = input.width ?? 1536,
    height = input.height ?? 1024
  requireThat(
    Number.isSafeInteger(seed) &&
      seed >= 0 &&
      Number.isInteger(steps) &&
      steps >= 1 &&
      steps <= 50,
    'invalid seed/steps'
  )
  requireThat(
    [
      [1536, 1024],
      [1024, 1536],
      [1024, 1024]
    ].some(([w, h]) => w === width && h === height),
    'size not allowed'
  )
  requireThat(
    Array.isArray(input.references || []) &&
      (input.references || []).length <= 16,
    'max 16 ordered references'
  )
  for (const [index, reference] of (input.references || []).entries()) {
    requireThat(
      typeof reference.image === 'string' &&
        /^sean_entity_canvas\/[a-f0-9]{64}\.png$/.test(reference.image),
      'unregistered reference image'
    )
    const id = String(10 + index)
    g[id] = { class_type: 'LoadImage', inputs: { image: reference.image } }
    g['5'].inputs[`images.image_${index + 1}`] = [id, 0]
  }
  g['5'].inputs.prompt = prompt + (input.style ? '\n' + input.style : '')
  g['6'].inputs.width = width
  g['6'].inputs.height = height
  g['7'].inputs.seed = seed
  g['7'].inputs.steps = steps
  g['9'].inputs.filename_prefix = prefix
  return {
    templateId: 'qwen-image-2.1.concept',
    version: 1,
    graph: g,
    apiHash: hash(g),
    effectivePrompt: g['5'].inputs.prompt
  }
}
export function normalizeApi(graph) {
  const normalized = {}
  for (const id of Object.keys(graph).sort()) {
    const n = graph[id]
    requireThat(
      n &&
        typeof n.class_type === 'string' &&
        n.inputs &&
        typeof n.inputs === 'object',
      'invalid API node'
    )
    const inputs = {}
    for (const k of Object.keys(n.inputs).sort()) inputs[k] = n.inputs[k]
    normalized[id] = { class_type: n.class_type, inputs }
  }
  return normalized
}
export function verifyWorkflow(actual, expected) {
  requireThat(
    actual.workflow && Array.isArray(actual.workflow.nodes),
    'native UI snapshot required'
  )
  const expectedNodes = Object.keys(expected.graph).sort(),
    uiNodes = actual.workflow.nodes.map((n) => String(n.id)).sort()
  requireThat(
    JSON.stringify(uiNodes) === JSON.stringify(expectedNodes),
    'unknown or missing UI execution node',
    409
  )
  for (const n of actual.workflow.nodes)
    requireThat(
      n.type === expected.graph[String(n.id)].class_type,
      'UI node type mismatch',
      409
    )
  requireThat(
    JSON.stringify(normalizeApi(actual.output)) ===
      JSON.stringify(normalizeApi(expected.graph)),
    'UI/API execution mismatch',
    409
  )
  return {
    owner: 'Sean',
    verified: true,
    templateId: expected.templateId,
    templateVersion: expected.version,
    apiHash: hash(expected.graph),
    uiHash: hash(actual.workflow),
    workflow: actual.workflow,
    graph: expected.graph
  }
}
