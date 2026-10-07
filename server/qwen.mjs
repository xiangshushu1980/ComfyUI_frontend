// Owner: Sean. Fixed template compiler and UI/API contract verification.
import { readFileSync } from 'node:fs'
import { hash, requireThat } from './store.mjs'
const base = JSON.parse(
  readFileSync(new URL('../templates/qwen/api.v1.json', import.meta.url))
).graph
const nativeTemplate = JSON.parse(
  readFileSync(new URL('../templates/qwen/ui.v1.json', import.meta.url))
).workflow
// A serialized native LoadImage instance captured by the real frontend roundtrip.
const referenceTemplate = JSON.parse(
  readFileSync(
    new URL(
      '../docs/sean-studio/native-reference-roundtrip.json',
      import.meta.url
    )
  )
).workflow.nodes.find((n) => n.type === 'LoadImage')
export function nativeSnapshot(graph) {
  const workflow = structuredClone(nativeTemplate)
  workflow.extra = {
    ...workflow.extra,
    owner: 'Sean',
    representation: 'compiled_from_native_template'
  }
  for (const [id, entry] of Object.entries(graph)) {
    let node = workflow.nodes.find((n) => String(n.id) === id)
    if (!node) {
      requireThat(
        entry.class_type === 'LoadImage',
        'unknown fixed template node'
      )
      node = structuredClone(referenceTemplate)
      node.id = Number(id)
      node.pos = [1170, (Number(id) - 10) * 220]
      workflow.nodes.push(node)
    }
    const names = Object.keys(node.widgets_values_named || {})
    const seedControl = names.indexOf('control_after_generate')
    if (seedControl >= 0) {
      node.widgets_values[seedControl] = 'fixed'
      node.widgets_values_named.control_after_generate = 'fixed'
    }
    for (const [name, value] of Object.entries(entry.inputs))
      if (!Array.isArray(value)) {
        const index = names.indexOf(name)
        requireThat(index >= 0, `native scalar binding missing: ${id}.${name}`)
        node.widgets_values[index] = value
        node.widgets_values_named[name] = value
      }
    for (const input of node.inputs || []) input.link = null
    for (const output of node.outputs || []) output.links = []
  }
  workflow.links = []
  let next = 0
  for (const [id, entry] of Object.entries(graph))
    for (const [name, value] of Object.entries(entry.inputs))
      if (Array.isArray(value)) {
        const target = workflow.nodes.find((n) => String(n.id) === id),
          source = workflow.nodes.find((n) => String(n.id) === String(value[0]))
        let slot = target.inputs.findIndex((i) => i.name === name)
        if (slot < 0) {
          requireThat(/^images\.image_\d+$/.test(name), 'unknown dynamic slot')
          slot = target.inputs.length
          target.inputs.push({ name, type: 'IMAGE', link: null })
        }
        const link = ++next
        target.inputs[slot].link = link
        source.outputs[value[1]].links.push(link)
        workflow.links.push([
          link,
          source.id,
          value[1],
          target.id,
          slot,
          target.inputs[slot].type
        ])
      }
  workflow.last_node_id = Math.max(...workflow.nodes.map((n) => Number(n.id)))
  workflow.last_link_id = next
  return workflow
}
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
