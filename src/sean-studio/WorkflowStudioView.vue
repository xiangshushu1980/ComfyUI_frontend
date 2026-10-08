<!-- eslint-disable @intlify/vue-i18n/no-raw-text -- Sean v0.2 UI is Chinese. -->
<template>
  <div :class="['workspace', { 'library-collapsed': !libraryOpen }]">
    <div class="floating-brand">
      <span class="brand-mark" aria-hidden="true">◈</span>
      <span class="brand-project">{{ project?.name || 'STUDIO' }}</span>
      <button
        type="button"
        class="library-toggle"
        :aria-label="libraryOpen ? '收起左侧面板' : '展开左侧面板'"
        :title="libraryOpen ? '收起左侧面板' : '展开左侧面板'"
        @click="libraryOpen = !libraryOpen"
      >
        {{ libraryOpen ? '‹' : '›' }}
      </button>
    </div>
    <aside v-if="libraryOpen" class="library">
      <label>影片工程</label
      ><select
        v-model="projectId"
        :disabled="navigationBusy"
        @change="openProject"
      >
        <option value="">选择工程</option>
        <option v-for="p in projects" :key="p.id" :value="p.id">
          {{ p.name }}
        </option></select
      ><button @click="newProject">＋ 新建工程</button>
      <label>业务 Workflow</label>
      <section
        v-for="d in definitions"
        :key="d.id"
        :class="['workflow-item', { chosen: activeWorkflowId === d.id }]"
      >
        <button
          class="workflow-entry"
          :aria-expanded="activeWorkflowId === d.id"
          :disabled="navigationBusy"
          @click="selectWorkflow(d.id)"
        >
          <strong>◇ {{ d.name }}</strong>
          <small>{{ workflowStatus(d.id) }}</small>
        </button>
        <button
          class="workflow-continue"
          :disabled="
            navigationBusy ||
            !projectId ||
            (d.target === 'entity' && !workflowTarget(d.id))
          "
          @click="enterWorkflow(d.id)"
        >
          {{
            navigationBusy && activeWorkflowId === d.id
              ? '正在打开…'
              : workspaceTrustPending(d.id)
                ? trustEntryOpenedFor === d.id
                  ? '打开并验证 PiWeb 会话 ↗'
                  : workspaceUrl && activeWorkflowId === d.id
                    ? '打开工作区信任入口 ↗'
                    : '查看信任入口'
                : '继续 PiWeb ↗'
          }}
        </button>
        <div v-if="activeWorkflowId === d.id" class="workflow-details">
          <div class="agent-title">
            π <strong>Workflow Agent</strong
            ><span :class="{ working: agentStatus.working }">{{
              agentStatus.working
                ? '正在工作'
                : statusName(currentSession?.status)
            }}</span>
          </div>
          <label v-if="d.target === 'entity'"
            >目标实体
            <select
              :value="workflowTarget(d.id)"
              :disabled="navigationBusy"
              @change="changeWorkflowTarget(d.id, $event)"
            >
              <option value="">选择目标实体</option>
              <option
                v-for="entity in entities"
                :key="entity.id"
                :value="entity.id"
              >
                {{ entity.name }}
              </option>
            </select>
          </label>
          <p v-if="d.target === 'entity' && !workflowTarget(d.id)" class="hint">
            先选择目标实体，再继续对应 PiWeb 会话。
          </p>
          <p>{{ currentSession?.goal || '从左侧业务 Workflow 进入。' }}</p>
          <p v-if="currentSession" class="session-identity">
            会话 {{ currentSession.id.slice(0, 8) }} ·
            {{ objectById(currentSession.targetId)?.name || '工程' }}
          </p>
          <pre class="agent-summary">{{
            agentStatus.summary.slice(-360) || '暂无输出'
          }}</pre>
          <template
            v-if="
              currentSession &&
              ['CreateEntity', 'GenerateThreeView'].includes(
                currentSession.workflowId
              )
            "
            ><h3>本次流程授权</h3>
            <label v-if="currentSession.workflowId === 'CreateEntity'"
              >概念候选数<select v-model.number="conceptCount">
                <option v-for="n in [0, 1, 2, 3, 4]" :key="n" :value="n">
                  {{ n }}
                </option>
              </select></label
            ><label class="toggle"
              ><input v-model="allowThreeView" type="checkbox" />{{
                currentSession.workflowId === 'CreateEntity'
                  ? '确认形象后自动生成三视图'
                  : '授权生成三视图'
              }}</label
            ><button @click="authorizeWorkflow">授权有限流程</button>
            <p class="hint">
              Agent 自动绑定输入。正式形象仍由你确认。
            </p></template
          >
          <p v-if="agentError" class="error">{{ agentError }}</p>
          <p v-if="workspaceToTrust" class="hint">
            请先在 PiWeb 信任此工程工作区，再返回这里点“打开并验证 PiWeb
            会话”。Studio 会校验信任、初始化对话并确认它可打开：<br />{{
              workspaceToTrust
            }}
          </p>
          <a
            v-if="workspaceUrl"
            :href="workspaceUrl"
            target="_blank"
            rel="noopener noreferrer"
            @click="markTrustEntryOpened(d.id)"
            >在 PiWeb 打开“{{ project?.name || '当前工程' }} ·
            {{ d.name }}”并信任 ↗</a
          >
        </div>
      </section>
      <label>长期数据</label
      ><button @click="importing = true">＋ 导入整本小说</button>
      <label>实体</label
      ><button
        v-for="entity in entities"
        :key="entity.id"
        @click="queueInspect(entity, $event)"
        @dblclick="drillInto(entity, false)"
      >
        ◇ {{ entity.name }}<small>{{ kindName(entity.type) }}</small>
      </button>
      <label class="toggle"
        ><input
          v-model="showAllResources"
          type="checkbox"
        />展开全部实体资源</label
      >
      <p class="hint">在 PiWeb 表达目标。<br />这里检查对象、来源和结果。</p>
    </aside>
    <main>
      <nav class="canvas-navigation" aria-label="画布导航">
        <div class="navigation-location">
          <div class="breadcrumbs" aria-label="当前位置">
            <button
              type="button"
              :disabled="!navigationPath.length"
              :aria-current="!navigationPath.length ? 'page' : undefined"
              @click="navigatePath([])"
            >
              {{ project?.name || '工程' }}
            </button>
            <template v-for="(id, index) in navigationPath" :key="id">
              <span aria-hidden="true">/</span>
              <button
                type="button"
                :disabled="index === navigationPath.length - 1"
                :aria-current="
                  index === navigationPath.length - 1 ? 'page' : undefined
                "
                :title="
                  objectById(id)?.name || kindName(objectById(id)?.kind || '')
                "
                @click="navigatePath(navigationPath.slice(0, index + 1))"
              >
                {{
                  objectById(id)?.name || kindName(objectById(id)?.kind || '')
                }}
              </button>
            </template>
          </div>
        </div>
        <button @click="fit">适配画布</button>
      </nav>
      <div ref="canvasHost" class="canvas-host">
        <canvas ref="canvasElement" />
        <div
          v-if="hoverTooltip"
          class="canvas-tooltip"
          :style="{ left: `${hoverTooltip.x}px`, top: `${hoverTooltip.y}px` }"
          role="tooltip"
        >
          <strong>{{ hoverTooltip.name }}</strong>
          <span>{{ hoverTooltip.help }}</span>
        </div>
        <div
          v-if="projectId && objects.length && !visibleObjects.length"
          class="empty scope-empty"
        >
          <h2>暂无下级内容</h2>
          <p>
            {{ currentObject?.name || '当前位置' }} 的内容尚未创建，可在 PiWeb
            中继续处理。
          </p>
          <button v-if="currentObject" @click="selected = currentObject">
            查看当前对象详情
          </button>
        </div>
        <div v-if="!objects.length" class="empty">
          <h1>从故事到形象</h1>
          <p>
            导入小说，进入实体提取 Workflow。<br />Agent 在 PiWeb
            持续工作，结果回到画布。
          </p>
          <button class="primary" @click="importing = true">导入小说</button>
        </div>
        <div v-if="runs.length" class="run-overlay">
          <div class="overlay-title">
            动态执行覆盖
            <button @click="showHistory = !showHistory">
              {{ showHistory ? '收起历史' : '展开历史' }}
            </button>
          </div>
          <button
            v-for="run in overlayRuns"
            :key="run.id"
            :class="['run-chip', { active: activeRun(run) }]"
            @click="queueInspect(run, $event)"
            @dblclick="drillInto(run)"
          >
            <span>{{
              run.status === 'failed' ? '!' : activeRun(run) ? '◉' : '✓'
            }}</span
            ><strong>{{ run.name }}</strong
            ><small>{{ statusName(run.status) }}</small
            ><span>详情 ↗</span>
          </button>
        </div>
        <div class="legend">
          长期关系：实线 <span>执行绑定：虚线 · 已完成 Run 保留来源记录</span>
        </div>
      </div>
      <section v-if="selected" class="inspector">
        <div class="inspector-head">
          <span>{{ kindName(selected.kind) }} · v{{ selected.revision }}</span
          ><button @click="selected = null">×</button>
        </div>
        <h2>{{ selected.name || kindName(selected.kind) }}</h2>
        <p>{{ selected.description || selected.brief }}</p>
        <template v-if="selected.kind === 'chapter'"
          ><p>
            原文 {{ selected.sourceId }} · {{ selected.anchorIds?.join(' · ') }}
          </p>
          <pre>{{ chapterText(selected) }}</pre>
          <button @click="enterWorkflow('ExtractEntities')">
            在 PiWeb 提取实体 ↗
          </button></template
        >
        <template v-if="selected.kind === 'source'"
          ><p>原文来源 · {{ selected.anchors?.length }} 段</p>
          <button @click="structureSource(selected)">
            结构化为章节
          </button></template
        >
        <template v-if="selected.kind === 'entity'"
          ><button class="primary" @click="enterWorkflow('CreateEntity')">
            进入实体创建 Workflow ↗
          </button>
          <h3>参考元素</h3>
          <textarea
            v-model="referenceText"
            placeholder="参考描述、风格或外观要求"
          /><button @click="addTextReference">保存参考描述</button
          ><label class="upload"
            >上传参考 PNG<input
              type="file"
              accept="image/png"
              @change="uploadReference"
          /></label>
          <p>
            正式形象：{{ selected.appearanceAssetId || '尚未确认' }}
          </p></template
        >
        <template v-if="selected.kind === 'proposal'"
          ><p>逐项确认关键实体；关系在两端实体确认后采用。</p>
          <article
            v-for="item in selected.items"
            :key="item.key"
            class="candidate"
          >
            <strong>{{ item.name || item.description || item.key }}</strong
            ><small>{{ item.kind }} · {{ item.type }}</small>
            <p>{{ item.description }}</p>
            <small v-for="source in item.sources" :key="source.anchorId"
              >{{ source.anchorId }} · 来源 v{{ source.revision }}</small
            ><button
              :disabled="
                Boolean(selected.resolved?.[item.key]) ||
                selected.status !== 'pending'
              "
              @click="confirmCandidate(item.key)"
            >
              {{ selected.resolved?.[item.key] ? '已确认' : '确认这一项' }}
            </button>
          </article></template
        >
        <template v-if="selected.kind === 'resource'"
          ><img
            v-if="selected.assetId"
            :src="contentUrl(selected.assetId)"
            class="resource-image"
          />
          <pre v-else>{{ selected.text }}</pre>
          <p>{{ selected.role }} · {{ selected.status }}</p>
          <button
            v-if="selected.role === 'concept'"
            class="primary"
            @click="confirmConcept(selected)"
          >
            确认正式形象 · 继续已授权三视图</button
          ><button
            v-if="selected.workflowRunId"
            @click="selectId(selected!.workflowRunId)"
          >
            查看来源 Run</button
          ><button @click="enterResourceSession(selected)">
            继续对应 PiWeb ↗
          </button></template
        >
        <template v-if="selected.kind === 'workflow_run'"
          ><p>{{ statusName(selected.status) }}</p>
          <button @click="openRunSession(selected)">打开对应 PiWeb ↗</button
          ><button
            v-if="selected.childRunIds?.length"
            @click="viewExecution(selected)"
          >
            查看底层固定流程
          </button>
          <h3>输入 · Workflow v{{ selected.definitionVersion }}</h3>
          <pre>{{ JSON.stringify(selected.inputs, null, 2) }}</pre>
          <h3>参数与实际输出</h3>
          <pre>{{ JSON.stringify(selected.parameters, null, 2) }}</pre>
          <button
            v-for="id in selected.outputs"
            :key="id"
            @click="selectOutput(id)"
          >
            {{ id.slice(0, 12) }} ↗
          </button>
          <div v-for="id in selected.childRunIds" :key="id">
            <strong>{{ statusName(objectById(id)?.status) }}</strong>
            <p>{{ objectById(id)?.error }}</p>
            <small v-for="(node, key) in objectById(id)?.nodes" :key="key"
              >节点 {{ key }} · {{ node.event }}
              {{
                node.value === undefined ? '' : `${node.value}/${node.max}`
              }}</small
            >
          </div></template
        >
      </section>
    </main>
    <div v-if="importing" class="modal">
      <form @submit.prevent="importNovel">
        <h2>导入整本小说</h2>
        <input v-model="novelName" placeholder="小说名称" required /><input
          type="file"
          accept=".txt,.md"
          @change="loadNovelFile"
        /><textarea
          v-model="novelText"
          placeholder="粘贴正文，保留章节标题和段落"
          required
        />
        <p>
          按中文章节、Chapter 或 Markdown 标题分章；无标题时保留为一个章节。
        </p>
        <button class="primary">导入并生成章节</button
        ><button type="button" @click="importing = false">取消</button>
      </form>
    </div>
    <div v-show="executionSnapshot" class="execution-modal">
      <div>
        <strong>底层执行快照 · 只读</strong
        ><button @click="executionSnapshot = null">返回主数据图 ×</button>
      </div>
      <NativeWorkflow
        ref="native"
        :active="Boolean(executionSnapshot)"
        @ready="loadExecution"
        @error="showError"
      />
    </div>
    <div v-if="error" class="toast" @click="error = ''">{{ error }} ×</div>
  </div>
