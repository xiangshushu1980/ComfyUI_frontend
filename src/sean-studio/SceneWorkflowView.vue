<!-- Owner: Sean. Read-only 3D production projection. -->
<!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
<template>
  <main class="scene-workspace">
    <div ref="host" class="scene-canvas"><canvas ref="element" /></div>
    <CanvasToolbar aria-label="场景工作流">
      <template #location>
        <div class="scene-location">
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
      <button
        v-if="focusedStage !== null || selected || selectedGroup"
        @click="overview"
      >
        回到最外层
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
          @change="changeImageFilter"
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
      v-if="selectedGroup"
      class="scene-inspector"
      :style="{ width: `min(${inspectorWidth}px, 85vw)` }"
    >
      <button
        class="scene-close"
        aria-label="关闭结果详情"
        @click="closeDetails"
      >
        ×
      </button>
      <h2>{{ selectedGroup.title }}</h2>
      <p>
        {{ SCENE_STEP_NAMES[selectedGroup.stage] }} ·
        {{ selectedGroup.files.length }} 个文件
      </p>
      <p>同一结果的文件与修订归在一起。展示顺序不代表已采纳版本。</p>
      <img
        v-if="selectedGroup.preview.image"
        :src="fileUrl(selectedGroup.preview.id)"
        :alt="selectedGroup.title"
      />
      <h3>文件与版本</h3>
      <button
        v-for="file in selectedGroup.files"
        :key="file.id"
        class="scene-relation"
        @click="openFile(file.id)"
      >
        {{ file.title }} · {{ file.status }}<br />{{ file.id }}
      </button>
    </aside>
    <div v-if="projection" class="scene-guide">
      {{
        focusedStage === null
          ? '流程总览 · 点击步骤，展开该步的资产和结果'
          : SCENE_STEP_DESCRIPTIONS[focusedStage] +
            ' · 点击结果查看文件与版本，拖动调整位置'
      }}<br />鼠标侧键 4 后退 / 5 前进 ·
      实线箭头：制作顺序　虚线：所属步骤　选中结果：显示文件引用
    </div>
    <aside
      v-if="selected"
      class="scene-inspector"
      :style="{
        width: `min(${inspectorWidth}px, 85vw)`,
        backgroundColor: `rgba(22, 40, 52, ${canvasSettings.panelOpacity})`
      }"
    >
      <button class="scene-close" aria-label="关闭详情" @click="closeDetails">
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
import { isJsonCanvasNode } from './canvasNodeName'
import {
  canvasSettingsStorageKey,
  DEFAULT_CANVAS_SETTINGS,
  inspectorWidthStorageKey,
  normalizeCanvasSettings
} from './canvasSettings'
import type { CanvasSettings } from './canvasSettings'
import {
  groupSceneResults,
  relatedPositions,
  SCENE_STEP_NAMES,
  SCENE_STEP_DESCRIPTIONS
} from './scenePresentation'
import type { SceneResultGroup } from './scenePresentation'

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
const focusedStage = ref<number | null>(null)
const selectedGroup = ref<SceneResultGroup | null>(null)
const resultGroups = computed(() =>
  groupSceneResults(projection.value?.nodes || [])
)
const nodeGroups = new Map<string, SceneResultGroup>()
const hubStages = new Map<string, number>()
const stageCenters: [number, number][] = [
  [0, 0],
  [640, 0],
  [1280, 0],
  [1920, 0],
  [2560, 0]
]
const stepLinks = ['准备资产', '使用资产搭建', '按布局查看', '检查结果']
type ViewState = {
  stage: number | null
  group: string | null
  file: string | null
  scale: number
  offset: [number, number]
}
const backViews: ViewState[] = [],
  forwardViews: ViewState[] = []
