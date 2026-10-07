<!-- eslint-disable @intlify/vue-i18n/no-raw-text -- Sean v0.2 UI is Chinese. -->
<template>
  <div class="workspace">
    <header>
      <div class="logo">
        ◈ <strong>STORY / STUDIO</strong><small>Sean · AI 创作工作空间</small>
      </div>
      <span>{{ project?.name || '选择工程' }}</span
      ><span class="version">主数据图 + 执行覆盖 · v0.2</span>
    </header>
    <aside class="library">
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
            此 Workflow 的精确工作区尚需信任：<br />{{ workspaceToTrust }}
          </p>
          <a
            v-if="workspaceUrl"
            :href="workspaceUrl"
            target="_blank"
            rel="noopener noreferrer"
            >前往 PiWeb 工作区设置 ↗</a
          >
        </div>
      </section>
      <label>长期数据</label
      ><button @click="clearFocus">◈ 全部章节、场景与实体</button
      ><button @click="importing = true">＋ 导入整本小说</button>
      <button
        v-for="chapter in chapters"
        :key="chapter.id"
        :class="{ chosen: focusId === chapter.id }"
        @click="focusChapter(chapter)"
      >
        ▤ {{ chapter.name }}
      </button>
      <label>实体</label
      ><button
        v-for="entity in entities"
        :key="entity.id"
        @click="select(entity)"
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
      <nav>
        <div>
          <strong>{{ focusId ? '章节聚焦' : '项目主数据图' }}</strong
          ><small
            >{{ chapters.length }} 章节 · {{ entities.length }} 实体 ·
            {{ resources.length }} 资源</small
          >
        </div>
        <button v-if="focusId" @click="clearFocus">返回全部</button
        ><button @click="fit">适配画布</button>
      </nav>
      <div ref="canvasHost" class="canvas-host">
        <canvas ref="canvasElement" />
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
            @click="select(run)"
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
            进入实体创建 Workflow ↗</button
          ><button @click="expandSelectedEntity">展开实体资源</button>
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
import { toNodeId } from '@/types/nodeId'
import NativeWorkflow from './NativeWorkflow.vue'
import { requestId, studioApi } from './api'
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
  objects = ref<Obj[]>([]),
  project = ref<Obj>(),
  projectId = ref(localStorage.getItem('sean-studio-project') || ''),
  selected = ref<Obj | null>(null)
const definitions = ref<Obj[]>([]),
  sessionId = ref(''),
  focusId = ref(''),
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
  workspaceUrl = ref('')
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
const expandedEntities = new Set<string>(),
  images = new Map<string, HTMLImageElement>()