</template>
<script setup lang="ts">
// Owner: Sean. Durable business objects and runtime overlays are separate projections.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LGraph, LGraphCanvas, LGraphNode } from '@/lib/litegraph/src/litegraph'
import type { Rect } from '@/lib/litegraph/src/interfaces'
import { toNodeId } from '@/types/nodeId'
import NativeWorkflow from './NativeWorkflow.vue'
import { requestId, studioApi } from './api'
import {
  canDrill,
  hitCanvasNode,
  objectHierarchy,
  objectPath,
  projectScope,
  readRoute,
  routeHash
} from './canvasNavigation'
type Obj = {
  id: string
  kind: string
  revision: number
  name?: string
  // Heterogeneous persisted payloads are validated by the shared service operations.
  // oxlint-disable-next-line typescript/no-explicit-any
  [key: string]: any
}
const projects = ref<Obj[]>([]),
  libraryOpen = ref(true),
  objects = ref<Obj[]>([]),
  project = ref<Obj>(),
  projectId = ref(
    readRoute(location.hash)?.projectId ||
      localStorage.getItem('sean-studio-project') ||
      ''
  ),
  selected = ref<Obj | null>(null)
const definitions = ref<Obj[]>([]),
  sessionId = ref(''),
  navigationPath = ref<string[]>([]),
  showAllResources = ref(false),
  showHistory = ref(false)
