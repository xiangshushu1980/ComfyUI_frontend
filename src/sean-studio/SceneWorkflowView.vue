<!-- Owner: Sean. Read-only 3D production projection. -->
<!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
<template>
  <main class="scene-workspace">
    <div ref="host" class="scene-canvas"><canvas ref="element" /></div>
    <nav class="scene-toolbar" aria-label="场景工作流">
      <a href="../../">创作图谱</a>
      <strong>3D 场景 · 只读</strong>
      <select v-model="sceneId" aria-label="选择场景" @change="load(true)">
        <option value="">选择场景</option>
        <option v-for="scene in scenes" :key="scene.id" :value="scene.id">
          {{ scene.name }}
        </option>
      </select>
      <button :disabled="busy || !sceneId" @click="load(false)">
        刷新结果
      </button>
      <button @click="fit">适配画布</button>
      <label
        ><input
          v-model="imagesOnly"
          type="checkbox"
          @change="draw(true)"
        />只看图片</label
      >
      <span v-if="projection"
        >{{ projection.nodes.length }} 个产物 · {{ projection.readAt }}</span
      >
    </nav>
    <div
      v-if="error || !scenes.length || busy"
      class="scene-notice"
      role="status"
    >
      {{
        error ||
        (busy
          ? '读取工作区…'
          : '尚未配置场景。请按部署文档设置 STUDIO_3D_SCENES。')
      }}
    </div>
    <aside v-if="selected" class="scene-inspector">
      <button
        class="scene-close"
        aria-label="关闭详情"
        @click="selected = null"
      >
        ×
      </button>
      <h2>{{ selected.title }}</h2>
      <p>
        {{ projection?.stages[selected.stage] }} · {{ selected.kind }} ·
        {{ selected.status }}
      </p>
      <p class="scene-path">{{ selected.id }}</p>
      <details>
        <summary>来源版本 SHA-256</summary>
        <code>{{ selected.sha256 }}</code>
      </details>
      <p v-if="selected.error">{{ selected.error }}</p>
      <a :href="fileUrl(selected.id)" target="_blank" rel="noopener"
        >打开原始产物</a
      >
      <a
        v-if="selected.image"
        :href="fileUrl(selected.id)"
        target="_blank"
        rel="noopener"
        ><img :src="fileUrl(selected.id)" :alt="selected.title"
      /></a>
      <h3>文件引用</h3>
      <p v-if="!selectedEdges.length">无显式文件引用</p>
      <button
        v-for="(edge, index) in selectedEdges"
        :key="index"
        class="scene-relation"
        @click="selectPath(edge.from === selected.id ? edge.to : edge.from)"
      >
        {{ edge.from === selected.id ? '被引用' : '引用' }} · {{ edge.status
        }}<br />
        {{ edge.from === selected.id ? edge.to : edge.from }}<br />{{
          edge.field
        }}
      </button>
      <h3>产物内容</h3>
      <pre>{{ selected.text || JSON.stringify(selected.data, null, 2) }}</pre>
    </aside>
    <details v-if="projection?.warnings.length" class="scene-warnings">
      <summary>读取提示（{{ projection.warnings.length }}）</summary>
      <p v-for="warning in projection.warnings" :key="warning">{{ warning }}</p>
    </details>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  LGraph,
  LGraphCanvas,
  LGraphNode,
  LiteGraph
} from '@/lib/litegraph/src/litegraph'
import { CANVAS_NODE_COLORS, CANVAS_NODE_RADIUS } from './canvasNodeStyle'

type Artifact = {
  id: string
  title: string
  stage: number
  kind: string
  sha256: string
  status: string
  error: string | null
  data: unknown
  text: string | null
  image: boolean
}
type Edge = { from: string; to: string; field: string; status: string }
type Projection = {
  id: string
  name: string
  stages: string[]
  nodes: Artifact[]
  edges: Edge[]
  warnings: string[]
  revision: string
  readAt: string
}
const scenes = ref<{ id: string; name: string }[]>([])
const sceneId = ref(new URLSearchParams(location.search).get('scene') || '')
const projection = ref<Projection | null>(null)
const selected = ref<Artifact | null>(null)
const busy = ref(false),
  error = ref(''),
  imagesOnly = ref(false)