const chapters = computed(() =>
    objects.value.filter((o) => o.kind === 'chapter' && !o.supersededBy)
  ),
  entities = computed(() => objects.value.filter((o) => o.kind === 'entity')),
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
  viewRevision = 0,
  refreshing = false
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
  focusId.value = ''
  sessionId.value = ''
  expandedEntities.clear()
  agentStates.value = {}
  if (!projectId.value) return
  localStorage.setItem('sean-studio-project', projectId.value)
  try {
    await refresh()
    activeWorkflowId.value = ''
    workflowTargets.value = {}
    const view = await studioApi(
      `/projects/${projectId.value}/views/master-v02`
    )
    viewRevision = view.revision
    await nextTick()
    projectGraph()
    canvas.ds.scale = view.scale || 0.75
    canvas.ds.offset = view.offset || [60, 100]
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
function select(o: Obj) {
  selected.value = o
  if (o.kind === 'entity') {
    expandedEntities.add(o.id)
    projectGraph()
  }
}
function selectId(id: string) {
  const o = objectById(id)
  if (o) select(o)
}
function selectOutput(id: string) {
  const o = resources.value.find((r) => r.assetId === id) || objectById(id)
  if (o) select(o)
}
function focusChapter(c: Obj) {
  focusId.value = c.id
  select(c)
  projectGraph()
  fit()
}
function clearFocus() {
  focusId.value = ''
  projectGraph()
  fit()
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
  if (selected.value?.kind === 'entity') return selected.value.id
  if (selected.value?.kind === 'resource') return selected.value.entityId
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
function workflowStatus(workflowId: string) {
  const session = workflowSession(workflowId)
  const binding =
    session &&
    objects.value.find(
      (b) => b.kind === 'pi_binding' && b.discussionId === session.discussionId
    )
  if (binding?.status === 'guard_unverified') return '工作区待信任 / 加载'
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
  if (!projectId.value || !workflowTarget(workflowId)) return
  const project = projectId.value
  try {
    const session = await prepareWorkflow(workflowId)
    await refresh()
    if (projectId.value === project && activeWorkflowId.value === workflowId)
      sessionId.value = session.id
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
  activeWorkflowId.value = workflowId
  agentError.value = ''
  workspaceToTrust.value = ''
  workspaceUrl.value = ''
  if (!projectId.value || !workflowTarget(workflowId)) {
    agentError.value = '请先选择工程及目标实体'
    return
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
function expandSelectedEntity() {
  if (selected.value) expandedEntities.add(selected.value.id)
  projectGraph()
}
async function openPiWeb() {
  const session = currentSession.value
  if (!session || navigationBusy.value) return
  activeWorkflowId.value = session.workflowId
  workflowTargets.value[session.workflowId] = session.targetId
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
      workspaceToTrust.value = prepared.workspace
      workspaceUrl.value = prepared.piWebWorkspaceUrl || ''
      throw new Error(
        '此 Workflow 的 PiWeb 工作区尚未就绪。请在 PiWeb 信任下方精确工作区并重新加载会话，再点击继续。',
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
  if (canvas && graph?.nodes.length) canvas.fitViewToSelectionAnimated()
}
function projectGraph() {
  if (!graph) return
  graph.clear()
  const focus = objectById(focusId.value)
  const mentioned = new Set(
    objects.value
      .filter(
        (o) =>
          o.kind === 'data_relation' &&
          o.fromId === focus?.id &&
          o.type === 'mentions'
      )
      .map((o) => o.toId)
  )
  for (const e of entities.value)
    if (
      (e.sources || []).some(
        (s: { sourceId: string; anchorId: string }) =>
          s.sourceId === focus?.sourceId &&
          focus?.anchorIds?.includes(s.anchorId)
      )
    )
      mentioned.add(e.id)
  const visible = objects.value.filter((o) => {
    if (o.kind === 'chapter')
      return !o.supersededBy && (!focus || o.id === focus.id)
    if (o.kind === 'scene') return !focus || o.chapterId === focus.id
    if (o.kind === 'entity') return !focus || mentioned.has(o.id)
    if (o.kind === 'resource')
      return (
        (!focus || mentioned.has(o.entityId)) &&
        (showAllResources.value ||
          expandedEntities.has(o.entityId) ||
          ['concept', 'threeview'].includes(o.role))
      )
    if (o.kind === 'proposal')
      return (
        o.status === 'pending' &&
        (!focus || o.basis?.some((b: { id: string }) => b.id === focus.id))
      )
    return (
      o.kind === 'source' &&
      !chapters.value.some((c) => c.sourceId === o.id) &&
      !focus
    )
  })
  const category = (o: Obj) =>
    ['source', 'chapter', 'scene'].includes(o.kind)
      ? 0
      : o.kind === 'proposal'
        ? 1
        : o.kind === 'entity'
          ? 2
          : 3
  const columns = [...new Set(visible.map(category))].sort()
  const counters = [0, 0, 0, 0]
  for (const o of visible) {
    const column = ['source', 'chapter', 'scene'].includes(o.kind)
        ? 0
        : o.kind === 'proposal'
          ? 1
          : o.kind === 'entity'
            ? 2
            : 3,
      index = counters[column]++,
      n = new LGraphNode(o.name || kindName(o.kind))
    n.id = toNodeId(o.id)
    n.pos = [columns.indexOf(column) * 380, index * (column === 3 ? 270 : 190)]
    n.size = [320, column === 3 ? 225 : 135]
    n.color =
      o.kind === 'entity'
        ? '#245853'
        : o.kind === 'proposal'
          ? '#665231'
          : '#2a3e52'
    n.bgcolor = '#152431'
    n.addInput('关系', '*')
    n.addOutput('关系', '*')
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
            42,
            image.width * scale,
            image.height * scale
          )
        }
      }
    }
    n.onDrawForeground = (ctx) => {
      ctx.fillStyle = '#9eb4c4'
      ctx.font = '12px system-ui'
      ctx.fillText(
        `${kindName(o.kind)} · ${o.role || kindName(o.type || '')}`,
        14,
        27
      )
      if (!o.assetId) {
        ctx.fillStyle = '#d4e0e6'
        ctx.fillText(
          (o.description || o.brief || o.status || '点击查看').slice(0, 24),
          14,
          67
        )
      }
    }
    graph.add(n)
  }
  const edges = objects.value.filter((o) =>
    ['data_relation', 'relation'].includes(o.kind)
  )
  for (const o of visible) {
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
  canvas.resize(rect.width, rect.height)
}
function saveView() {
  clearTimeout(viewTimer)
  viewTimer = setTimeout(async () => {
    if (!projectId.value) return
    try {
      const result = await studioApi(
        `/projects/${projectId.value}/views/master-v02`,
        {
          expectedRevision: viewRevision,
          requestId: requestId(),
          view: { scale: canvas.ds.scale, offset: Array.from(canvas.ds.offset) }
        },
        'PATCH'
      )
      viewRevision = result.revision
    } catch (e) {
      showError(e)
    }
  }, 600)
}
watch([objects, focusId, showAllResources], projectGraph)
onMounted(async () => {
  document.title = 'Story Studio · Sean'
  graph = new LGraph()
  canvas = new LGraphCanvas(canvasElement.value!, graph)
  canvas.read_only = true
  canvas.show_info = false
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
  canvasElement.value!.addEventListener('click', (event) => {
    const [x, y] = canvas.convertEventToCanvasOffset(event)
    const node = graph.getNodeOnPos(x, y)
    if (node) selectId(String(node.id))
  })
  canvasElement.value!.addEventListener('pointerup', saveView)
  canvasElement.value!.addEventListener('wheel', saveView)
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
  events?.close()
  clearInterval(poll)
  clearTimeout(viewTimer)
  resizeObserver?.disconnect()
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
  grid-template-rows: 70px minmax(0, 1fr);
  background: #101b25;
  color: var(--ink);
  font: 13px/1.6 system-ui;
}
header {
  grid-column: 1/-1;
  display: flex;
  align-items: center;
  gap: 40px;
  padding: 0 25px;
  border-bottom: 1px solid var(--line);
  background: #14222e;
}
.logo strong {
  letter-spacing: 2px;
}
.logo small {
  display: block;
  color: var(--muted);
  font-size: 10px;
}
.version {
  margin-left: auto;
  color: var(--muted);
  font-size: 11px;
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
.canvas-host {
  flex: 1;
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: radial-gradient(#2c3d4d 1px, transparent 1px) 0 0/22px 22px;
}
.canvas-host > canvas {
  display: block;
  width: 100%;
  height: 100%;
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