type AgentStatus = { working: boolean; summary: string; piWebUrl: string }
const agentStates = ref<Record<string, AgentStatus>>({})
const agentStatus = computed(
  () =>
    agentStates.value[sessionId.value] || {
      working: false,
      summary: '',
      piWebUrl: ''
    }
)
const activeWorkflowId = ref(''),
  workflowTargets = ref<Record<string, string>>({}),
  navigationBusy = ref(false),
  workspaceUrl = ref(''),
  workspaceSessionUrl = ref(''),
  trustEntryOpenedFor = ref('')
const agentError = ref(''),
  workspaceToTrust = ref(''),
  error = ref('')
const importing = ref(false),
  novelName = ref(''),
  novelText = ref(''),
  referenceText = ref(''),
  conceptCount = ref(2),
  allowThreeView = ref(true)
const canvasHost = ref<HTMLElement>(),
  canvasElement = ref<HTMLCanvasElement>(),
  native = ref<InstanceType<typeof NativeWorkflow>>(),
  executionSnapshot = ref<Obj | null>(null)
const images = new Map<string, HTMLImageElement>()
const hoverTooltip = ref<{
  x: number
  y: number
  name: string
  help: string
} | null>(null)
const invalidGlowId = ref('')
const focusId = computed(() => navigationPath.value.at(-1) || '')
const currentObject = computed(() => objectById(focusId.value))
const visibleObjects = computed(() =>
  projectScope(objects.value, focusId.value, showAllResources.value).filter(
    (o) => !navigationPath.value.slice(0, -1).includes(o.id)
  )
)
const entities = computed(() =>
    objects.value.filter((o) => o.kind === 'entity')
  ),
  resources = computed(() =>
    objects.value.filter((o) => o.kind === 'resource')
  ),
  sessions = computed(() =>
    objects.value.filter((o) => o.kind === 'workflow_session')
  ),
  currentSession = computed(() =>
    sessions.value.find((s) => s.id === sessionId.value)
  ),
  runs = computed(() => objects.value.filter((o) => o.kind === 'workflow_run'))
const activeRun = (run: Obj) =>
  !['succeeded', 'failed', 'cancelled'].includes(run.status)
const overlayRuns = computed(() =>
  runs.value.filter((r) => showHistory.value || activeRun(r)).slice(-12)
)
const objectById = (id: string) => objects.value.find((o) => o.id === id)
const contentUrl = (id: string) => `/studio-api/v1/assets/${id}/content`
const names: Record<string, string> = {
  chapter: '章节',
  scene: '场景',
  entity: '实体',
  source: '小说原文',
  resource: '资源',
  proposal: '待确认候选',
  workflow_run: 'Workflow Run',
  character: '人物',
  prop: '道具',
  location: '地点',
  ready: '等待目标',
  working: '正在工作',
  running: '执行中',
  queued: '排队中',
  prepared: '准备执行',
  waiting_resource: '等待资源',
  waiting_confirmation: '等待确认',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
  submission_unknown: '提交待核对'
}
const kindName = (kind: string) => names[kind] || kind
const statusName = (status?: string) =>
  status ? names[status] || status : '未开始'
let graph: LGraph,
  canvas: LGraphCanvas,
  resizeObserver: ResizeObserver,
  events: EventSource | undefined,
  poll: ReturnType<typeof setInterval> | undefined,
  viewTimer: ReturnType<typeof setTimeout> | undefined,
  inspectTimer: ReturnType<typeof setTimeout> | undefined,
  invalidGlowTimer: ReturnType<typeof setTimeout> | undefined,
  refreshing = false
