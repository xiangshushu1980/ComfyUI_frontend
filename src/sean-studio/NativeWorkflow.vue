<template>
  <div class="native-workflow">
    <div id="comfyui-body-top" />
    <div id="comfyui-body-left" />
    <div id="comfyui-body-right" />
    <div id="comfyui-body-bottom" />
    <div id="graph-canvas-container">
      <canvas id="graph-canvas" ref="element" tabindex="-1" />
    </div>
    <DomWidgets v-if="ready" class="native-widgets" />
    <p v-if="error" class="native-error">{{ error }}</p>
  </div>
</template>
<script setup lang="ts">
// Owner: Sean. One upstream ComfyApp; fixed workflow is a separate execution graph.
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { until } from '@vueuse/core'
import DomWidgets from '@/components/graph/DomWidgets.vue'
import { toNodeId } from '@/types/nodeId'
import { api } from '@/scripts/api'
import { app } from '@/scripts/app'
import { LiteGraph } from '@/lib/litegraph/src/litegraph'
import { CORE_SETTINGS } from '@/platform/settings/constants/coreSettings'
import { useSettingStore } from '@/platform/settings/settingStore'
import { useBootstrapStore } from '@/stores/bootstrapStore'
import { useCanvasStore } from '@/renderer/core/canvas/canvasStore'
const props = defineProps<{ active: boolean }>()
const emit = defineEmits<{ ready: []; error: [message: string] }>()
const element = ref<HTMLCanvasElement>(),
  ready = ref(false),
  error = ref('')
const settings = useSettingStore(),
  bootstrap = useBootstrapStore()
let observer: ResizeObserver
async function setup() {
  try {
    await until(() => settings.isReady || settings.error).toBe(true)
    CORE_SETTINGS.forEach(settings.addSetting)
    await until(() => bootstrap.isI18nReady || bootstrap.i18nError).toBe(true)
    // Backend run observer owns events; never subscribe to shared broadcasts.
    api.init = () => {}
    app.vueAppReady = true
    await app.setup(element.value!)
    useCanvasStore().canvas = app.canvas
    app.canvas.read_only = true
    app.canvas.allow_dragnodes = false
    app.canvas.allow_interaction = false
    app.canvas.allow_searchbox = false
    app.canvas.show_info = false
    ready.value = true
    document.getElementById('splash-loader')?.remove()
    if (!props.active) app.canvas.stopRendering()
    observer = new ResizeObserver(resize)
    observer.observe(element.value!.parentElement!)
    emit('ready')
  } catch (e) {
    error.value = String(e)
    emit('error', error.value)
  }
}
function resize() {
  if (!element.value || !props.active) return
  const r = element.value.parentElement!.getBoundingClientRect()
  app.canvas.resize(r.width, r.height)
  app.canvas.setDirty(true, true)
}
async function loadApiGraph(
  apiGraph: Record<
    string,
    { class_type: string; inputs: Record<string, unknown> }
  >
) {
  if (!ready.value) throw new Error('Native runtime not ready')
  app.rootGraph.clear()
  const nodes = new Map<string, ReturnType<typeof LiteGraph.createNode>>()
  for (const [id, entry] of Object.entries(apiGraph)) {
    const n = LiteGraph.createNode(entry.class_type)
    if (!n) throw new Error(`Missing native node ${entry.class_type}`)
    n.id = toNodeId(id)
    n.pos = [(Number(id) % 3) * 390, Math.floor((Number(id) - 1) / 3) * 330]
    app.rootGraph.add(n)
    nodes.set(id, n)
    for (const [name, value] of Object.entries(entry.inputs))
      if (!Array.isArray(value)) {
        const w = n.widgets?.find((w) => w.name === name)
        if (w) w.value = value as string | number | boolean | object | undefined
      }
  }
  for (const [id, entry] of Object.entries(apiGraph))
    for (const [name, value] of Object.entries(entry.inputs))
      if (Array.isArray(value)) {
        const target = nodes.get(id)!,
          source = nodes.get(String(value[0]))!
        const slot = target.inputs.findIndex((i) => i.name === name)
        if (slot < 0)
          throw new Error(`Native input slot not available: ${id}.${name}`)
        source.connect(Number(value[1]), target, slot)
      }
  await nextTick()
  app.canvas.setDirty(true, true)
  resize()
  app.canvas.fitViewToSelectionAnimated()
  const { workflow, output } = await app.graphToPrompt()
  return { workflow, output }
}
watch(
  () => props.active,
  async (active) => {
    await nextTick()
    if (ready.value) {
      if (active) app.canvas.startRendering()
      else app.canvas.stopRendering()
      resize()
    }
  }
)
onMounted(setup)
onBeforeUnmount(() => {
  observer?.disconnect()
  if (ready.value) app.canvas.stopRendering()
})
async function loadSnapshot(workflow: Parameters<typeof app.loadGraphData>[0]) {
  if (!ready.value) throw new Error('Native runtime not ready')
  await app.loadGraphData(workflow)
  app.canvas.read_only = true
  app.canvas.allow_interaction = false
  resize()
  app.canvas.fitViewToSelectionAnimated()
}
defineExpose({ loadApiGraph, loadSnapshot })
</script>
<style scoped>
.native-workflow,
#graph-canvas-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
canvas {
  width: 100%;
  height: 100%;
  touch-action: none;
}
.native-error {
  position: absolute;
  background: #5e2230;
  padding: 20px;
}
.native-widgets {
  pointer-events: none;
}
</style>