const host = ref<HTMLDivElement>(),
  element = ref<HTMLCanvasElement>()
const selectedEdges = computed(
  () =>
    projection.value?.edges.filter(
      (e) => e.from === selected.value?.id || e.to === selected.value?.id
    ) || []
)
let graph: LGraph,
  canvas: LGraphCanvas,
  observer: ResizeObserver,
  request = 0
let laneWidth = 400
let disposed = false
const logicalViewport = new Float64Array(4)
const nodePaths = new Map<LGraphNode, string>()
const renderedNodes = new Map<string, LGraphNode>()
const images = new Map<string, HTMLImageElement>()
const endpoint = '/studio-api/v1/scene-projection'
const fileUrl = (path: string) =>
  `${endpoint}/${encodeURIComponent(sceneId.value)}/file?path=${encodeURIComponent(path)}`
async function read<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok)
    throw new Error((await response.json()).error || `HTTP ${response.status}`)
  return response.json()
}
function selectPath(path: string) {
  const node = projection.value?.nodes.find((n) => n.id === path)
  if (node) {
    selected.value = node
    canvas.setDirty(true, true)
  }
}
async function load(reset = false) {
  const sequence = ++request
  error.value = ''
  if (reset) {
    selected.value = null
    projection.value = null
    graph.clear()
  }
  if (!sceneId.value) {
    busy.value = false
    return
  }
  busy.value = true
  const id = sceneId.value
  try {
    const next = await read<Projection>(`${endpoint}/${encodeURIComponent(id)}`)
    if (disposed || sequence !== request) return
    projection.value = next
    selected.value = next.nodes.find((n) => n.id === selected.value?.id) || null
    history.replaceState(null, '', `?scene=${encodeURIComponent(id)}`)
    draw(reset)
  } catch (e) {
    if (sequence === request)
      error.value = `读取失败，当前展示可能过期：${String(e)}`
  } finally {
    if (sequence === request) busy.value = false
  }
}
function fit() {
  if (!canvas || !graph.nodes.length || !host.value) return
  const left = Math.min(...graph.nodes.map((n) => n.pos[0]))
  const top = Math.min(...graph.nodes.map((n) => n.pos[1] - 24))
  const right = Math.max(...graph.nodes.map((n) => n.pos[0] + n.size[0]))
  const bottom = Math.max(...graph.nodes.map((n) => n.pos[1] + n.size[1]))
  const scale = Math.min(
    1,
    (host.value.clientWidth - 60) / (right - left),
    (host.value.clientHeight - 100) / (bottom - top)
  )
  canvas.ds.scale = scale
  canvas.ds.offset = [30 / scale - left, 50 / scale - top]
  canvas.setDirty(true, true)
}
function draw(reset = false) {
  graph.clear()
  nodePaths.clear()
  renderedNodes.clear()
  const data = projection.value
  if (!data) return
  const items = data.nodes.filter((item) => !imagesOnly.value || item.image)
  const prepared = items.map((item) => {
    let image = images.get(item.id)
    if (item.image && !image) {
      image = new Image()
      image.onload = () => {
        if (!disposed) draw(true)
      }
      image.src = fileUrl(item.id)
      images.set(item.id, image)
    }
    const preview = image?.complete && image.naturalWidth ? image : undefined
    const scale = preview
      ? Math.min(1, 360 / preview.naturalWidth, 240 / preview.naturalHeight)
      : 0
    const width = preview
      ? Math.max(1, Math.round(preview.naturalWidth * scale))
      : Math.max(180, Math.min(260, item.title.length * 8 + 32))
    const rawPreview = String(
      item.error || item.text || JSON.stringify(item.data) || ''
    )
      .replace(/\s+/g, ' ')
      .trim()
    const previewLines = rawPreview
      ? Array.from({ length: 2 }, (_, index) =>
          Array.from(rawPreview)
            .slice(index * 32, (index + 1) * 32)
            .join('')
        ).filter(Boolean)
      : []
    const height = preview
      ? Math.max(1, Math.round(preview.naturalHeight * scale))
      : previewLines.length
        ? 112
        : 180
    return { item, image: preview, width, height, previewLines }
  })
  const laneWidths = [0, 0, 0, 0, 0]
  for (const entry of prepared)
    laneWidths[entry.item.stage] = Math.max(
      laneWidths[entry.item.stage],
      entry.width
    )
  laneWidth = Math.max(...laneWidths) + 50
  const rowOffsets = [130, 130, 130, 130, 130]
  for (const { item, image, width, height, previewLines } of prepared) {
    const node = new LGraphNode(item.title)
    node.pos = [item.stage * laneWidth + 30, rowOffsets[item.stage]]
    rowOffsets[item.stage] += height + 28
    node.size = [width, height]
    node.color =
      item.status === 'unknown'
        ? '#465260'
        : /fail|unreadable|reject/.test(item.status)
          ? '#8b4949'
          : '#3f6260'
    node.bgcolor = 'transparent'
    node.shape = LiteGraph.BOX_SHAPE
    Object.defineProperty(node, 'title_mode', { value: LiteGraph.NO_TITLE })
    node.onDrawForeground = (ctx) => {
      ctx.save()
      if (image) {
        ctx.drawImage(image, 0, 0, width, height)
        ctx.fillStyle = CANVAS_NODE_COLORS.titleBar
        ctx.fillRect(0, height - 30, width, 30)
        ctx.fillStyle = CANVAS_NODE_COLORS.text
        ctx.font = '600 12px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(item.title, width / 2, height - 15, width - 12)
      } else {
        ctx.fillStyle = CANVAS_NODE_COLORS.background
        ctx.beginPath()
        ctx.roundRect(0, 0, width, height, CANVAS_NODE_RADIUS)
        ctx.fill()
        ctx.fillStyle = CANVAS_NODE_COLORS.text
        ctx.font = '600 13px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(
          item.title,
          width / 2,
          previewLines.length ? 24 : height / 2,
          width - 24
        )
        if (previewLines.length) {
          ctx.font = '12px system-ui'
          ctx.fillStyle = CANVAS_NODE_COLORS.body
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          previewLines.forEach((line, index) =>
            ctx.fillText(line, 12, 48 + index * 16, width - 24)
          )
        }
      }
      ctx.restore()
    }
    graph.add(node)
    nodePaths.set(node, item.id)
    renderedNodes.set(item.id, node)
  }
  canvas.setDirty(true, true)
  if (reset) fit()
}
onMounted(async () => {
  document.title = '3D 场景工作流 · Sean'
  graph = new LGraph()
  canvas = new LGraphCanvas(element.value!, graph)
  canvas.read_only = true
  canvas.allow_interaction = false
  canvas.allow_dragnodes = false
  canvas.allow_searchbox = false
  canvas.show_info = false
  canvas.min_font_size_for_lod = 0
  canvas.background_image = ''
  canvas.clear_background_color = '#111b26'
  canvas.onDrawBackground = (ctx) => {
    for (const edge of projection.value?.edges || []) {
      const from = renderedNodes.get(edge.from),
        to = renderedNodes.get(edge.to)
      if (!from || !to || from === to) continue
      const active =
        selected.value?.id === edge.from || selected.value?.id === edge.to
      ctx.strokeStyle =
        edge.status === 'stale' ? '#e2aa6077' : active ? '#9fd5ff' : '#66859933'
      ctx.lineWidth = active ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(from.pos[0] + from.size[0], from.pos[1] + 20)
      ctx.bezierCurveTo(
        from.pos[0] + from.size[0] + 50,
        from.pos[1] + 20,
        to.pos[0] - 50,
        to.pos[1] + 20,
        to.pos[0],
        to.pos[1] + 20
      )
      ctx.stroke()
    }
    ctx.fillStyle = '#b7cde0'
    ctx.font = 'bold 22px sans-serif'
    projection.value?.stages.forEach((stage, index) =>
      ctx.fillText(stage, 30 + index * laneWidth, 85)
    )
  }
  element.value!.addEventListener(
    'contextmenu',
    (e) => {
      e.preventDefault()
      e.stopImmediatePropagation()
    },
    true
  )
  let start = [0, 0]
  element.value!.addEventListener(
    'pointerdown',
    (e) => {
      start = [e.clientX, e.clientY]
    },
    true
  )
  element.value!.addEventListener(
    'pointerup',
    (e) => {
      if (
        e.button !== 0 ||
        Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5
      )
        return
      const [x, y] = canvas.convertEventToCanvasOffset(e)
      const node = [...graph.nodes]
        .reverse()
        .find(
          (n) =>
            x >= n.pos[0] &&
            x <= n.pos[0] + n.size[0] &&
            y >= n.pos[1] &&
            y <= n.pos[1] + n.size[1]
        )
      if (node) selectPath(nodePaths.get(node)!)
    },
    true
  )
  const computeVisibleArea = canvas.ds.computeVisibleArea.bind(canvas.ds)
  canvas.ds.computeVisibleArea = () => computeVisibleArea(logicalViewport)
  const resize = () => {
    const rect = host.value!.getBoundingClientRect()
    logicalViewport[2] = rect.width
    logicalViewport[3] = rect.height
    const scale = window.devicePixelRatio || 1
    canvas.resize(
      Math.round(rect.width * scale),
      Math.round(rect.height * scale)
    )
    canvas.ds.computeVisibleArea(logicalViewport)
    canvas.ctx.setTransform(scale, 0, 0, scale, 0, 0)
    canvas.bgcanvas.getContext('2d')?.setTransform(scale, 0, 0, scale, 0, 0)
    canvas.setDirty(true, true)
  }
  observer = new ResizeObserver(resize)
  observer.observe(host.value!)
  resize()
  try {
    scenes.value = await read(endpoint)
    if (disposed) return
    if (!scenes.value.some((s) => s.id === sceneId.value))
      sceneId.value = scenes.value[0]?.id || ''
    await load(true)
  } catch (e) {
    error.value = String(e)
  }
})
onBeforeUnmount(() => {
  disposed = true
  request++
  observer?.disconnect()
  canvas?.stopRendering()
  canvas?.unbindEvents()
  graph?.clear()
})
</script>

