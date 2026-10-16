<!-- Owner: Sean. Read-only 3D production projection. -->
<!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
<template>
  <main class="scene-workspace">
    <div ref="host" class="scene-canvas"><canvas ref="element" /></div>
    <CanvasToolbar aria-label="场景工作流">
      <template #location>
        <div class="scene-location">
          <a :href="graphHref">创作图谱</a>
          <strong>3D 场景 · 只读</strong>
        </div>
      </template>
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
      <button
        :aria-expanded="settingsOpen"
        @click="settingsOpen = !settingsOpen"
      >
        设置
      </button>
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
    </CanvasToolbar>
    <CanvasSettingsPanel
      v-if="settingsOpen"
      v-model="canvasSettings"
      v-model:inspector-width="inspectorWidth"
      @change="applyCanvasSettings"
      @width-change="saveInspectorWidth"
      @close="settingsOpen = false"
    />
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
    <aside
      v-if="selected"
      class="scene-inspector"
      :style="{
        width: `min(${inspectorWidth}px, 85vw)`,
        backgroundColor: `rgba(22, 40, 52, ${canvasSettings.panelOpacity})`
      }"
    >
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
import {
  LinkMarkerShape,
  LinkRenderType
} from '@/lib/litegraph/src/types/globalEnums'
import CanvasToolbar from './CanvasToolbar.vue'
import CanvasSettingsPanel from './CanvasSettingsPanel.vue'
import { CANVAS_NODE_COLORS, CANVAS_NODE_RADIUS } from './canvasNodeStyle'
import { canvasSettingsStorageKey, DEFAULT_CANVAS_SETTINGS, inspectorWidthStorageKey, normalizeCanvasSettings } from './canvasSettings';
import type { CanvasSettings } from './canvasSettings';

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
const projectId = ref(
  new URLSearchParams(location.search).get('project') ||
    localStorage.getItem('sean-studio-project') ||
    ''
)
const graphHref = computed(() =>
  projectId.value
    ? `../../#/canvas/${encodeURIComponent(projectId.value)}`
    : '../../'
)
const projection = ref<Projection | null>(null)
const selected = ref<Artifact | null>(null)
const canvasSettings = ref<CanvasSettings>(loadCanvasSettings())
const inspectorWidth = ref(loadInspectorWidth())
const settingsOpen = ref(false)
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
function loadCanvasSettings(): CanvasSettings {
  try {
    return normalizeCanvasSettings(
      JSON.parse(
        localStorage.getItem(canvasSettingsStorageKey(projectId.value)) || '{}'
      )
    )
  } catch {
    return { ...DEFAULT_CANVAS_SETTINGS }
  }
}
function loadInspectorWidth() {
  const value = Number(
    localStorage.getItem(inspectorWidthStorageKey(projectId.value))
  )
  const max = Math.max(360, Math.min(1200, window.innerWidth * 0.96))
  return Number.isFinite(value) ? Math.min(max, Math.max(360, value)) : 520
}
function applyCanvasSettings() {
  if (projectId.value)
    localStorage.setItem(
      canvasSettingsStorageKey(projectId.value),
      JSON.stringify(canvasSettings.value)
    )
  if (!canvas) return
  canvas.links_render_mode =
    canvasSettings.value.linkStyle === 'linear'
      ? LinkRenderType.LINEAR_LINK
      : canvasSettings.value.linkStyle === 'straight'
        ? LinkRenderType.STRAIGHT_LINK
        : LinkRenderType.SPLINE_LINK
  canvas.default_link_color = canvasSettings.value.linkColor
  canvas.connections_width = canvasSettings.value.linkWidth
  canvas.linkMarkerShape =
    canvasSettings.value.linkMarker === 'none'
      ? LinkMarkerShape.None
      : canvasSettings.value.linkMarker === 'arrow'
        ? LinkMarkerShape.Arrow
        : LinkMarkerShape.Circle
  for (const node of graph.nodes)
    Object.assign(node, { padding: canvasSettings.value.nodePadding })
  canvas.setDirty(true, true)
}
function saveInspectorWidth() {
  const max = Math.max(360, Math.min(1200, window.innerWidth * 0.96))
  inspectorWidth.value = Math.min(max, Math.max(360, inspectorWidth.value))
  if (projectId.value)
    localStorage.setItem(
      inspectorWidthStorageKey(projectId.value),
      String(inspectorWidth.value)
    )
}
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
    const query = new URLSearchParams(location.search)
    query.set('scene', id)
    if (projectId.value) query.set('project', projectId.value)
    history.replaceState(null, '', `${location.pathname}?${query}`)
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
      : Math.max(190, Math.min(320, Array.from(item.title).length * 13 + 32))
    const charsPerTitleLine = Math.max(10, Math.floor((width - 32) / 13))
    const titleChars = Array.from(item.title)
    const titleLines = Array.from(
      { length: Math.ceil(titleChars.length / charsPerTitleLine) },
      (_, index) =>
        titleChars
          .slice(index * charsPerTitleLine, (index + 1) * charsPerTitleLine)
          .join('')
    )
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
      : Math.max(
          previewLines.length ? 88 : 180,
          titleLines.length * 17 + 32 + previewLines.length * 16
        )
    return { item, image: preview, width, height, previewLines, titleLines }
  })
  const laneWidths = [0, 0, 0, 0, 0]
  for (const entry of prepared)
    laneWidths[entry.item.stage] = Math.max(
      laneWidths[entry.item.stage],
      entry.width
    )
  laneWidth = Math.max(...laneWidths) + 50
  const rowOffsets = [130, 130, 130, 130, 130]
  for (const {
    item,
    image,
    width,
    height,
    previewLines,
    titleLines
  } of prepared) {
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
    Object.assign(node, { padding: canvasSettings.value.nodePadding })
    Object.defineProperty(node, 'title_mode', { value: LiteGraph.NO_TITLE })
    node.onDrawForeground = (ctx) => {
      ctx.save()
      if (image) {
        ctx.drawImage(image, 0, 0, width, height)
        const titleHeight = Math.max(30, titleLines.length * 15 + 8)
        ctx.fillStyle = CANVAS_NODE_COLORS.titleBar
        ctx.fillRect(0, height - titleHeight, width, titleHeight)
        ctx.fillStyle = CANVAS_NODE_COLORS.text
        ctx.font = '600 12px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        titleLines.forEach((line, index) =>
          ctx.fillText(
            line,
            width / 2,
            height - titleHeight + 4 + index * 15,
            width - canvasSettings.value.nodePadding * 2
          )
        )
      } else {
        ctx.fillStyle = CANVAS_NODE_COLORS.background
        ctx.beginPath()
        ctx.roundRect(0, 0, width, height, CANVAS_NODE_RADIUS)
        ctx.fill()
        ctx.fillStyle = CANVAS_NODE_COLORS.text
        ctx.font = '600 13px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        titleLines.forEach((line, index) =>
          ctx.fillText(
            line,
            width / 2,
            previewLines.length
              ? 16 + index * 17
              : (height - titleLines.length * 17) / 2 + index * 17,
            width - canvasSettings.value.nodePadding * 2
          )
        )
        if (previewLines.length) {
          ctx.font = '12px system-ui'
          ctx.fillStyle = CANVAS_NODE_COLORS.body
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          previewLines.forEach((line, index) =>
            ctx.fillText(
              line,
              canvasSettings.value.nodePadding,
              16 + titleLines.length * 17 + 8 + index * 16,
              width - canvasSettings.value.nodePadding * 2
            )
          )
        }
      }
      if (canvasSettings.value.showCapabilityBadges) {
        const badgeScale = 1 / (canvas.ds.scale || 1)
        const badgeWidth = 20 * badgeScale
        const badgeHeight = 20 * badgeScale
        const badgeX = width - canvasSettings.value.nodePadding - badgeWidth
        const badgeY = canvasSettings.value.nodePadding
        ctx.fillStyle = '#65713f'
        ctx.beginPath()
        ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 4 * badgeScale)
        ctx.fill()
        ctx.fillStyle = '#f4f7f8'
        ctx.font = `700 ${10 * badgeScale}px system-ui`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('W', badgeX + badgeWidth / 2, badgeY + badgeHeight / 2)
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
  canvas.clear_background_color = '#101b25'
  canvas.onDrawBackground = (ctx, area) => {
    const step = canvas.ds.scale < 0.4 ? 110 : 22
    ctx.fillStyle = '#2c3d4d'
    for (
      let x = Math.floor(area[0] / step) * step;
      x < area[0] + area[2];
      x += step
    )
      for (
        let y = Math.floor(area[1] / step) * step;
        y < area[1] + area[3];
        y += step
      )
        ctx.fillRect(x, y, 1 / canvas.ds.scale, 1 / canvas.ds.scale)
    ctx.save()
    ctx.strokeStyle = '#66809766'
    ctx.lineWidth = 1 / canvas.ds.scale
    ctx.beginPath()
    ctx.moveTo(0, area[1])
    ctx.lineTo(0, area[1] + area[3])
    ctx.moveTo(area[0], 0)
    ctx.lineTo(area[0] + area[2], 0)
    ctx.stroke()
    ctx.restore()
    for (const edge of projection.value?.edges || []) {
      const from = renderedNodes.get(edge.from),
        to = renderedNodes.get(edge.to)
      if (!from || !to || from === to) continue
      const x1 = from.pos[0] + from.size[0],
        y1 = from.pos[1] + from.size[1] / 2,
        x2 = to.pos[0],
        y2 = to.pos[1] + to.size[1] / 2
      const midX = (x1 + x2) / 2,
        midY = (y1 + y2) / 2
      ctx.save()
      ctx.strokeStyle = canvasSettings.value.linkColor
      ctx.fillStyle = canvasSettings.value.linkColor
      ctx.globalAlpha = edge.status === 'stale' ? 0.5 : 0.8
      ctx.lineWidth = canvasSettings.value.linkWidth
      if (edge.status === 'stale') ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      if (canvasSettings.value.linkStyle === 'straight') ctx.lineTo(x2, y2)
      else if (canvasSettings.value.linkStyle === 'linear') {
        ctx.lineTo(midX, y1)
        ctx.lineTo(midX, y2)
        ctx.lineTo(x2, y2)
      } else ctx.bezierCurveTo(x1 + 50, y1, x2 - 50, y2, x2, y2)
      ctx.stroke()
      if (canvasSettings.value.linkMarker === 'circle') {
        ctx.beginPath()
        ctx.arc(midX, midY, 4, 0, Math.PI * 2)
        ctx.fill()
      } else if (canvasSettings.value.linkMarker === 'arrow') {
        const angle = Math.atan2(y2 - y1, x2 - x1)
        ctx.translate(midX, midY)
        ctx.rotate(angle)
        ctx.beginPath()
        ctx.moveTo(6, 0)
        ctx.lineTo(-5, -4)
        ctx.lineTo(-5, 4)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
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
  applyCanvasSettings()
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
  background: #101b25;
  color: #e2eaf0;
  font: 13px/1.6 system-ui;
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
.scene-relation {
  display: block;
  width: 100%;
  margin: 8px 0;
  padding: 7px;
  color: inherit;
  background: #33485b;
  border: 1px solid #5b7286;
  border-radius: 5px;
  cursor: pointer;
  text-align: left;
  overflow-wrap: anywhere;
}
a {
  color: #9fd5ff;
}
.scene-inspector {
  position: absolute;
  top: 64px;
  bottom: 12px;
  right: 12px;
  width: min(520px, 96vw);
  min-width: 360px;
  max-width: 96vw;
  overflow: auto;
  padding: 16px 20px 24px;
  background: #162834f5;
  border: 1px solid #435c6c;
  border-radius: 12px;
  box-shadow: 0 20px 70px #0008;
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