const logicalCanvasViewport: Rect = [0, 0, 0, 0]
let pointerStart: { x: number; y: number } | undefined
let pointerDragged = false
function showError(e: unknown) {
  error.value = e instanceof Error ? e.message : String(e)
}
async function refresh() {
  if (!projectId.value || refreshing) return
  const id = projectId.value
  refreshing = true
  try {
    const snapshot = await studioApi(`/projects/${id}/snapshot`)
    if (id !== projectId.value) return
    project.value = snapshot.project
    objects.value = snapshot.objects
    if (selected.value) selected.value = objectById(selected.value.id) || null
  } finally {
    refreshing = false
  }
}
async function openProject() {
  events?.close()
  project.value = undefined
  objects.value = []
  selected.value = null
  navigationPath.value = []
  sessionId.value = ''
  agentStates.value = {}
  if (!projectId.value) return
  localStorage.setItem('sean-studio-project', projectId.value)
  try {
    await refresh()
    activeWorkflowId.value = ''
    workflowTargets.value = {}
    const route = readRoute(location.hash)
    navigationPath.value =
      route?.projectId === projectId.value
        ? route.path.filter((id) => objectById(id))
        : []
    const current = objectById(navigationPath.value.at(-1) || '')
    selected.value =
      current &&
      !['source', 'chapter', 'scene', 'entity'].includes(current.kind)
        ? current
        : null
    if (route?.projectId !== projectId.value) writeRoute()
    await nextTick()
    projectGraph()
    restoreView()
    events = new EventSource(
      `/studio-api/v1/projects/${projectId.value}/events`
    )
    events.onmessage = () => {
      void refresh()
    }
    void refreshAgent()
  } catch (e) {
    showError(e)
  }
}
async function newProject() {
  const name = window.prompt('影片工程名称')
  if (!name?.trim()) return
  try {
    const p = await studioApi('/projects', { name, requestId: requestId() })
    projects.value.push(p)
    projectId.value = p.id
    await openProject()
  } catch (e) {
    showError(e)
  }
}
function viewKey() {
  return (
    'sean-canvas-view:' +
    routeHash({ projectId: projectId.value, path: navigationPath.value })
  )
}
function rememberView() {
  clearTimeout(viewTimer)
  if (!projectId.value || !canvas) return
  localStorage.setItem(
    viewKey(),
    JSON.stringify({
      scale: canvas.ds.scale,
      offset: Array.from(canvas.ds.offset)
    })
  )
}
function restoreView() {
  try {
    const saved = JSON.parse(localStorage.getItem(viewKey()) || 'null')
    if (
      saved &&
      Number.isFinite(saved.scale) &&
      saved.scale > 0 &&
      Array.isArray(saved.offset) &&
      saved.offset.length === 2 &&
      saved.offset.every(Number.isFinite)
    ) {
      canvas.ds.scale = saved.scale
      canvas.ds.offset = saved.offset
      canvas.setDirty(true, true)
      return
    }
  } catch {
    /* Ignore an invalid private viewport preference. */
  }
  fit()
}
function writeRoute() {
  const hash = routeHash({
    projectId: projectId.value,
    path: navigationPath.value
  })
  if (location.hash !== hash) history.pushState(null, '', hash)
}
function navigatePath(path: string[], updateUrl = true) {
  clearTimeout(inspectTimer)
  rememberView()
  navigationPath.value = path
  const object = objectById(path.at(-1) || '')
  selected.value =
    object && !['source', 'chapter', 'scene', 'entity'].includes(object.kind)
      ? object
      : null
  if (updateUrl) writeRoute()
  projectGraph()
  restoreView()
}
function select(o: Obj) {
  selected.value = o
}
function queueInspect(o: Obj, event: MouseEvent) {
  clearTimeout(inspectTimer)
  if (event.detail < 2) inspectTimer = setTimeout(() => select(o), 300)
}
function drillInto(o: Obj, contextual = true) {
  clearTimeout(inspectTimer)
  if (
    focusId.value === o.id ||
    !canDrill(objects.value, o.id, showAllResources.value)
  ) {
    flashInvalidAction(o.id)
    select(o)
    return
  }
  const existing = navigationPath.value.indexOf(o.id)
  const path =
    existing >= 0
      ? navigationPath.value.slice(0, existing + 1)
      : contextual && navigationPath.value.length
        ? [...navigationPath.value, o.id]
        : objectPath(o.id, objectHierarchy(objects.value))
  navigatePath(path)
}
function flashInvalidAction(id: string) {
  clearTimeout(invalidGlowTimer)
  invalidGlowId.value = id
  canvas?.setDirty(true, true)
  invalidGlowTimer = setTimeout(() => {
    invalidGlowId.value = ''
    canvas?.setDirty(true, true)
  }, 700)
}
function nodePreview(o: Obj) {
  const source = o.sourceId && objectById(o.sourceId)
  const chapterText =
    o.kind === 'chapter' && source?.text
      ? source.text.slice(o.start || 0, o.end || undefined)
      : ''
  const raw =
    o.preview ||
    o.description ||
    o.brief ||
    chapterText ||
    o.text ||
    o.status ||
    ''
  return String(raw).replace(/\s+/g, ' ').trim().slice(0, 170)
}
function selectId(id: string) {
  const o = objectById(id)
  if (o) select(o)
}
function selectOutput(id: string) {
  const o = resources.value.find((r) => r.assetId === id) || objectById(id)
  if (o) select(o)
}
function mouseHistory(event: MouseEvent) {
  if (event.button !== 3 && event.button !== 4) return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.type === 'pointerup') history.go(event.button === 3 ? -1 : 1)
}
async function restoreRoute() {
  const route = readRoute(location.hash)
  if (!route) return
  if (route.projectId !== projectId.value) {
    rememberView()
    projectId.value = route.projectId
    await openProject()
  } else
    navigatePath(
      route.path.filter((id) => objectById(id)),
      false
    )
}
function chapterText(c: Obj) {
  return (
    objectById(c.sourceId)?.text?.slice(c.start, c.end) ||
    c.brief ||
    '此历史章节尚未绑定原文；请先结构化小说。'
  )
}
async function loadNovelFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) {
    novelText.value = await file.text()
    novelName.value ||= file.name.replace(/\.[^.]+$/, '')
  }
}
async function importNovel() {
  try {
    await studioApi(`/projects/${projectId.value}/novels`, {
      name: novelName.value,
      text: novelText.value,
      requestId: requestId()
    })
    importing.value = false
    await refresh()
    fit()
  } catch (e) {
    showError(e)
  }
}
async function structureSource(source: Obj) {
  try {
    await studioApi(`/projects/${projectId.value}/novels`, {
      sourceId: source.id,
      requestId: requestId()
    })
    await refresh()
    fit()
  } catch (e) {
    showError(e)
  }
}
function workflowTarget(workflowId: string): string {
  const definition = definitions.value.find((d) => d.id === workflowId)
  if (definition?.target !== 'entity') return projectId.value
  if (Object.hasOwn(workflowTargets.value, workflowId))
    return workflowTargets.value[workflowId]
  const target = selected.value || currentObject.value
  if (target?.kind === 'entity') return target.id
  if (target?.kind === 'resource') return target.entityId
  return (
    sessions.value.findLast((s) => s.workflowId === workflowId)?.targetId ||
    (entities.value.length === 1 ? entities.value[0].id : '')
  )
}
function workflowSession(workflowId: string) {
  return sessions.value.findLast(
    (s) =>
      s.workflowId === workflowId &&
      s.targetId === workflowTarget(workflowId) &&
      !s.closed
  )
}
function workflowBinding(workflowId: string) {
  const session = workflowSession(workflowId)
  return session
    ? objects.value.find(
        (b) =>
          b.kind === 'pi_binding' && b.discussionId === session.discussionId
      )
    : undefined
}
function workspaceTrustPending(workflowId: string) {
  return workflowBinding(workflowId)?.status === 'guard_unverified'
}
function workflowStatus(workflowId: string) {
  const session = workflowSession(workflowId)
  if (workspaceTrustPending(workflowId)) return '工作区待信任'
  if (session)
    return agentStates.value[session.id]?.working
      ? '正在工作'
      : statusName(session.status)
  return definitions.value.find((d) => d.id === workflowId)?.target ===
    'entity' && !workflowTarget(workflowId)
    ? '待选择实体'
    : '未开始'
}
async function prepareWorkflow(workflowId: string) {
  if (!projectId.value) throw new Error('请先选择工程')
  const definition = definitions.value.find((d) => d.id === workflowId)!
  const targetId = workflowTarget(workflowId)
  if (definition.target === 'entity' && !targetId)
    throw new Error('请先选择目标实体')
  if (definition.target === 'entity')
    workflowTargets.value[workflowId] = targetId
  return (await studioApi(`/projects/${projectId.value}/workflow-sessions`, {
    workflowId,
    targetId,
    requestId: requestId()
  })) as Obj
}
async function selectWorkflow(workflowId: string) {
  activeWorkflowId.value = workflowId
  sessionId.value = workflowSession(workflowId)?.id || ''
  agentError.value = ''
  workspaceToTrust.value = ''
  workspaceUrl.value = ''
  workspaceSessionUrl.value = ''
  trustEntryOpenedFor.value = ''
  if (!projectId.value || !workflowTarget(workflowId)) return
  const project = projectId.value
  try {
    const session = await prepareWorkflow(workflowId)
    await refresh()
    if (projectId.value === project && activeWorkflowId.value === workflowId)
      sessionId.value = session.id
    if (
      projectId.value === project &&
      activeWorkflowId.value === workflowId &&
      workspaceTrustPending(workflowId)
    ) {
      await showWorkspaceTrustEntry(workflowId, session)
      return
    }
    await refreshAgent()
  } catch (e) {
    if (activeWorkflowId.value === workflowId)
      agentError.value = String(e instanceof Error ? e.message : e)
  }
}
async function changeWorkflowTarget(workflowId: string, event: Event) {
  workflowTargets.value[workflowId] = (event.target as HTMLSelectElement).value
  await selectWorkflow(workflowId)
}
async function enterWorkflow(workflowId: string, entityId?: string) {
  if (navigationBusy.value) return
  if (entityId) workflowTargets.value[workflowId] = entityId
  const canContinueAfterTrust =
    workspaceTrustPending(workflowId) &&
    trustEntryOpenedFor.value === workflowId
  activeWorkflowId.value = workflowId
  agentError.value = ''
  if (!workspaceTrustPending(workflowId)) {
    workspaceToTrust.value = ''
    workspaceUrl.value = ''
    workspaceSessionUrl.value = ''
    trustEntryOpenedFor.value = ''
  }
  if (!projectId.value || !workflowTarget(workflowId)) {
    agentError.value = '请先选择工程及目标实体'
    return
  }
  if (canContinueAfterTrust && workspaceSessionUrl.value) {
    // Reload the exact session first so PiWeb's session_start hook can verify
    // workspace trust, then let the server initialize it if it is still absent
    // from PiWeb's conversation list.
    const tab = window.open('about:blank', '_blank')
    if (!tab) {
      agentError.value =
        '浏览器拦截了新标签页，请使用下方“信任后重新加载此 PiWeb 会话”链接。'
      return
    }
    tab.opener = null
    tab.location.href = workspaceSessionUrl.value
    navigationBusy.value = true
    try {
      agentError.value = '正在等待 PiWeb 加载扩展并验证此工作区…'
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        await refresh()
        if (!workspaceTrustPending(workflowId)) {
          const session = workflowSession(workflowId)
          if (!session)
            throw new Error('Workflow 会话已变化，请重新选择后再试。')
          agentError.value = '工作区已验证，正在初始化并确认此对话可打开…'
          await navigatePiWeb(session, tab)
          agentError.value = '验证完成，已打开当前 Workflow 的 PiWeb 对话。'
          return
        }
      }
      agentError.value =
        'PiWeb 尚未回传验证状态。请确认新标签页已加载完成，再点此按钮重试。'
    } catch (e) {
      agentError.value = e instanceof Error ? e.message : String(e)
    } finally {
      navigationBusy.value = false
    }
    return
  }
  const existingSession = workflowSession(workflowId)
  if (existingSession && workspaceTrustPending(workflowId)) {
    navigationBusy.value = true
    try {
      await refresh()
      const latestSession = workflowSession(workflowId)
      if (
        latestSession &&
        workspaceTrustPending(workflowId) &&
        !canContinueAfterTrust
      ) {
        await showWorkspaceTrustEntry(workflowId, latestSession)
        return
      }
    } catch (e) {
      agentError.value = e instanceof Error ? e.message : String(e)
      return
    } finally {
      navigationBusy.value = false
    }
  }
  // Reserve the tab inside the user gesture, before any asynchronous operation.
  const tab = window.open('about:blank', '_blank')
  navigationBusy.value = true
  try {
    const session = await prepareWorkflow(workflowId)
    await refresh()
    sessionId.value = session.id
    await navigatePiWeb(session, tab)
  } catch (e) {
    tab?.close()
    agentError.value = e instanceof Error ? e.message : String(e)
  } finally {
    navigationBusy.value = false
  }
}
async function showWorkspaceTrustEntry(workflowId: string, session: Obj) {
  const prepared = await studioApi(
    `/discussions/${session.discussionId}/workspace`,
    { requestId: requestId() }
  )
  if (activeWorkflowId.value !== workflowId) return
  workspaceToTrust.value = workflowWorkspaceLabel(workflowId)
  workspaceUrl.value = prepared.piWebWorkspaceUrl || ''
  workspaceSessionUrl.value = prepared.piWebUrl || ''
  trustEntryOpenedFor.value = ''
  agentError.value = workspaceUrl.value
    ? '请按上方说明完成信任，再继续打开此 Workflow 的 PiWeb 对话。'
    : '无法生成工作区信任入口，请稍后重试。'
}
function markTrustEntryOpened(workflowId: string) {
  trustEntryOpenedFor.value = workflowId
}
function workflowWorkspaceLabel(workflowId: string) {
  const definition = definitions.value.find((item) => item.id === workflowId)
  return `${project.value?.name || '当前工程'} · ${definition?.name || 'PiWeb 工作区'}`
}
async function openPiWeb() {
  const session = currentSession.value
  if (!session || navigationBusy.value) return
  const canContinueAfterTrust =
    workspaceTrustPending(session.workflowId) &&
    trustEntryOpenedFor.value === session.workflowId
  activeWorkflowId.value = session.workflowId
  workflowTargets.value[session.workflowId] = session.targetId
  if (workspaceTrustPending(session.workflowId)) {
    try {
      await refresh()
      const latestSession = workflowSession(session.workflowId)
      if (
        latestSession &&
        workspaceTrustPending(session.workflowId) &&
        !canContinueAfterTrust
      ) {
        await showWorkspaceTrustEntry(session.workflowId, latestSession)
        return
      }
    } catch (e) {
      agentError.value = e instanceof Error ? e.message : String(e)
      return
    }
  }
  const tab = window.open('about:blank', '_blank')
  navigationBusy.value = true
  try {
    await navigatePiWeb(session, tab)
  } catch (e) {
    tab?.close()
    agentError.value = e instanceof Error ? e.message : String(e)
  } finally {
    navigationBusy.value = false
  }
}
async function navigatePiWeb(session: Obj, tab: Window | null) {
  // Capture the returned session, never resolve a mutable current-session selector after awaiting.
  const prepared = await studioApi(
    `/discussions/${session.discussionId}/workspace`,
    { requestId: requestId() }
  )
  let binding
  try {
    binding = await studioApi(
      `/discussions/${session.discussionId}/pi-session`,
      { requestId: requestId() }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (/guard|trust.*workspace/i.test(message)) {
      workspaceToTrust.value = workflowWorkspaceLabel(session.workflowId)
      workspaceUrl.value = prepared.piWebWorkspaceUrl || ''
      workspaceSessionUrl.value = prepared.piWebUrl || ''
      trustEntryOpenedFor.value = ''
      throw new Error(
        '此 Workflow 的 PiWeb 工作区尚未就绪。请信任精确工作区，再重新加载此 PiWeb 会话以完成验证。',
        { cause: e }
      )
    }
    throw e
  }
  if (
    binding.discussionId !== session.discussionId ||
    !binding.sessionId ||
    !binding.piWebUrl
  )
    throw new Error('PiWeb 会话绑定不匹配，请重试')
  workspaceToTrust.value = ''
  workspaceUrl.value = ''
  workspaceSessionUrl.value = ''
  trustEntryOpenedFor.value = ''
  if (tab) {
    tab.opener = null
    tab.location.href = binding.piWebUrl
  } else window.location.assign(binding.piWebUrl)
  await refreshAgent()
}
async function refreshAgent() {
  const chosen = definitions.value
    .map((d) => workflowSession(d.id))
    .filter(
      (s): s is Obj =>
        !!s &&
        objects.value.some(
          (b) =>
            b.kind === 'pi_binding' &&
            b.discussionId === s.discussionId &&
            b.sessionId &&
            b.guardVersion === 1 &&
            b.status === 'bound'
        )
    )
  const project = projectId.value
  await Promise.allSettled(
    chosen.map(async (session) => {
      const status = await studioApi(
        `/discussions/${session.discussionId}/agent-status`
      )
      if (projectId.value === project) agentStates.value[session.id] = status
    })
  )
}
async function authorizeWorkflow() {
  const s = currentSession.value
  if (!s) return
  try {
    await studioApi(`/workflow-sessions/${s.id}/authorize`, {
      confirmed: true,
      conceptCount:
        s.workflowId === 'GenerateThreeView' ? 0 : conceptCount.value,
      threeView: allowThreeView.value,
      requestId: requestId()
    })
    agentError.value = ''
    await refresh()
  } catch (e) {
    showError(e)
  }
}
async function confirmCandidate(key: string) {
  const p = selected.value!
  try {
    await studioApi(`/proposals/${p.id}/adopt`, {
      expectedHash: p.contentHash,
      selectedKeys: [key],
      requestId: requestId()
    })
    await refresh()
  } catch (e) {
    showError(e)
  }
}
async function addTextReference() {
  const e = selected.value!
  try {
    const s = await studioApi(
      `/projects/${projectId.value}/workflow-sessions`,
      { workflowId: 'CreateEntity', targetId: e.id, requestId: requestId() }
    )
    await studioApi(`/workflow-sessions/${s.id}/operations/add_reference`, {
      type: 'text',
      text: referenceText.value,
      requestId: requestId()
    })
    referenceText.value = ''
    await refresh()
  } catch (err) {
    showError(err)
  }
}
async function uploadReference(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    await studioApi(`/entities/${selected.value!.id}/reference-image`, {
      name: file.name,
      data: btoa(binary),
      requestId: requestId()
    })
    await refresh()
  } catch (e) {
    showError(e)
  }
}
async function confirmConcept(resource: Obj) {
  try {
    const e = objectById(resource.entityId)!
    await studioApi(`/entities/${e.id}/appearance`, {
      assetId: resource.assetId,
      expectedRevision: e.revision,
      requestId: requestId()
    })
    await refresh()
  } catch (e) {
    showError(e)
  }
}
async function openRunSession(run: Obj) {
  sessionId.value = run.sessionId
  const session = currentSession.value
  if (session) {
    activeWorkflowId.value = session.workflowId
    workflowTargets.value[session.workflowId] = session.targetId
  }
  await openPiWeb()
}
async function enterResourceSession(resource: Obj) {
  const run = objectById(resource.workflowRunId)
  if (run) await openRunSession(run)
  else await enterWorkflow('CreateEntity', resource.entityId)
}
async function viewExecution(run: Obj) {
  executionSnapshot.value = objectById(run.childRunIds[0]) || null
  await nextTick()
  await loadExecution()
}
async function loadExecution() {
  if (executionSnapshot.value) {
    try {
      await native.value?.loadSnapshot(executionSnapshot.value.workflow)
    } catch (e) {
      showError(e)
    }
  }
}
function fit() {
  if (!canvas || !graph?.nodes.length || !canvasHost.value) return
  // Fit current business projection, independent of LiteGraph's stale selection.
  const nodes = graph.nodes
  const left = Math.min(...nodes.map((n) => n.pos[0]))
  const top = Math.min(...nodes.map((n) => n.pos[1] - 32))
  const right = Math.max(...nodes.map((n) => n.pos[0] + n.size[0]))
  const bottom = Math.max(...nodes.map((n) => n.pos[1] + n.size[1]))
  const width = Math.max(
    200,
    canvasHost.value.clientWidth - (selected.value ? 390 : 0)
  )
  const height = canvasHost.value.clientHeight
  canvas.ds.scale = Math.min(
    1,
    (width - 60) / (right - left),
    (height - 80) / (bottom - top)
  )
  canvas.ds.offset = [30 / canvas.ds.scale - left, 40 / canvas.ds.scale - top]
  canvas.setDirty(true, true)
}
function projectGraph() {
  if (!graph) return
  graph.clear()
  const chapterParents = objectHierarchy(objects.value)
  const visible = visibleObjects.value
  // Lay out a spanning forest; cross references remain edges, never duplicate nodes.
  const byId = new Map(visible.map((o) => [o.id, o]))
  const children = new Map<string, Obj[]>()
  const roots: Obj[] = []
  for (const o of visible) {
    let parentId =
      o.kind === 'chapter'
        ? chapterParents.get(o.id)
        : o.chapterId || o.entityId
    if (o.kind === 'entity') {
      parentId = objects.value.find(
        (r) =>
          r.kind === 'data_relation' &&
          r.type === 'mentions' &&
          r.toId === o.id &&
          byId.has(r.fromId)
      )?.fromId
      parentId ||= visible.find(
        (c) =>
          c.kind === 'chapter' &&
          (o.sources || []).some(
            (s: { sourceId: string; anchorId: string }) =>
              s.sourceId === c.sourceId && c.anchorIds?.includes(s.anchorId)
          )
      )?.id
    }
    if (parentId && parentId !== o.id && byId.has(parentId)) {
      const siblings = children.get(parentId) || []
      siblings.push(o)
      children.set(parentId, siblings)
    } else roots.push(o)
  }
  const positions = new Map<string, [number, number]>()
  const visited = new Set<string>()
  let row = 0
  const place = (o: Obj, depth: number) => {
    if (visited.has(o.id)) return
    visited.add(o.id)
    const start = row
    for (const child of children.get(o.id) || []) place(child, depth + 1)
    if (row === start) row += o.assetId ? 290 : 210
    positions.set(o.id, [depth * 400, start])
  }
  for (const root of roots) place(root, 0)
  for (const o of visible) place(o, 0)
  for (const o of visible) {
    const title = o.name || kindName(o.kind)
    const n = new LGraphNode(
      title.length > 18 ? title.slice(0, 17) + '…' : title
    )
    n.id = toNodeId(o.id)
    n.pos = positions.get(o.id)!
    n.size = [320, o.assetId ? 240 : 150]
    n.color =
      o.kind === 'entity'
        ? '#245853'
        : o.kind === 'proposal'
          ? '#665231'
          : '#2a3e52'
    n.bgcolor = '#152431'
    n.addInput('', '*')
    n.addOutput('', '*')
    if (o.assetId) {
      let image = images.get(o.assetId)
      if (!image) {
        image = new Image()
        image.src = `/studio-api/v1/assets/${o.assetId}/thumbnail`
        image.onload = () => canvas.setDirty(true, true)
        images.set(o.assetId, image)
      }
      n.onDrawBackground = (ctx) => {
        if (image?.complete && image.naturalWidth) {
          const scale = Math.min(296 / image.width, 155 / image.height)
          ctx.drawImage(
            image,
            12 + (296 - image.width * scale) / 2,
            58,
            image.width * scale,
            image.height * scale
          )
        }
      }
    }
    n.onDrawForeground = (ctx) => {
      ctx.save()
      if (invalidGlowId.value === o.id) {
        ctx.shadowColor = '#ff5b50'
        ctx.shadowBlur = 22
        ctx.strokeStyle = '#ff9a75'
        ctx.lineWidth = 3 / canvas.ds.scale
        ctx.strokeRect(2, 2, n.size[0] - 4, n.size[1] - 4)
      }
      ctx.restore()
      const drillStatus =
        focusId.value === o.id
          ? '当前层'
          : canDrill(objects.value, o.id, showAllResources.value)
            ? ''
            : '末级'
      if (drillStatus) {
        ctx.save()
        ctx.font = '11px system-ui'
        const badgeWidth = ctx.measureText(drillStatus).width + 14
        const badgeX = n.size[0] - badgeWidth - 8
        ctx.fillStyle = drillStatus === '当前层' ? '#43535e' : '#364752'
        ctx.beginPath()
        ctx.roundRect(badgeX, 5, badgeWidth, 20, 5)
        ctx.fill()
        ctx.fillStyle = '#e0e7eb'
        ctx.fillText(drillStatus, badgeX + 7, 19)
        ctx.restore()
      }
      ctx.save()
      ctx.beginPath()
      ctx.rect(10, 24, 300, n.size[1] - 24)
      ctx.clip()
      ctx.fillStyle = '#9eb4c4'
      ctx.font = '12px system-ui'
      ctx.fillText(
        `${kindName(o.kind)} · ${o.role || kindName(o.type || '')}`,
        14,
        40
      )
      if (!o.assetId) {
        ctx.fillStyle = '#d4e0e6'
        ctx.font = '12px system-ui'
        const lines: string[] = []
        let line = ''
        for (const character of nodePreview(o)) {
          const next = line + character
          if (line && ctx.measureText(next).width > 286) {
            lines.push(line)
            line = character.trimStart()
          } else line = next
        }
        if (line) lines.push(line)
        lines
          .slice(0, 4)
          .forEach((text, index) =>
            ctx.fillText(text, 14, 72 + index * 17, 286)
          )
      }
      ctx.restore()
    }
    graph.add(n)
  }
  const edges = objects.value.filter(
    (o) =>
      ['data_relation', 'relation'].includes(o.kind) &&
      !(
        o.type === 'contains' &&
        chapterParents.has(o.toId) &&
        o.fromId === byId.get(o.toId)?.sourceId
      )
  )
  for (const o of visible) {
    if (o.kind === 'chapter' && o.sourceId)
      edges.push({
        id: o.id + ':source',
        kind: 'data_relation',
        revision: 1,
        fromId: byId.has(chapterParents.get(o.id) || '')
          ? chapterParents.get(o.id)
          : o.sourceId,
        toId: o.id
      })
    if (o.chapterId)
      edges.push({
        id: o.id + ':chapter',
        kind: 'data_relation',
        revision: 1,
        fromId: o.chapterId,
        toId: o.id
      })
    if (o.entityId && o.kind === 'resource')
      edges.push({
        id: o.id + ':entity',
        kind: 'data_relation',
        revision: 1,
        fromId: o.entityId,
        toId: o.id
      })
  }
  const connected = new Set<string>()
  for (const edge of edges) {
    const key = edge.fromId + ':' + edge.toId
    if (connected.has(key)) continue
    connected.add(key)
    const from = graph.getNodeById(toNodeId(edge.fromId)),
      to = graph.getNodeById(toNodeId(edge.toId))
    if (from && to) from.connect(0, to, 0)
  }
  canvas.setDirty(true, true)
}
function resize() {
  if (!canvasHost.value || !canvas) return
  const rect = canvasHost.value.getBoundingClientRect()
  logicalCanvasViewport[2] = rect.width
  logicalCanvasViewport[3] = rect.height
  const scale = window.devicePixelRatio || 1
  canvas.resize(Math.round(rect.width * scale), Math.round(rect.height * scale))
  // LiteGraph uses the backing bitmap dimensions for its visible graph area.
  // Keep that calculation in CSS pixels while rendering both layers at DPR.
  canvas.ds.computeVisibleArea(logicalCanvasViewport)
  canvas.ctx.setTransform(scale, 0, 0, scale, 0, 0)
  canvas.bgcanvas.getContext('2d')?.setTransform(scale, 0, 0, scale, 0, 0)
  canvas.setDirty(true, true)
}
function saveView() {
  clearTimeout(viewTimer)
  viewTimer = setTimeout(rememberView, 250)
}
watch([objects, focusId, showAllResources], projectGraph)
onMounted(async () => {
  document.title = 'Story Studio · Sean'
  graph = new LGraph()
  canvas = new LGraphCanvas(canvasElement.value!, graph)
  const computeVisibleArea = canvas.ds.computeVisibleArea.bind(canvas.ds)
  canvas.ds.computeVisibleArea = () => computeVisibleArea(logicalCanvasViewport)
  canvas.read_only = true
  canvas.allow_interaction = false
  canvas.show_info = false
  canvas.min_font_size_for_lod = 0
  canvas.background_image = ''
  canvas.clear_background_color = '#101b25'
  canvas.render_canvas_border = false
  canvas.onDrawBackground = (ctx, area) => {
    const step = canvas.ds.scale < 0.4 ? 110 : 22
    ctx.fillStyle = '#2c3d4d'
    // LiteGraph applies DragAndScale before this callback. Grid positions,
    // visible_area and node.pos therefore share graph-space origin (0, 0).
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
  }
  canvas.allow_dragnodes = false
  canvas.allow_searchbox = false
  canvas.onDrawForeground = (ctx) => {
    ctx.save()
    ctx.setLineDash([7, 7])
    ctx.strokeStyle = '#d7ad62'
    ctx.globalAlpha = 0.55
    for (const run of overlayRuns.value.filter(activeRun)) {
      const from = graph.getNodeById(toNodeId(run.targetId))
      if (!from) continue
      for (const id of run.outputs || []) {
        const resource = resources.value.find((r) => r.assetId === id),
          to = resource && graph.getNodeById(toNodeId(resource.id))
        if (to) {
          ctx.beginPath()
          ctx.moveTo(from.pos[0] + 320, from.pos[1] + 90)
          ctx.lineTo(to.pos[0], to.pos[1] + 90)
          ctx.stroke()
        }
      }
    }
    ctx.restore()
  }
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvasHost.value!)
  window.addEventListener('resize', resize)
  canvasElement.value!.addEventListener('pointerdown', (event) => {
    clearTimeout(inspectTimer)
    pointerStart = { x: event.clientX, y: event.clientY }
    pointerDragged = false
  })
  canvasElement.value!.addEventListener('pointermove', (event) => {
    if (
      pointerStart &&
      Math.hypot(
        event.clientX - pointerStart.x,
        event.clientY - pointerStart.y
      ) > 6
    )
      pointerDragged = true
    const [x, y] = canvas.convertEventToCanvasOffset(event)
    const node = hitCanvasNode(graph.nodes, x, y)
    const object = node && objectById(String(node.id))
    if (object) {
      const rect = canvasHost.value!.getBoundingClientRect()
      hoverTooltip.value = {
        x: event.clientX - rect.left + 14,
        y: event.clientY - rect.top + 14,
        name: object.name || kindName(object.kind),
        help:
          object.id !== focusId.value &&
          canDrill(objects.value, object.id, showAllResources.value)
            ? '单击查看详情 · 双击进入下级'
            : '单击查看详情 · 当前对象没有可进入的下级'
      }
    } else hoverTooltip.value = null
  })
  canvasElement.value!.addEventListener('pointerleave', () => {
    hoverTooltip.value = null
  })
  canvasElement.value!.addEventListener('click', (event) => {
    if (pointerDragged || event.button !== 0) return
    const [x, y] = canvas.convertEventToCanvasOffset(event)
    const node = hitCanvasNode(graph.nodes, x, y)
    if (node) {
      const object = objectById(String(node.id))
      if (object) queueInspect(object, event)
    }
  })
  canvasElement.value!.addEventListener('dblclick', (event) => {
    clearTimeout(inspectTimer)
    if (pointerDragged || event.button !== 0) return
    const [x, y] = canvas.convertEventToCanvasOffset(event)
    const node = hitCanvasNode(graph.nodes, x, y)
    const object = node && objectById(String(node.id))
    if (object) drillInto(object)
  })
  canvasElement.value!.addEventListener('pointerup', saveView)
  canvasElement.value!.addEventListener('wheel', saveView)
  window.addEventListener('popstate', restoreRoute)
  window.addEventListener('pointerdown', mouseHistory, true)
  window.addEventListener('pointerup', mouseHistory, true)
  window.addEventListener('auxclick', mouseHistory, true)
  poll = setInterval(() => void refreshAgent(), 5000)
  try {
    projects.value = await studioApi('/projects')
    definitions.value = await studioApi('/workflow-definitions')
    if (projectId.value) await openProject()
  } catch (e) {
    showError(e)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('popstate', restoreRoute)
  window.removeEventListener('pointerdown', mouseHistory, true)
  window.removeEventListener('pointerup', mouseHistory, true)
  window.removeEventListener('auxclick', mouseHistory, true)
  events?.close()
  clearInterval(poll)
  clearTimeout(inspectTimer)
  clearTimeout(invalidGlowTimer)
  clearTimeout(viewTimer)
  resizeObserver?.disconnect()
  window.removeEventListener('resize', resize)
  canvas?.stopRendering()
})
</script>
<style scoped>
.workspace {
  --ink: #e2eaf0;
  --muted: #8ca2b4;
  --line: #2a3d4c;
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  background: #101b25;
  color: var(--ink);
  font: 13px/1.6 system-ui;
}
.library-collapsed {
  grid-template-columns: minmax(0, 1fr);
}
.floating-brand {
  position: absolute;
  z-index: 20;
  top: 12px;
  left: 302px;
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: min(360px, calc(100vw - 24px));
  padding: 6px 8px 6px 11px;
  border: 1px solid #344b5b;
  border-radius: 10px;
  background: rgb(20 34 46 / 92%);
  box-shadow: 0 5px 18px rgb(0 0 0 / 24%);
  backdrop-filter: blur(10px);
}
.library-collapsed .floating-brand {
  left: 12px;
}
.brand-mark {
  color: #94c8b1;
  font-size: 16px;
}
.brand-project {
  overflow: hidden;
  color: #e2eaf0;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.library-toggle {
  flex: 0 0 auto;
  padding: 2px 8px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 20px;
  line-height: 1.2;
}
.library-toggle:hover {
  color: var(--ink);
}
.version {
  color: var(--muted);
  font-size: 10px;
}
button,
select,
input,
textarea {
  font: inherit;
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #1b2e3c;
  padding: 9px 11px;
}
button {
  cursor: pointer;
}
button:hover {
  background: #294657;
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
button small {
  display: block;
  color: var(--muted);
  font-size: 10px;
}
.primary {
  background: #376c60;
  border-color: #538c7a;
}
label {
  display: block;
}
textarea {
  width: 100%;
  min-height: 90px;
  resize: vertical;
}
small {
  color: var(--muted);
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: 12px/1.8 system-ui;
}
.library {
  border-right: 1px solid var(--line);
  overflow: auto;
  padding: 20px 14px;
}
.library > label {
  margin: 22px 8px 10px;
  color: var(--muted);
  font-size: 10px;
  letter-spacing: 1px;
}
.library > label:first-child {
  margin-top: 0;
}
.library > button,
.library > select {
  width: 100%;
  text-align: left;
  margin-bottom: 7px;
}
.chosen {
  border-color: #6b9a87;
  background: #26473f;
}
.hint {
  color: var(--muted);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.toggle {
  display: flex !important;
  align-items: center;
  gap: 8px;
  letter-spacing: 0 !important;
  font-size: 11px !important;
}
main {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
nav {
  height: 70px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--line);
}
nav > div {
  margin-right: auto;
}
nav small {
  display: block;
  font-size: 10px;
}
.canvas-navigation {
  height: auto;
  min-height: 70px;
  flex-wrap: wrap;
  padding-left: 12px;
  padding-right: 12px;
}
.workspace:not(.library-collapsed) .canvas-navigation {
  padding-left: 302px;
}
.navigation-location {
  flex: 1;
  min-width: 160px;
}
.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow-x: auto;
  max-width: 100%;
}
.breadcrumbs > span {
  flex-shrink: 0;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 7px;
}
.breadcrumbs > button {
  flex-shrink: 0;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 7px;
  border: 0;
  border-radius: 4px;
  color: var(--muted);
  background: transparent;
  cursor: pointer;
}
.breadcrumbs > button:hover:not([aria-current='page']) {
  color: var(--ink);
  background: #203542;
}
.breadcrumbs [aria-current='page'] {
  color: #e2eaf0;
  background: #294657;
  cursor: default;
}
.breadcrumbs > button:disabled {
  cursor: default;
}
.scope-empty {
  max-width: 50%;
}
.canvas-host {
  flex: 1;
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: #101b25;
}
.canvas-host > canvas {
  display: block;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.canvas-tooltip {
  position: absolute;
  z-index: 2;
  display: grid;
  gap: 3px;
  max-width: 280px;
  padding: 8px 10px;
  border: 1px solid #456274;
  border-radius: 6px;
  color: var(--ink);
  background: #14232fee;
  box-shadow: 0 6px 20px #0008;
  font-size: 11px;
  pointer-events: none;
}
.canvas-tooltip span {
  color: #a8bbc8;
}
.empty {
  position: absolute;
  left: 15%;
  top: 20%;
  pointer-events: none;
}
.empty button {
  pointer-events: auto;
}
.empty h1 {
  font-weight: 400;
  font-size: 32px;
}
.empty p {
  color: var(--muted);
}
.legend {
  position: absolute;
  left: 18px;
  bottom: 14px;
  font-size: 10px;
  color: #9db5c4;
  pointer-events: none;
}
.legend span {
  margin-left: 18px;
  color: #aa976b;
}
.run-overlay {
  position: absolute;
  right: 15px;
  top: 15px;
  max-width: 340px;
}
.overlay-title {
  color: var(--muted);
  font-size: 10px;
  text-align: right;
}
.overlay-title button {
  padding: 3px 6px;
  margin-left: 10px;
  font-size: 10px;
}
.run-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
  padding: 9px 12px;
  background: #192a35e8;
  font-size: 11px;
  opacity: 0.65;
}
.run-chip.active {
  opacity: 1;
  border-color: #6d6544;
}
.run-chip strong {
  font-weight: 500;
}
.run-chip small {
  margin-left: auto;
}
.run-chip > span:first-child {
  color: #89bfa8;
}
.run-chip.active > span:first-child {
  color: #d0b56a;
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}
.agent-title {
  display: flex;
  gap: 8px;
  align-items: center;
}
.agent-title > span {
  margin-left: auto;
  font-size: 10px;
  color: var(--muted);
}
.working {
  color: #97cfb5 !important;
}
.workflow-details select,
.workflow-details > button {
  width: 100%;
  margin-top: 12px;
}
.workflow-details > p {
  font-size: 11px;
  color: var(--muted);
}
.agent-summary {
  max-height: 120px;
  overflow: auto;
  color: #b0c1cf;
  font-size: 11px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 18px;
}
.workflow-details h3 {
  font-weight: 500;
  font-size: 12px;
  margin-top: 25px;
}
.workflow-details label {
  font-size: 11px;
  margin: 10px 0;
}
.inspector {
  position: absolute;
  top: 80px;
  right: 12px;
  bottom: 40px;
  width: 370px;
  max-width: 90%;
  overflow: auto;
  padding: 20px;
  background: #162834f5;
  border: 1px solid #435c6c;
  border-radius: 12px;
  box-shadow: 0 20px 70px #0008;
  z-index: 20;
}
.inspector-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--muted);
  font-size: 11px;
}
.inspector h2 {
  font-weight: 500;
  font-size: 21px;
}
.inspector h3 {
  font-size: 13px;
  font-weight: 500;
}
.inspector p {
  color: #b6c8d5;
}
.inspector button {
  margin: 6px 4px 6px 0;
  font-size: 11px;
}
.inspector small {
  display: block;
  font-size: 10px;
}
.inspector pre {
  max-height: 270px;
  overflow: auto;
}
.resource-image {
  width: 100%;
  border-radius: 7px;
}
.candidate {
  border-top: 1px solid var(--line);
  padding: 14px 0;
}
.upload {
  padding: 10px;
  border: 1px dashed #5d7887;
  border-radius: 7px;
  font-size: 11px;
}
.upload input {
  width: 100%;
  font-size: 10px;
}
.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: #08121bcc;
  display: flex;
  justify-content: center;
  align-items: center;
}
.modal form {
  width: 650px;
  max-width: 90%;
  padding: 30px;
  background: #192d3b;
  border: 1px solid #4d6678;
  border-radius: 14px;
}
.modal input,
.modal textarea {
  display: block;
  width: 100%;
  margin-bottom: 12px;
}
.modal textarea {
  min-height: 320px;
}
.modal button {
  margin-right: 10px;
}
.modal p {
  font-size: 11px;
  color: var(--muted);
}
.toast {
  position: fixed;
  bottom: 25px;
  left: 30%;
  max-width: 600px;
  background: #663b3c;
  padding: 18px;
  border-radius: 9px;
  z-index: 200;
  cursor: pointer;
}
.error {
  color: #e0aa9f !important;
}
.execution-modal {
  position: fixed;
  inset: 80px 40px 30px;
  background: #132534;
  border: 1px solid #486777;
  z-index: 80;
}
.execution-modal > div:first-child {
  height: 50px;
  display: flex;
  justify-content: space-between;
  padding: 10px 20px;
}
.execution-modal :deep(.native-workflow) {
  top: 50px;
}
.workflow-item {
  margin-bottom: 9px;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
.workflow-entry {
  background: #203740;
  width: 100%;
  text-align: left;
  border: 0;
  border-radius: 0;
}
.workflow-entry strong {
  font-weight: 500;
}
.workflow-continue {
  width: 100%;
  padding: 5px 11px;
  text-align: left;
  border: 0;
  border-top: 1px solid var(--line);
  border-radius: 0;
  color: #b5d9cc;
  font-size: 11px;
}
.workflow-details {
  overflow: auto;
  padding: 12px;
  border: 0;
}
.workflow-details select {
  width: 100%;
}
.session-identity {
  color: var(--muted);
  font-size: 10px;
}
.workflow-details a {
  color: #a5d9c7;
}
</style>