<style scoped>
.scene-workspace {
  position: fixed;
  inset: 0;
  background: #111b26;
  color: #e1e8f0;
  font: 14px sans-serif;
}
.scene-canvas {
  position: absolute;
  inset: 0;
}
.scene-canvas canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.scene-toolbar {
  position: absolute;
  top: 12px;
  left: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px;
  background: #233446ee;
  border-radius: 10px;
}
.scene-toolbar button,
.scene-toolbar select,
.scene-relation {
  padding: 7px;
  color: inherit;
  background: #33485b;
  border: 1px solid #5b7286;
  border-radius: 5px;
  cursor: pointer;
}
a {
  color: #9fd5ff;
}
.scene-toolbar span {
  font-size: 12px;
}
.scene-inspector {
  position: absolute;
  top: 90px;
  bottom: 16px;
  right: 16px;
  width: min(520px, 85vw);
  overflow: auto;
  padding: 20px;
  background: #203041f5;
  border: 1px solid #52667a;
  border-radius: 10px;
}
.scene-inspector img {
  width: 100%;
  margin-top: 16px;
}
.scene-inspector pre,
.scene-inspector code,
.scene-path {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.scene-inspector pre {
  font-size: 13px;
  line-height: 1.6;
}
.scene-close {
  float: right;
  cursor: pointer;
}
.scene-relation {
  display: block;
  width: 100%;
  margin: 8px 0;
  text-align: left;
  overflow-wrap: anywhere;
}
.scene-notice {
  position: absolute;
  top: 100px;
  left: 20px;
  max-width: 600px;
  padding: 16px;
  background: #473b29;
}
.scene-warnings {
  position: absolute;
  bottom: 16px;
  left: 16px;
  padding: 10px;
  max-height: 220px;
  overflow: auto;
  background: #473b29;
  max-width: 50vw;
}
</style>