function captureView(): ViewState {
  return {
    stage: focusedStage.value,
    group: selectedGroup.value?.id || null,
    file: selected.value?.id || null,
    scale: canvas.ds.scale,
    offset: [canvas.ds.offset[0], canvas.ds.offset[1]]
  }
}
function rememberView() {
  backViews.push(captureView())
  forwardViews.length = 0
}
function restoreView(view: ViewState) {
  autoFitImages = false
  focusedStage.value = view.stage
  selectedGroup.value =
    resultGroups.value.find((g) => g.id === view.group) || null
  selected.value =
    projection.value?.nodes.find((n) => n.id === view.file) || null
  draw(false)
  canvas.ds.scale = view.scale
  canvas.ds.offset = [...view.offset]
  canvas.setDirty(true, true)
}
function mouseHistory(event: MouseEvent) {
  if (event.button !== 3 && event.button !== 4) return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.type !== 'pointerup') return
  const source = event.button === 3 ? backViews : forwardViews
  const target = event.button === 3 ? forwardViews : backViews
  const view = source.pop()
  if (view) {
    target.push(captureView())
    restoreView(view)
  }
}
function changeImageFilter() {
  selectedGroup.value = null
  selected.value = null
  draw(true)
}
function overview() {
  rememberView()
  focusedStage.value = null
  selectedGroup.value = null
  selected.value = null
  draw(true)
}
function openStage(stage: number) {
  if (focusedStage.value === stage) return
  rememberView()
  focusedStage.value = stage
  selectedGroup.value = null
  selected.value = null
  draw(true)
}
function openFile(path: string) {
  selectPath(path)
}
function closeDetails() {
  rememberView()
  selectedGroup.value = null
  selected.value = null
  canvas.setDirty(true, true)
}
const layoutCache = new Map<string, Record<string, [number, number]>>()
function layoutKey() {
  return `sean-scene-positions-v1:${sceneId.value}:${focusedStage.value ?? 'overview'}`
}
function savedPositions() {
  const key = layoutKey()
  if (!layoutCache.has(key)) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}')
      layoutCache.set(
        key,
        value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      )
    } catch {
      layoutCache.set(key, {})
    }
  }
  return layoutCache.get(key)!
}
function persistPosition(node: LGraphNode) {
  const id = nodePaths.get(node)
  if (!id) return
  savedPositions()[id] = [node.pos[0], node.pos[1]]
  try {
    localStorage.setItem(layoutKey(), JSON.stringify(savedPositions()))
  } catch {
    /* Presentation remains usable without storage. */
  }
}
let autoFitImages = false
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
  if (hubStages.has(path)) {
    openStage(hubStages.get(path)!)
    return
  }
  const group = nodeGroups.get(path)
  if (group) {
    rememberView()
    selectedGroup.value = group
    selected.value = null
    canvas.setDirty(true, true)
    return
  }
  const node = projection.value?.nodes.find((n) => n.id === path)
  if (node) {
    rememberView()
    selectedGroup.value = null
    selected.value = node
    canvas.setDirty(true, true)
  }
}
async function load(reset = false) {
  const sequence = ++request
  error.value = ''
  if (reset) {
    selected.value = null
    selectedGroup.value = null
    focusedStage.value = null
    backViews.length = 0
    forwardViews.length = 0
    images.clear()
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
    if (selectedGroup.value)
      selectedGroup.value =
        resultGroups.value.find((g) => g.id === selectedGroup.value?.id) || null
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
    (host.value.clientHeight - 180) / (bottom - top)
  )
  canvas.ds.scale = scale
  canvas.ds.offset = [
    host.value.clientWidth / (2 * scale) - (left + right) / 2,
    (80 + (host.value.clientHeight - 180 - (bottom - top) * scale) / 2) /
      scale -
      top
  ]
  canvas.setDirty(true, true)
}
function draw(reset = false) {
  if (reset) autoFitImages = true
  graph.clear()
  nodePaths.clear()
  renderedNodes.clear()
  const data = projection.value
  if (!data) return
  nodeGroups.clear()
  hubStages.clear()
  const groups = resultGroups.value.filter(
    (group) => !imagesOnly.value || group.files.some((f) => f.image)
  )
  const visibleGroups =
    focusedStage.value === null
      ? []
      : groups.filter((g) => g.stage === focusedStage.value)
  const items = visibleGroups.map((group) => {
    nodeGroups.set(group.id, group)
    return { ...group.preview, id: group.id, title: group.title }
  })
  for (let stage = 0; stage < 5; stage++) {
    if (focusedStage.value !== null && stage !== focusedStage.value) continue
    const id = `step:${stage}`
    hubStages.set(id, stage)
    items.push({
      id,
      title: `${stage + 1}. ${SCENE_STEP_NAMES[stage]}`,
      stage,
      kind: 'step',
      sha256: '',
      status: 'unknown',
      error: null,
      data: null,
      text: null,
      image: false
    })
  }
  const prepared = items.map((item) => {
    const jsonNode = isJsonCanvasNode(item)
    const displayName = item.title
    let image = images.get(item.id)
    if (item.image && !image && !jsonNode) {
      image = new Image()
      image.onload = () => {
        if (!disposed) {
          draw(false)
          if (autoFitImages) fit()
        }
      }
      image.src = fileUrl(nodeGroups.get(item.id)?.preview.id || item.id)
      images.set(item.id, image)
    }
    const preview =
      !jsonNode && image?.complete && image.naturalWidth ? image : undefined
    const imageScale = preview
      ? Math.min(1, 360 / preview.naturalWidth, 240 / preview.naturalHeight)
      : 0
    const width =
      item.kind === 'step'
        ? 360
        : preview
          ? Math.round(preview.naturalWidth * imageScale)
          : 220
    const height =
      item.kind === 'step'
        ? 280
        : preview
          ? Math.round(preview.naturalHeight * imageScale)
          : 220
    const titleFontSize = 24
    const titleMeasure = document.createElement('canvas').getContext('2d')
    if (titleMeasure) titleMeasure.font = `600 ${titleFontSize}px system-ui`
    const titleLines: string[] = []
    let line = ''
    for (const character of Array.from(displayName)) {
      const next = line + character
      if (
        line &&
        titleMeasure &&
        titleMeasure.measureText(next).width > width - 24
      ) {
        titleLines.push(line)
        line = character.trimStart()
      } else line = next
    }
    if (line) titleLines.push(line)
    return {
      item,
      image: preview,
      width,
      height,
      titleLines,
      jsonNode,
      titleFontSize
    }
  })
  const positions = new Map<string, [number, number]>()
  for (let stage = 0; stage < 5; stage++) {
    const center: [number, number] =
      focusedStage.value === null ? stageCenters[stage] : [0, 0]
    positions.set(`step:${stage}`, center)
    const children = prepared.filter(
      (p) => p.item.stage === stage && p.item.kind !== 'step'
    )
    const offsets = relatedPositions(children, data.edges, nodeGroups)
    children.forEach((entry, index) =>
      positions.set(entry.item.id, [
        center[0] + offsets[index][0],
        center[1] + offsets[index][1]
      ])
    )
  }
  for (const {
    item,
    image,
    width,
    height,
    titleLines,
    jsonNode,
    titleFontSize
  } of prepared) {
    const node = new LGraphNode(item.title)
    const position = positions.get(item.id) || [0, 0]
    const saved = savedPositions()[item.id]
    node.pos =
      Array.isArray(saved) && saved.length === 2 && saved.every(Number.isFinite)
        ? [...saved]
        : [position[0] - width / 2, position[1] - height / 2]
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
      if (item.kind === 'step') {
        ctx.fillStyle = '#203b4c'
        ctx.beginPath()
        ctx.roundRect(0, 0, width, height, 18)
        ctx.fill()
        ctx.fillStyle = '#edf6fb'
        ctx.font = '600 28px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(item.title, width / 2, 20)
        ctx.fillStyle = '#b0c9d9'
        ctx.font = '16px system-ui'
        ctx.fillText(SCENE_STEP_DESCRIPTIONS[item.stage], width / 2, 58)
        const representative = resultGroups.value.find(
          (g) => g.stage === item.stage && g.preview.image
        )?.preview
        if (representative) {
          let thumb = images.get(representative.id)
          if (!thumb) {
            thumb = new Image()
            thumb.onload = () => {
              if (!disposed) canvas.setDirty(true, true)
            }
            thumb.src = fileUrl(representative.id)
            images.set(representative.id, thumb)
          }
          if (thumb.complete && thumb.naturalWidth) {
            const scale = Math.min(
              300 / thumb.naturalWidth,
              140 / thumb.naturalHeight
            )
            const w = thumb.naturalWidth * scale,
              h = thumb.naturalHeight * scale
            ctx.drawImage(thumb, (width - w) / 2, 88, w, h)
          }
        } else {
          ctx.fillStyle = '#b0c9d9'
          ctx.font = '18px system-ui'
          ctx.fillText('展开查看记录和未决事项', width / 2, 145)
        }
        ctx.fillStyle = '#9fc9dd'
        ctx.font = '17px system-ui'
        ctx.fillText(
          `${resultGroups.value.filter((g) => g.stage === item.stage).length} 组结果 · 点击展开`,
          width / 2,
          height - 30
        )
        ctx.restore()
        return
      }
      if (image && !jsonNode) {
        ctx.drawImage(image, 0, 0, width, height)
        const titleHeight = Math.min(
          60,
          Math.max(34, titleLines.length * 26 + 8)
        )
        ctx.fillStyle = CANVAS_NODE_COLORS.titleBar
        ctx.fillRect(0, height - titleHeight, width, titleHeight)
        ctx.fillStyle = CANVAS_NODE_COLORS.text
        ctx.font = '600 18px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        titleLines.forEach((line, index) =>
          ctx.fillText(
            line,
            width / 2,
            height - titleHeight + 4 + index * 22,
            width - canvasSettings.value.nodePadding * 2
          )
        )
      } else {
        ctx.fillStyle = CANVAS_NODE_COLORS.background
        ctx.beginPath()
        ctx.roundRect(0, 0, width, height, CANVAS_NODE_RADIUS)
        ctx.fill()
        ctx.fillStyle = CANVAS_NODE_COLORS.text
        ctx.font = `600 ${titleFontSize}px system-ui`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        titleLines
          .slice(0, 6)
          .forEach((line, index) =>
            ctx.fillText(
              line,
              width / 2,
              (height - Math.min(titleLines.length, 6) * (titleFontSize + 3)) /
                2 +
                index * (titleFontSize + 3),
              width - canvasSettings.value.nodePadding * 2
            )
          )
      }
      ctx.restore()
    }
    graph.add(node)
    nodePaths.set(node, item.id)
    renderedNodes.set(item.id, node)
    for (const file of nodeGroups.get(item.id)?.files || [])
      renderedNodes.set(file.id, node)
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
    // These arrows explain the workflow, not verified file dependencies.
    if (focusedStage.value === null) {
      for (let stage = 0; stage < 4; stage++) {
        const first = renderedNodes.get(`step:${stage}`),
          last = renderedNodes.get(`step:${stage + 1}`)
        if (!first || !last) continue
        const from = [
            first.pos[0] + first.size[0] / 2,
            first.pos[1] + first.size[1] / 2
          ],
          to = [last.pos[0] + last.size[0] / 2, last.pos[1] + last.size[1] / 2]
        const angle = Math.atan2(to[1] - from[1], to[0] - from[0])
        const x1 = from[0] + Math.cos(angle) * 155,
          y1 = from[1] + Math.sin(angle) * 155
        const x2 = to[0] - Math.cos(angle) * 155,
          y2 = to[1] - Math.sin(angle) * 155
        ctx.save()
        ctx.strokeStyle = '#82b9d8'
        ctx.fillStyle = '#b8d7e8'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        ctx.save()
        ctx.translate(x2, y2)
        ctx.rotate(angle)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(-14, -7)
        ctx.lineTo(-14, 7)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
        ctx.font = '18px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(stepLinks[stage], (x1 + x2) / 2, (y1 + y2) / 2 - 14)
        ctx.restore()
      }
    }
    // Each result belongs to one step. Neutral spokes express membership.
    for (const [id, group] of nodeGroups) {
      const hub = renderedNodes.get(`step:${group.stage}`),
        child = renderedNodes.get(id)
      if (!hub || !child) continue
      ctx.save()
      ctx.strokeStyle = '#66809766'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 7])
      ctx.beginPath()
      ctx.moveTo(hub.pos[0] + hub.size[0] / 2, hub.pos[1] + hub.size[1] / 2)
      ctx.lineTo(
        child.pos[0] + child.size[0] / 2,
        child.pos[1] + child.size[1] / 2
      )
      ctx.stroke()
      ctx.restore()
    }
    for (const edge of projection.value?.edges || []) {
      const from = renderedNodes.get(edge.from),
        to = renderedNodes.get(edge.to)
      const activeFiles = new Set(
        selectedGroup.value?.files.map((f) => f.id) ||
          (selected.value ? [selected.value.id] : [])
      )
      if (!activeFiles.has(edge.from) && !activeFiles.has(edge.to)) continue
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
  }
  element.value!.addEventListener(
    'contextmenu',
    (e) => {
      e.preventDefault()
      e.stopImmediatePropagation()
    },
    true
  )
  const hitNode = (event: PointerEvent) => {
    const [x, y] = canvas.convertEventToCanvasOffset(event)
    return [...graph.nodes]
      .reverse()
      .find(
        (n) =>
          x >= n.pos[0] &&
          x <= n.pos[0] + n.size[0] &&
          y >= n.pos[1] &&
          y <= n.pos[1] + n.size[1]
      )
  }
  let drag: {
    node: LGraphNode
    pointer: number
    start: [number, number]
    pos: [number, number]
    moved: boolean
  } | null = null
  element.value!.addEventListener(
    'pointerdown',
    (event) => {
      autoFitImages = false
      if (event.button !== 0) return
      const node = hitNode(event)
      if (!node) return
      drag = {
        node,
        pointer: event.pointerId,
        start: [event.clientX, event.clientY],
        pos: [node.pos[0], node.pos[1]],
        moved: false
      }
      element.value!.setPointerCapture(event.pointerId)
      event.preventDefault()
      event.stopImmediatePropagation()
    },
    true
  )
  element.value!.addEventListener(
    'pointermove',
    (event) => {
      if (!drag || drag.pointer !== event.pointerId) return
      const dx = event.clientX - drag.start[0],
        dy = event.clientY - drag.start[1]
      if (Math.hypot(dx, dy) > 5) drag.moved = true
      if (drag.moved) {
        drag.node.pos = [
          drag.pos[0] + dx / canvas.ds.scale,
          drag.pos[1] + dy / canvas.ds.scale
        ]
        canvas.setDirty(true, true)
      }
      event.preventDefault()
      event.stopImmediatePropagation()
    },
    true
  )
  element.value!.addEventListener(
    'pointerup',
    (event) => {
      if (!drag || drag.pointer !== event.pointerId) return
      const finished = drag
      drag = null
      element.value!.releasePointerCapture(event.pointerId)
      if (finished.moved) persistPosition(finished.node)
      else selectPath(nodePaths.get(finished.node)!)
      event.preventDefault()
      event.stopImmediatePropagation()
    },
    true
  )
  element.value!.addEventListener(
    'pointercancel',
    () => {
      if (drag) {
        drag.node.pos = drag.pos
        drag = null
        canvas.setDirty(true, true)
      }
    },
    true
  )
  element.value!.addEventListener(
    'wheel',
    () => {
      autoFitImages = false
    },
    { capture: true, passive: true }
  )
  window.addEventListener('pointerdown', mouseHistory, true)
  window.addEventListener('pointerup', mouseHistory, true)
  window.addEventListener('auxclick', mouseHistory, true)
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
  window.removeEventListener('pointerdown', mouseHistory, true)
  window.removeEventListener('pointerup', mouseHistory, true)
  window.removeEventListener('auxclick', mouseHistory, true)
  disposed = true
  request++
  observer?.disconnect()
  canvas?.stopRendering()
  canvas?.unbindEvents()
  graph?.clear()
})
</script>

<style scoped>
.scene-guide {
  position: absolute;
  bottom: 16px;
  left: 16px;
  max-width: 65vw;
  padding: 10px 14px;
  background: #162834ee;
  color: #b8d7e8;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.7;
  pointer-events: none;
}
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
