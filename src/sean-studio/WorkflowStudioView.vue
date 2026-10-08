<!-- eslint-disable @intlify/vue-i18n/no-raw-text -- Sean v0.2 UI is Chinese. -->
<template>
  <div class="workspace">
    <div class="floating-brand">
      <span class="brand-mark" aria-hidden="true">◈</span>
      <span class="brand-project">创作图谱</span>
      <select
        v-model="projectId"
        :disabled="navigationBusy"
        aria-label="切换创作工程"
        @change="openProject"
      >
        <option value="">选择创作工程</option>
        <option v-for="p in projects" :key="p.id" :value="p.id">
          {{ p.name }}
        </option>
      </select>
      <button type="button" title="新建创作工程" @click="newProject">＋</button>
    </div>
    <main>
      <nav class="canvas-navigation" aria-label="画布导航">
        <div class="navigation-location">
          <div v-if="canvasMode === 'agents'" class="agent-view-heading">
            {{ project?.name || '创作工程' }} / Agent 运行监控
          </div>
          <div v-else class="breadcrumbs" aria-label="当前位置">
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
        <div class="canvas-actions">
          <button
            v-if="canvasMode === 'agents'"
            :disabled="navigationBusy || !projectId"
            @click="syncPiProject"
          >
            {{ navigationBusy ? '同步中…' : '同步 PiWeb' }}
          </button>
          <button @click="toggleCanvasMode">
            {{ canvasMode === 'agents' ? '返回创作图谱' : 'Agent 运行监控' }}
          </button>
          <button
            v-if="canvasMode === 'story'"
            @click="showAllResources = !showAllResources"
          >
            {{ showAllResources ? '收起次要素材' : '展开全部素材' }}
          </button>
          <button @click="fit">适配画布</button>
        </div>
      </nav>
      <div v-if="canvasMode === 'agents' && syncMessage" class="sync-message">
        {{ syncMessage }}
      </div>
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
          v-if="
            canvasMode === 'story' &&
            projectId &&
            objects.length &&
            !visibleObjects.length
          "
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
        <div v-if="!objects.length && canvasMode === 'story'" class="empty">
          <h1>创作图谱</h1>
          <p>从剧本、章节开始，逐步整理实体、提示词与影片资源。</p>
          <button class="primary" @click="openNovelImport">
            导入小说并生成章节
          </button>
        </div>
        <div v-if="canvasMode === 'story' && runs.length" class="run-overlay">
          <span>{{ visibleRunCount }} 个运行节点</span>
          <button @click="showHistory = !showHistory">
            {{ showHistory ? '隐藏已完成' : '显示历史运行' }}
          </button>
        </div>
        <div
          v-if="contextMenu"
          class="node-context-menu"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          role="menu"
          @pointerdown.stop
          @click.stop
          @contextmenu.prevent
        >
          <strong>{{
            contextNode?.name || kindName(contextNode?.kind || '')
          }}</strong>
          <button role="menuitem" @click="inspectContextNode">查看属性</button>
          <template v-if="contextNode?.kind === 'chapter'">
            <button
              role="menuitem"
              @click="launchContextWorkflow('ExtractEntities')"
            >
              启动章节实体提取
            </button>
          </template>
          <template v-else-if="contextNode?.kind === 'source'">
            <button
              role="menuitem"
              @click="launchContextWorkflow('StructureNovel')"
            >
              打开小说结构工作流
            </button>
            <button role="menuitem" @click="structureSource(contextNode)">
              识别并生成章节
            </button>
          </template>
          <template v-else-if="contextNode?.kind === 'entity'">
            <button role="menuitem" @click="inspectContextNode">
              编辑实体信息
            </button>
            <button
              role="menuitem"
              @click="launchContextWorkflow('CreateEntity')"
            >
              开始实体制作流程
            </button>
          </template>
          <template v-else-if="contextNode?.kind === 'proposal_item'">
            <button
              role="menuitem"
              :disabled="
                Boolean(contextNode.resolved) ||
                !candidateCanConfirm(contextNode)
              "
              @click="acceptContextCandidate"
            >
              确认此候选
            </button>
            <button
              role="menuitem"
              :disabled="Boolean(contextNode.resolved)"
              @click="rejectContextCandidate"
            >
              取消此候选
            </button>
            <button role="menuitem" @click="reviseContextCandidate">
              复制修改指令并打开对话
            </button>
          </template>
          <template v-else-if="contextNode?.kind === 'resource'">
            <button
              v-if="contextNode.role === 'concept'"
              role="menuitem"
              @click="confirmConcept(contextNode)"
            >
              确认为正式形象
            </button>
            <button
              role="menuitem"
              @click="launchContextWorkflow('CreateEntity')"
            >
              继续制作
            </button>
          </template>
          <template v-else-if="contextNode?.kind === 'workflow_run'">
            <button
              v-if="contextNode.sessionId"
              role="menuitem"
              @click="openRunSession(contextNode)"
            >
              打开对应 Agent 对话
            </button>
          </template>
          <template v-else-if="contextNode?.kind === 'workflow_conversation'">
            <button role="menuitem" @click="openAgentConversation(contextNode)">
              继续此对话
            </button>
          </template>
          <template v-else-if="contextNode?.kind === 'workflow_agent'">
            <button
              v-if="!contextNode.deprecated"
              role="menuitem"
              @click="launchContextWorkflow(contextNode.workflowId)"
            >
              新建此工作流对话
            </button>
          </template>
        </div>
        <div class="legend">
          <template v-if="canvasMode === 'agents'">
            Studio / Pi 项目包含 Workflow · 每个 Workflow 连接自己的多个对话 ·
            Pi 工作目录在项目属性中查看
          </template>
          <template v-else>
            右键节点启动工作流 · 活动运行显示为节点 · 已完成运行可展开历史
          </template>
        </div>
      </div>
      <section v-if="selected" class="inspector">
        <div class="inspector-head">
          <span>{{ kindName(selected.kind) }} · v{{ selected.revision }}</span
          ><button @click="selected = null">×</button>
        </div>
        <h2>{{ selected.name || kindName(selected.kind) }}</h2>
        <p v-if="selected.kind !== 'entity'">
          {{ selected.description || selected.brief }}
        </p>
        <template v-if="selected.kind === 'agent_project'">
          <p>
            一个影片工程对应一个 Studio / Pi 项目根节点；Pi
            工作目录作为项目属性管理。
          </p>
          <p>
            {{ selected.workflowCount }} 个 Workflow ·
            {{ selected.conversationCount }} 个对话
          </p>
          <h3>Pi 工作目录</h3>
          <p v-if="!selected.workspaces.length">首次创建对话后自动建立。</p>
          <div
            v-for="workspace in selected.workspaces"
            :key="workspace.workspaceId"
          >
            <p>
              <button
                class="workspace-path-link"
                :disabled="
                  navigationBusy ||
                  !hasAgentWorkspaceBinding(workspace.workspaceId)
                "
                @click="openAgentWorkspaceInExplorer(workspace.workspaceId)"
              >
                {{ workspace.workspaceLabel }} ↗
              </button>
              ·
              {{ workspace.status === '待创建' ? '待创建' : '已准备' }}
            </p>
            <button
              :disabled="!hasAgentWorkspaceBinding(workspace.workspaceId)"
              @click="copyAgentWorkspacePath(workspace.workspaceId)"
            >
              复制路径
            </button>
          </div>
        </template>
        <template v-if="selected.kind === 'workflow_agent'">
          <p>
            {{ selected.workflowId }} ·
            {{ selected.target === 'entity' ? '实体级工作流' : '工程级工作流' }}
          </p>
          <p>{{ selected.sessionCount }} 个独立对话</p>
          <h3>最近运行</h3>
          <button
            v-for="run in workflowRuns(selected.workflowId)"
            :key="run.id"
            class="workflow-run-entry"
            @click="selectId(run.id)"
          >
            {{ run.name }} · {{ statusName(effectiveRunStatus(run)) }} ·
            {{ formatAgentTime(run.createdAt) }}
          </button>
          <p v-if="!workflowRuns(selected.workflowId).length">暂无运行记录</p>
          <template v-if="selected.workflowId === 'StructureNovel'">
            <h3>小说导入与分章</h3>
            <button
              class="primary"
              :disabled="!projectId"
              @click="openNovelImport"
            >
              ＋ 导入并分章
            </button>
            <p v-if="!sourceObjects.length">
              尚无原文。导入后自动识别章节标题。
            </p>
            <div v-for="source in sourceObjects" :key="source.id">
              <p>
                {{ source.name }} · {{ sourceChapterCount(source.id) }} 个章节
              </p>
              <button
                v-if="sourceChapterCount(source.id) === 0"
                @click="structureSource(source)"
              >
                按标题识别章节
              </button>
              <small v-else>可新建对话，让 Agent 检查并调整分章</small>
            </div>
          </template>
          <div v-for="workspaceId in selected.workspaceIds" :key="workspaceId">
            <p>
              运行目录：
              <button
                class="workspace-path-link"
                :disabled="
                  navigationBusy || !hasAgentWorkspaceBinding(workspaceId)
                "
                @click="openAgentWorkspaceInExplorer(workspaceId)"
              >
                {{ agentWorkspaceLabel(workspaceId) }} ↗
              </button>
            </p>
            <button
              :disabled="!hasAgentWorkspaceBinding(workspaceId)"
              @click="copyAgentWorkspacePath(workspaceId)"
            >
              复制路径
            </button>
          </div>
          <p v-if="!selected.workspaceIds.length">运行目录：尚未关联工作区</p>
          <label v-if="selected.target === 'entity' && !selected.deprecated"
            >目标实体
            <select v-model="workflowTargets[selected.workflowId]">
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
          <button
            v-if="!selected.deprecated"
            :disabled="navigationBusy"
            @click="createWorkflowConversation(selected.workflowId)"
          >
            新建对话 ＋
          </button>
        </template>
        <template v-if="selected.kind === 'workflow_conversation'">
          <p>目标：{{ objectById(selected.targetId)?.name || '影片工程' }}</p>
          <p>工作区：{{ agentWorkspaceLabel(selected.workspaceId) }}</p>
          <p>
            PiWeb 会话：{{
              selected.sessionName || selected.nativeSessionId || '尚未绑定'
            }}
          </p>
          <p>
            状态：{{ statusName(selected.status) }} ·
            {{ selected.verified ? 'PiWeb 已验证' : 'PiWeb 尚未验证' }}
          </p>
          <p>
            消息 {{ selected.messageCount ?? '待同步' }} 条 · 用户轮次
            {{ selected.turnCount ?? '待同步' }} 轮
          </p>
          <p>
            创建：{{ formatAgentTime(selected.createdAt) }}<br />更新：{{
              formatAgentTime(selected.modifiedAt)
            }}
          </p>
          <p v-if="selected.goal">目标：{{ selected.goal }}</p>
          <p v-if="selected.firstMessage">开场：{{ selected.firstMessage }}</p>
          <pre v-if="selected.summary" class="agent-node-summary">{{
            selected.summary
          }}</pre>
          <button
            :disabled="navigationBusy || selected.status === 'session_missing'"
            @click="openAgentConversation(selected)"
          >
            {{
              selected.status === 'session_missing'
                ? 'PiWeb 对话缺失，先从 Workflow 新建'
                : !selected.nativeSessionId
                  ? '创建 PiWeb 对话'
                  : selected.verified ||
                      trustEntryOpenedFor === selected.workflowId
                    ? '打开此 PiWeb 对话'
                    : '打开工作区并信任'
            }}
            ↗
          </button>
          <button
            class="danger"
            :disabled="navigationBusy"
            @click="removeWorkflowConversation(selected)"
          >
            从 Studio 移除此对话
          </button>
        </template>
        <p
          v-if="
            agentError &&
            [
              'agent_project',
              'workflow_agent',
              'workflow_conversation'
            ].includes(selected.kind)
          "
          class="error"
        >
          {{ agentError }}
        </p>
        <template v-if="selected.kind === 'chapter'"
          ><p>
            原文 {{ selected.sourceId }} · {{ selected.anchorIds?.join(' · ') }}
          </p>
          <pre>{{ chapterText(selected) }}</pre>
        </template>
        <template v-if="selected.kind === 'source'">
          <p>
            原文来源 · {{ selected.anchors?.length }} 段。章节识别与调整请在
            “小说导入与分章”工作流中操作。
          </p>
        </template>
        <template v-if="selected.kind === 'entity'">
          <label>实体名称<input v-model="entityName" /></label>
          <label>实体描述<textarea v-model="entityDescription" /></label>
          <button class="primary" @click="saveEntityDetails">
            保存实体信息
          </button>
          <h3>出现章节</h3>
          <button
            v-for="chapter in entityChapters(selected)"
            :key="chapter.id"
            @click="selectId(chapter.id)"
          >
            {{ chapter.name }} ↗
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
          <p>正式形象：{{ selected.appearanceAssetId || '尚未确认' }}</p>
        </template>
        <template v-if="selected.kind === 'proposal_item'">
          <p>
            候选来自
            {{
              selected.chapterName || '未关联章节'
            }}。逐项确认后才会成为正式实体。
          </p>
          <button
            v-if="selected.chapterId"
            @click="selectId(selected.chapterId)"
          >
            查看来源章节 ↗
          </button>
          <p>{{ selected.item?.kind }} · {{ selected.item?.type }}</p>
          <p>{{ selected.item?.description }}</p>
          <p v-if="!candidateCanConfirm(selected)" class="error">
            {{ candidateBlockReason(selected) }}
          </p>
          <small v-for="source in selected.item?.sources" :key="source.anchorId"
            >{{ source.anchorId }} · 来源 v{{ source.revision }}</small
          >
          <p v-if="selected.resolved">
            {{ selected.resolved.status === 'rejected' ? '已取消' : '已确认' }}
          </p>
          <template v-else>
            <button
              class="primary"
              :disabled="!candidateCanConfirm(selected)"
              @click="confirmCandidate(selected)"
            >
              确认此候选
            </button>
            <button class="danger" @click="rejectCandidate(selected)">
              取消此候选
            </button>
            <button @click="reviseCandidate(selected)">
              复制修改指令并打开对应对话
            </button>
          </template>
          <button
            v-if="selected.discussionId"
            @click="openCandidateConversation(selected)"
          >
            打开来源对话 ↗
          </button>
        </template>
        <template v-if="selected.kind === 'resource'">
          <audio
            v-if="selected.type === 'audio' && selected.assetId"
            :src="contentUrl(selected.assetId)"
            controls
            preload="none"
            class="resource-audio"
          />
          <img
            v-else-if="selected.assetId"
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
            v-if="selected.role === 'voice_candidate'"
            class="primary"
            @click="confirmVoice(selected)"
          >
            选为当前人物声音
          </button>
          <button
            v-if="selected.workflowRunId"
            @click="selectId(selected!.workflowRunId)"
          >
            查看来源 Run</button
          ><button @click="enterResourceSession(selected)">
            继续对应 PiWeb ↗
          </button>
        </template>
        <template v-if="selected.kind === 'workflow_run'"
          ><p>{{ statusName(effectiveRunStatus(selected)) }}</p>
          <button v-if="selected.sessionId" @click="openRunSession(selected)">
            打开对应 PiWeb ↗</button
          ><button
            v-if="selected.childRunIds?.length && selected.stage !== 'voice'"
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
type AgentWorkspace = Obj & {
  workspaceId: string
  workspaceLabel: string
  status: string
  workflowIds: string[]
  conversationIds: string[]
}
const projects = ref<Obj[]>([]),
  objects = ref<Obj[]>([]),
  project = ref<Obj>(),
  projectId = ref(
    readRoute(location.hash)?.projectId ||
      localStorage.getItem('sean-studio-project') ||
      ''
  ),
  selected = ref<Obj | null>(null)
const definitions = ref<Obj[]>([]),
  canvasMode = ref<'story' | 'agents'>(
    localStorage.getItem('sean-studio-canvas-mode') === 'agents'
      ? 'agents'
      : 'story'
  ),
  sessionId = ref(''),
  navigationPath = ref<string[]>([]),
  showAllResources = ref(false),
  showHistory = ref(false)
type AgentStatus = {
  working: boolean
  summary: string
  piWebUrl: string | null
  verified?: boolean
  sessionFound?: boolean
  messageCount?: number | null
  turnCount?: number | null
  createdAt?: string | null
  modifiedAt?: string | null
  firstMessage?: string
  sessionName?: string
  workspaceId?: string
  workspaceLabel?: string
}
const agentStates = ref<Record<string, AgentStatus>>({})
const activeWorkflowId = ref(''),
  workflowTargets = ref<Record<string, string>>({}),
  workflowContexts = ref<Record<string, string>>({}),
  navigationBusy = ref(false),
  workspaceUrl = ref(''),
  trustEntryOpenedFor = ref('')
const agentError = ref(''),
  syncMessage = ref(''),
  workspaceToTrust = ref(''),
  error = ref('')
const importing = ref(false),
  novelName = ref(''),
  novelText = ref(''),
  referenceText = ref(''),
  entityName = ref(''),
  entityDescription = ref('')
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
const contextMenu = ref<{ x: number; y: number; nodeId: string } | null>(null)
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
  sourceObjects = computed(() =>
    objects.value.filter((o) => o.kind === 'source')
  ),
  sessions = computed(() =>
    objects.value.filter((o) => o.kind === 'workflow_session')
  ),
  currentSession = computed(() =>
    sessions.value.find((s) => s.id === sessionId.value)
  ),
  runs = computed(() => objects.value.filter((o) => o.kind === 'workflow_run'))
const pendingProposalItems = computed(() =>
  visibleObjects.value
    .filter(
      (proposal) =>
        proposal.kind === 'proposal' && proposal.status === 'pending'
    )
    .flatMap((proposal) => {
      const chapterId = proposal.basis?.find(
        (ref: Obj) => ref.kind === 'chapter'
      )?.id
      const chapter =
        objects.value.find((o) => o.id === chapterId) ||
        objects.value.find(
          (o) =>
            o.kind === 'chapter' &&
            proposal.items?.some((item: Obj) =>
              item.sources?.some(
                (source: Obj) =>
                  source.sourceId === o.sourceId &&
                  o.anchorIds?.includes(source.anchorId)
              )
            )
        )
      return (proposal.items || [])
        .filter((item: Obj) => !proposal.resolved?.[item.key])
        .map((item: Obj) => ({
          id: `proposal-item:${proposal.id}:${encodeURIComponent(item.key)}`,
          kind: 'proposal_item',
          revision: proposal.revision,
          name: item.name || item.description || item.key,
          proposalId: proposal.id,
          key: item.key,
          item,
          discussionId: proposal.discussionId,
          workflowRunId: proposal.workflowRunId,
          chapterId: chapter?.id || '',
          chapterName: chapter?.name || '',
          preview: item.description || item.name || item.key
        }))
    })
)
const visibleWorkflowRuns = computed(() => {
  const ids = new Set(visibleObjects.value.map((o) => o.id))
  const scope = objects.value.find((o) => o.id === focusId.value)
  return runs.value.filter((run) => {
    if (!showHistory.value && !activeRun(run)) return false
    if (scope?.kind === 'workflow_run') return false
    return (
      !focusId.value ||
      run.targetId === focusId.value ||
      (run.inputs || []).some((input: Obj) => ids.has(input.id)) ||
      (run.outputs || []).includes(focusId.value)
    )
  })
})
const visibleRunCount = computed(() => visibleWorkflowRuns.value.length)
const canvasObjects = computed(() => [
  ...visibleObjects.value
    .filter((o) => o.kind !== 'proposal')
    .map((object) => {
      const activity = sessions.value.findLast((session) => {
        if (session.closed) return false
        if (session.contextId !== object.id && session.targetId !== object.id)
          return false
        return agentStates.value[session.id]?.working
      })
      if (!activity) return object
      const definition = definitions.value.find(
        (item) => item.id === activity.workflowId
      )
      const outputs: Record<string, string> = {
        StructureNovel: '章节结构',
        ExtractEntities: '实体候选',
        CreateEntity: '实体制作资源',
        GenerateThreeView: '三视图资源'
      }
      return {
        ...object,
        agentActivity: `${definition?.name || activity.workflowId} · 正在工作 · 输出：${outputs[activity.workflowId] || '创作数据'}`
      }
    }),
  ...pendingProposalItems.value,
  ...visibleWorkflowRuns.value.map((run) => {
    const session = sessions.value.find((item) => item.id === run.sessionId)
    const state = session && agentStates.value[session.id]
    const outputTypes: Record<string, string> = {
      StructureNovel: '章节',
      ExtractEntities: '实体候选',
      CreateEntity: '实体制作',
      GenerateThreeView: '三视图'
    }
    return {
      ...run,
      displayStatus: effectiveRunStatus(run),
      workflowName:
        definitions.value.find((definition) => definition.id === run.workflowId)
          ?.name || run.name,
      agentWorking: Boolean(state?.working),
      preview: `${state?.working ? 'Agent 工作中' : statusName(effectiveRunStatus(run))} · ${runOutputSummary(run, outputTypes[run.workflowId] || '资源')}`
    }
  })
])
const contextNode = computed(() =>
  contextMenu.value ? objectById(contextMenu.value.nodeId) : null
)
watch(selected, (object) => {
  entityName.value = object?.kind === 'entity' ? object.name || '' : ''
  entityDescription.value =
    object?.kind === 'entity' ? object.description || '' : ''
})
const agentGraphNodes = computed<Obj[]>(() => {
  if (!project.value) return []
  const projectNodeId = `agent-project:${project.value.id}`
  const bindings = objects.value.filter((o) => o.kind === 'pi_binding')
  const workspaceMap = new Map<string, AgentWorkspace>()
  for (const binding of bindings) {
    const id = binding.workspaceId || `project:${project.value.id}`
    if (!workspaceMap.has(id))
      workspaceMap.set(id, {
        id: `agent-workspace:${id}`,
        kind: 'agent_workspace',
        revision: 1,
        name: binding.workspaceLabel || 'Agent Workspace',
        workspaceId: id,
        workspaceLabel: binding.workspaceLabel || 'Agent Workspace',
        status: 'ready',
        workflowIds: [],
        conversationIds: []
      })
  }
  if (!workspaceMap.size) {
    const id = `pending:${project.value.id}`
    workspaceMap.set(id, {
      id: `agent-workspace:${id}`,
      kind: 'agent_workspace',
      revision: 1,
      name: 'Agent Workspace',
      workspaceId: id,
      workspaceLabel: '首次启动 Workflow 时创建',
      status: '待创建',
      workflowIds: [],
      conversationIds: []
    })
  }
  const workspaceById = new Map(
    [...workspaceMap.values()].map((node) => [node.workspaceId, node])
  )
  // Studio records express intent; a conversation node exists only while the
  // exact PiWeb native session is present and its workspace binding is verified.
  const graphSessions = sessions.value.filter(
    (session) =>
      !session.closed &&
      Boolean(
        objects.value.find(
          (binding) =>
            binding.kind === 'pi_binding' &&
            binding.discussionId === session.discussionId &&
            binding.sessionId
        ) && agentStates.value[session.id]?.sessionFound === true
      )
  )
  const workflowNodes = definitions.value.map((definition) => {
    const related = graphSessions.filter(
      (session) => session.workflowId === definition.id
    )
    const relatedRuns = runs.value.filter(
      (run) => run.workflowId === definition.id
    )
    const activeRuns = relatedRuns.filter(activeRun)
    const workspaceIds = new Set<string>()
    for (const session of related) {
      const binding = bindings.find(
        (item) => item.discussionId === session.discussionId
      )
      if (binding?.workspaceId) workspaceIds.add(binding.workspaceId)
    }
    for (const workspaceId of workspaceIds) {
      const workspace = workspaceById.get(workspaceId)
      if (workspace && !workspace.workflowIds.includes(definition.id))
        workspace.workflowIds.push(definition.id)
    }
    return {
      id: `agent-workflow:${definition.id}`,
      kind: 'workflow_agent',
      revision: 1,
      name: definition.name,
      workflowId: definition.id,
      deprecated: definition.deprecated === true,
      target: definition.target,
      sessionCount: related.length,
      conversationIds: related.map(
        (session) => `agent-conversation:${session.id}`
      ),
      workspaceIds: [...workspaceIds],
      status: related.length ? '已建立对话' : '未开始',
      preview: `${related.length} 个对话 · ${activeRuns.length} 个运行中/待确认 · ${related.filter((session) => agentStates.value[session.id]?.working).length} 个 Agent 工作中`
    }
  })
  const conversationNodes = graphSessions.map((session) => {
    const binding = bindings.find(
      (item) => item.discussionId === session.discussionId
    )
    const state = agentStates.value[session.id]
    const workspaceId = binding?.workspaceId || ''
    const workspace = workspaceById.get(workspaceId)
    if (workspace && !workspace.conversationIds.includes(session.id))
      workspace.conversationIds.push(session.id)
    const target = objects.value.find((item) => item.id === session.targetId)
    const definition = definitions.value.find(
      (item) => item.id === session.workflowId
    )
    const status =
      state?.sessionFound === false || binding?.status === 'session_missing'
        ? 'session_missing'
        : !binding?.sessionId
          ? 'pi_unbound'
          : state?.working
            ? 'working'
            : binding.status === 'guard_unverified'
              ? 'guard_unverified'
              : effectiveSessionStatus(session) || 'ready'
    return {
      id: `agent-conversation:${session.id}`,
      kind: 'workflow_conversation',
      revision: session.revision,
      name:
        state?.sessionName ||
        session.name ||
        `${definition?.name || session.workflowId} · ${target?.name || '工程'}`,
      workflowId: session.workflowId,
      workflowSessionId: session.id,
      discussionId: session.discussionId,
      targetId: session.targetId,
      nativeSessionId: binding?.sessionId || '',
      sessionName: state?.sessionName || '',
      workspaceId,
      goal: session.goal,
      status,
      messageCount: state?.messageCount ?? null,
      turnCount: state?.turnCount ?? null,
      createdAt: state?.createdAt || session.createdAt || null,
      modifiedAt: state?.modifiedAt || null,
      firstMessage: state?.firstMessage || '',
      summary: state?.summary || '',
      verified: binding?.guardVersion === 1 && binding?.status === 'bound',
      sessionRecord: session,
      preview: [
        statusName(status),
        state?.sessionName || session.name || '',
        session.goal || state?.firstMessage || '',
        state?.messageCount == null
          ? '消息数待同步'
          : `${state.messageCount} 条消息`,
        state?.modifiedAt ? `更新 ${formatAgentTime(state.modifiedAt)}` : ''
      ]
        .filter(Boolean)
        .join(' · ')
    }
  })
  const workspaceNodes = [...workspaceMap.values()].map((workspace) => ({
    ...workspace,
    preview: `${workspace.workflowIds.length} 个 Workflow · ${workspace.conversationIds.length} 个对话`
  }))
  return [
    {
      id: projectNodeId,
      kind: 'agent_project',
      revision: project.value.revision || 1,
      name: project.value.name,
      workflowCount: workflowNodes.length,
      workspaceCount: workspaceNodes.length,
      conversationCount: conversationNodes.length,
      workspaces: workspaceNodes.map((workspace) => ({
        workspaceId: workspace.workspaceId,
        workspaceLabel: workspace.workspaceLabel,
        status: workspace.status
      })),
      workflowNodeIds: workflowNodes.map((node) => node.id),
      preview: `${workflowNodes.length} 个 Workflow · ${conversationNodes.length} 个对话 · ${workspaceNodes.length} 个 Pi 工作目录`
    },
    ...workflowNodes,
    ...conversationNodes
  ]
})
function proposalForRun(run: Obj) {
  const proposalId = (run.outputs || []).find((id: string) =>
    objects.value.some(
      (object) => object.id === id && object.kind === 'proposal'
    )
  )
  return objects.value.find((object) => object.id === proposalId)
}
function effectiveRunStatus(run: Obj) {
  const proposal = proposalForRun(run)
  if (run.status === 'waiting_confirmation' && proposal?.status === 'rejected')
    return 'cancelled'
  if (
    run.status === 'waiting_confirmation' &&
    ['adopted', 'resolved'].includes(proposal?.status)
  )
    return 'succeeded'
  return run.status
}
function effectiveSessionStatus(session: Obj) {
  if (session.status !== 'waiting_confirmation') return session.status
  const relatedRuns = runs.value.filter((run) => run.sessionId === session.id)
  return relatedRuns.length && relatedRuns.every((run) => !activeRun(run))
    ? 'ready'
    : session.status
}
function runOutputSummary(run: Obj, outputType: string) {
  if (run.workflowId === 'ExtractEntities') {
    const proposal = proposalForRun(run)
    if (!proposal) return '实体候选处理中'
    const items = proposal.items || []
    const adopted = items.filter(
      (item: Obj) =>
        proposal.resolved?.[item.key]?.status === 'adopted' ||
        proposal.resolved?.[item.key]?.objectId
    ).length
    const rejected =
      proposal.status === 'rejected'
        ? items.length - adopted
        : items.filter(
            (item: Obj) => proposal.resolved?.[item.key]?.status === 'rejected'
          ).length
    const pending =
      proposal.status === 'pending'
        ? items.filter((item: Obj) => !proposal.resolved?.[item.key]).length
        : 0
    return `候选：待确认 ${pending} · 已确认 ${adopted} · 已取消 ${rejected}`
  }
  const outputCount = (run.outputs || []).reduce(
    (count: number, id: string) => {
      const proposal = objects.value.find(
        (item) => item.id === id && item.kind === 'proposal'
      )
      return count + (proposal ? proposal.items?.length || 0 : 1)
    },
    0
  )
  const stageType =
    run.stage === 'voice'
      ? '人物声音样音'
      : run.stage === 'threeview'
        ? '三视图资源'
        : outputType
  return `输出 ${stageType} ${outputCount} 项`
}
const activeRun = (run: Obj) =>
  !['succeeded', 'failed', 'cancelled'].includes(effectiveRunStatus(run))
const objectById = (id: string) =>
  objects.value.find((o) => o.id === id) ||
  pendingProposalItems.value.find((o) => o.id === id) ||
  agentGraphNodes.value.find((o) => o.id === id)
const contentUrl = (id: string) => `/studio-api/v1/assets/${id}/content`
const names: Record<string, string> = {
  agent_project: 'Studio / Pi 项目',
  workflow_agent: 'Workflow Agent',
  workflow_conversation: 'Agent 对话',
  proposal_item: '待确认候选',
  execution_relation: '运行来源',
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
  bound: '已连接',
  guard_unverified: '等待 PiWeb 验证',
  session_missing: 'PiWeb 对话缺失',
  pi_unbound: 'PiWeb 对话未创建',
  creation_unknown: '创建待核对',
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
const workflowRuns = (workflowId: string) =>
  runs.value
    .filter((run) => run.workflowId === workflowId)
    .slice(-6)
    .reverse()
const formatAgentTime = (value?: string | null) => {
  if (!value) return '未记录'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '未记录'
    : new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date)
}
function agentWorkspaceLabel(workspaceId?: string) {
  return (
    agentGraphNodes.value
      .find((node) => node.kind === 'agent_project')
      ?.workspaces?.find((item: Obj) => item.workspaceId === workspaceId)
      ?.workspaceLabel || '尚未关联工作区'
  )
}
function hasAgentWorkspaceBinding(workspaceId?: string) {
  return objects.value.some(
    (item) => item.kind === 'pi_binding' && item.workspaceId === workspaceId
  )
}
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
async function syncPiProject() {
  if (!projectId.value || navigationBusy.value) return
  navigationBusy.value = true
  agentError.value = ''
  syncMessage.value = ''
  try {
    const result = await studioApi(`/projects/${projectId.value}/pi-sync`, {
      requestId: requestId()
    })
    await refresh()
    await refreshAgent()
    syncMessage.value =
      `PiWeb 同步完成：${result.foundBindings} 个对话有效，` +
      `${result.resetEmpty} 个空会话可重新创建，` +
      `${result.missingWithHistory} 个有历史的会话缺失，` +
      `${result.uncertainCreation} 个创建状态待核对。`
    if (result.unboundWorkspaceSessions)
      syncMessage.value += `另有 ${result.unboundWorkspaceSessions} 个 PiWeb 会话未绑定到 Studio Workflow。`
  } catch (e) {
    syncMessage.value = `PiWeb 同步失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    navigationBusy.value = false
  }
}
async function openProject() {
  events?.close()
  project.value = undefined
  objects.value = []
  selected.value = null
  syncMessage.value = ''
  navigationPath.value = []
  sessionId.value = ''
  agentStates.value = {}
  if (!projectId.value) return
  localStorage.setItem('sean-studio-project', projectId.value)
  try {
    await refresh()
    activeWorkflowId.value = ''
    workflowTargets.value = {}
    workflowContexts.value = {}
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
  const name = window.prompt('创作工程名称')
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
  if (canvasMode.value === 'agents')
    return `sean-agent-canvas-view:${projectId.value}`
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
  agentError.value = ''
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
function toggleCanvasMode() {
  switchCanvasMode(canvasMode.value === 'story' ? 'agents' : 'story')
}
function openNovelImport() {
  if (!projectId.value) {
    agentError.value = '请先选择影片工程。'
    return
  }
  novelName.value = ''
  novelText.value = ''
  importing.value = true
}
function switchCanvasMode(mode: 'story' | 'agents') {
  canvasMode.value = mode
  localStorage.setItem('sean-studio-canvas-mode', mode)
  selected.value = null
  void nextTick(() => {
    projectGraph()
    fit()
    rememberView()
  })
}
function selectId(id: string) {
  const o = objectById(id)
  if (o) select(o)
}
function inspectContextNode() {
  if (contextNode.value) select(contextNode.value)
  contextMenu.value = null
}
async function launchContextWorkflow(workflowId: string) {
  const node = contextNode.value
  contextMenu.value = null
  if (!node) return
  const definition = definitions.value.find((item) => item.id === workflowId)
  const contextId = node.kind.startsWith('workflow_')
    ? undefined
    : node.kind === 'resource'
      ? node.entityId || node.id
      : node.id
  const entityId =
    node.kind === 'entity'
      ? node.id
      : node.kind === 'resource'
        ? node.entityId
        : undefined
  if (definition?.target === 'entity' && !entityId) {
    selected.value = node
    agentError.value = '请先在属性面板选择目标实体，再创建对话。'
    return
  }
  workflowContexts.value[workflowId] = contextId || ''
  if (definition?.target === 'entity' && entityId)
    workflowTargets.value[workflowId] = entityId
  if (workflowId === 'CreateEntity') {
    try {
      const session = await prepareWorkflow(workflowId, contextId)
      await studioApi(`/workflow-sessions/${session.id}/authorize`, {
        confirmed: true,
        conceptCount: 2,
        threeView: true,
        voice: objectById(entityId!)?.type === 'character',
        requestId: requestId()
      })
    } catch (e) {
      showError(e)
      return
    }
  }
  await enterWorkflow(workflowId, entityId, contextId)
}
async function acceptContextCandidate() {
  const candidate = contextNode.value
  contextMenu.value = null
  if (candidate?.kind === 'proposal_item') await confirmCandidate(candidate)
}
async function rejectContextCandidate() {
  const candidate = contextNode.value
  contextMenu.value = null
  if (candidate?.kind === 'proposal_item') await rejectCandidate(candidate)
}
async function reviseContextCandidate() {
  const candidate = contextNode.value
  contextMenu.value = null
  if (candidate?.kind === 'proposal_item') await reviseCandidate(candidate)
}
async function openCandidateConversation(candidate: Obj) {
  const session = sessions.value.find(
    (item) => item.discussionId === candidate.discussionId && !item.closed
  )
  if (!session) {
    showError(new Error('找不到产生此候选的 Agent 对话。'))
    return
  }
  await openAgentConversation({
    id: `agent-conversation:${session.id}`,
    kind: 'workflow_conversation',
    revision: session.revision,
    workflowSessionId: session.id
  })
}
async function reviseCandidate(candidate: Obj) {
  const item = candidate.item || {}
  const instruction = [
    `请只修改候选「${candidate.name}」（key: ${candidate.key}），不要重做其他候选。`,
    `来源章节：${candidate.chapterName || '未关联章节'}。`,
    `当前描述：${item.description || '（空）'}`,
    `当前来源锚点：${(item.sources || []).map((source: Obj) => source.anchorId).join('、') || '无'}`,
    '请在 PiWeb 中围绕这个候选继续讨论；收到我的修改要求后，提交修订候选供我重新审核，不要直接改动正式实体。保留可验证的来源锚点。'
  ].join('\n')
  const opening = openCandidateConversation(candidate)
  try {
    await navigator.clipboard.writeText(instruction)
  } catch (e) {
    await opening
    showError(e)
    return
  }
  await opening
  syncMessage.value =
    '已复制该候选的修改指令，请在 PiWeb 对话中粘贴并补充要求。'
}
function candidateCanConfirm(candidate: Obj) {
  const item = candidate.item || {}
  if (item.kind === 'image_input') return false
  if (!['relation', 'entity_use'].includes(item.kind)) return true
  const proposal = objects.value.find(
    (object) => object.id === candidate.proposalId
  )
  const resolve = (key: string) => proposal?.resolved?.[key]?.objectId || key
  const endpointIds =
    item.kind === 'relation' ? [item.from, item.to] : [item.entityId]
  return endpointIds.every((id: string) =>
    objects.value.some(
      (object) => object.id === resolve(id) && object.kind === 'entity'
    )
  )
}
function candidateBlockReason(candidate: Obj) {
  if (candidate.item?.kind === 'image_input')
    return '图片输入的采用操作尚未接通。'
  if (['relation', 'entity_use'].includes(candidate.item?.kind))
    return '请先确认这条关系所引用的人物或实体。'
  return ''
}
function selectOutput(id: string) {
  const persisted = objectById(id)
  const o =
    resources.value.find((r) => r.assetId === id) ||
    (persisted?.kind === 'proposal'
      ? pendingProposalItems.value.find((item) => item.proposalId === id)
      : persisted)
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
function sourceChapterCount(sourceId: string) {
  return objects.value.filter(
    (object) =>
      object.kind === 'chapter' &&
      object.sourceId === sourceId &&
      !object.supersededBy
  ).length
}
function entityChapters(entity: Obj) {
  const linked = new Set(
    objects.value
      .filter(
        (object) =>
          object.kind === 'data_relation' &&
          object.type === 'mentions' &&
          object.toId === entity.id
      )
      .map((relation) => relation.fromId)
  )
  return objects.value.filter(
    (chapter) =>
      chapter.kind === 'chapter' &&
      !chapter.supersededBy &&
      (linked.has(chapter.id) ||
        (entity.sources || []).some(
          (source: Obj) =>
            source.sourceId === chapter.sourceId &&
            chapter.anchorIds?.includes(source.anchorId)
        ))
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
  contextMenu.value = null
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
  const contextId = workflowContexts.value[workflowId] || null
  return sessions.value.findLast(
    (s) =>
      s.workflowId === workflowId &&
      s.targetId === workflowTarget(workflowId) &&
      (s.contextId || null) === contextId &&
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
async function prepareWorkflow(workflowId: string, contextId?: string) {
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
    contextId: contextId || workflowContexts.value[workflowId] || null,
    requestId: requestId()
  })) as Obj
}
async function createWorkflowConversation(workflowId: string) {
  try {
    const definition = definitions.value.find((item) => item.id === workflowId)
    const targetId = workflowTarget(workflowId)
    if (definition?.target === 'entity' && !targetId)
      throw new Error('请先选择目标实体')
    const session = await studioApi(
      `/projects/${projectId.value}/workflow-sessions`,
      {
        workflowId,
        targetId,
        contextId: workflowContexts.value[workflowId] || null,
        newInstance: true,
        requestId: requestId()
      }
    )
    if (workflowId === 'CreateEntity') {
      const target = objectById(targetId)
      await studioApi(`/workflow-sessions/${session.id}/authorize`, {
        confirmed: true,
        conceptCount: 2,
        threeView: true,
        voice: target?.type === 'character',
        requestId: requestId()
      })
    }
    await refresh()
    activeWorkflowId.value = workflowId
    sessionId.value = session.id
    if (definition?.target === 'entity')
      workflowTargets.value[workflowId] = targetId
    agentError.value = '已创建独立对话。'
    await openPiWeb()
  } catch (e) {
    agentError.value = e instanceof Error ? e.message : String(e)
  }
}
async function enterWorkflow(
  workflowId: string,
  entityId?: string,
  contextId?: string
) {
  if (navigationBusy.value) return
  if (entityId) workflowTargets.value[workflowId] = entityId
  workflowContexts.value[workflowId] = contextId || ''
  const canContinueAfterTrust =
    workspaceTrustPending(workflowId) &&
    trustEntryOpenedFor.value === workflowId
  activeWorkflowId.value = workflowId
  agentError.value = ''
  if (!workspaceTrustPending(workflowId)) {
    workspaceToTrust.value = ''
    workspaceUrl.value = ''
    trustEntryOpenedFor.value = ''
  }
  if (!projectId.value || !workflowTarget(workflowId)) {
    agentError.value = '请先选择工程及目标实体'
    return
  }
  if (workspaceTrustPending(workflowId) && !canContinueAfterTrust) {
    const tab = window.open('about:blank', '_blank')
    if (!tab) {
      agentError.value = '浏览器拦截了新标签页，请允许 Studio 打开 PiWeb。'
      return
    }
    tab.opener = null
    navigationBusy.value = true
    try {
      const session = workflowSession(workflowId)
      if (!session) throw new Error('Workflow 会话已变化，请重新选择后再试。')
      const prepared = await studioApi(
        `/discussions/${session.discussionId}/workspace`,
        { requestId: requestId() }
      )
      if (activeWorkflowId.value !== workflowId)
        throw new Error('当前 Workflow 已切换。')
      workspaceToTrust.value = workflowWorkspaceLabel(workflowId)
      workspaceUrl.value = prepared.piWebWorkspaceUrl || ''
      if (!workspaceUrl.value) throw new Error('无法生成 PiWeb 工作区入口。')
      tab.location.href = workspaceUrl.value
      trustEntryOpenedFor.value = workflowId
      agentError.value = '请在 PiWeb 中手动信任该工作区，然后返回此处继续。'
    } catch (e) {
      tab.close()
      agentError.value = e instanceof Error ? e.message : String(e)
    } finally {
      navigationBusy.value = false
    }
    return
  }
  if (canContinueAfterTrust) {
    const tab = window.open('about:blank', '_blank')
    if (!tab) {
      agentError.value = '浏览器拦截了新标签页，请允许 Studio 打开 PiWeb。'
      return
    }
    tab.opener = null
    navigationBusy.value = true
    try {
      const session = workflowSession(workflowId)
      if (!session) throw new Error('Workflow 会话已变化，请重新选择后再试。')
      await navigatePiWeb(session, tab)
      agentError.value = '工作区已验证，已打开当前 Workflow 的 PiWeb 会话。'
    } catch (e) {
      if (!(e instanceof Error && e.message.startsWith('PiWeb 工作区已打开'))) {
        tab.close()
      }
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
    const session = await prepareWorkflow(workflowId, contextId)
    await refresh()
    sessionId.value = session.id
    await navigatePiWeb(session, tab)
  } catch (e) {
    if (!(e instanceof Error && e.message.startsWith('PiWeb 工作区已打开'))) {
      tab?.close()
    }
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
  trustEntryOpenedFor.value = ''
  agentError.value = workspaceUrl.value
    ? '请按上方说明完成信任，再继续打开此 Workflow 的 PiWeb 对话。'
    : '无法生成工作区信任入口，请稍后重试。'
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
      const exactSession =
        sessions.value.find((item) => item.id === session.id) || latestSession
      if (
        exactSession &&
        workspaceTrustPending(session.workflowId) &&
        !canContinueAfterTrust
      ) {
        await showWorkspaceTrustEntry(session.workflowId, exactSession)
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
    if (!(e instanceof Error && e.message.startsWith('PiWeb 工作区已打开'))) {
      tab?.close()
    }
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
      await refresh()
      workspaceToTrust.value = workflowWorkspaceLabel(session.workflowId)
      workspaceUrl.value = prepared.piWebWorkspaceUrl || ''
      trustEntryOpenedFor.value = ''
      if (tab && prepared.piWebWorkspaceUrl) {
        tab.location.href = prepared.piWebWorkspaceUrl
        trustEntryOpenedFor.value = session.workflowId
      }
      throw new Error(
        'PiWeb 工作区已打开。请在 PiWeb 中手动信任工作区，然后返回此处继续。',
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
  trustEntryOpenedFor.value = ''
  if (tab) {
    tab.opener = null
    tab.location.href = binding.piWebUrl
  } else window.location.assign(binding.piWebUrl)
  await refreshAgent()
}
async function refreshAgent() {
  const chosen = sessions.value.filter(
    (session) =>
      !session.closed &&
      objects.value.some(
        (binding) =>
          binding.kind === 'pi_binding' &&
          binding.discussionId === session.discussionId &&
          binding.sessionId
      )
  )
  const project = projectId.value
  agentStates.value = {}
  await Promise.allSettled(
    chosen.map(async (session) => {
      const status = await studioApi(
        `/discussions/${session.discussionId}/agent-status`
      )
      if (projectId.value === project) agentStates.value[session.id] = status
    })
  )
  if (selected.value?.kind === 'workflow_conversation') {
    selected.value =
      agentGraphNodes.value.find((node) => node.id === selected.value?.id) ||
      selected.value
  }
}
async function confirmCandidate(candidate: Obj) {
  const p = objects.value.find((item) => item.id === candidate.proposalId)
  if (!p) return
  try {
    await studioApi(`/proposals/${p.id}/adopt`, {
      expectedHash: p.contentHash,
      selectedKeys: [candidate.key],
      requestId: requestId()
    })
    await refresh()
    selected.value = null
  } catch (e) {
    showError(e)
  }
}
async function rejectCandidate(candidate: Obj) {
  const proposal = objects.value.find(
    (item) => item.id === candidate.proposalId
  )
  if (!proposal) return
  try {
    await studioApi(`/proposals/${proposal.id}/reject-candidate`, {
      key: candidate.key,
      expectedHash: proposal.contentHash,
      requestId: requestId()
    })
    await refresh()
    selected.value = null
  } catch (e) {
    showError(e)
  }
}
async function saveEntityDetails() {
  const entity = selected.value
  if (entity?.kind !== 'entity') return
  if (!entityName.value.trim()) {
    showError(new Error('实体名称不能为空。'))
    return
  }
  try {
    await studioApi(`/objects/${entity.id}`, {
      expectedRevision: entity.revision,
      fields: {
        name: entityName.value.trim(),
        description: entityDescription.value.trim()
      },
      requestId: requestId()
    })
    await refresh()
    syncMessage.value = '实体信息已更新。'
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
async function confirmVoice(resource: Obj) {
  try {
    const entity = objectById(resource.entityId)!
    await studioApi(`/entities/${entity.id}/voice`, {
      assetId: resource.assetId,
      expectedRevision: entity.revision,
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
    workflowContexts.value[session.workflowId] = session.contextId || ''
  }
  await openPiWeb()
}
async function openAgentWorkspaceInExplorer(workspaceId: string) {
  if (navigationBusy.value) return
  const binding = objects.value.find(
    (item) => item.kind === 'pi_binding' && item.workspaceId === workspaceId
  )
  if (!binding) return
  navigationBusy.value = true
  try {
    await studioApi(`/discussions/${binding.discussionId}/open-explorer`, {
      requestId: requestId()
    })
    syncMessage.value = '已在 Windows 文件资源管理器中打开工作目录。'
    agentError.value = ''
  } catch (e) {
    agentError.value = e instanceof Error ? e.message : String(e)
  } finally {
    navigationBusy.value = false
  }
}
async function copyAgentWorkspacePath(workspaceId: string) {
  const binding = objects.value.find(
    (item) => item.kind === 'pi_binding' && item.workspaceId === workspaceId
  )
  if (!binding) return
  try {
    const prepared = await studioApi(
      `/discussions/${binding.discussionId}/workspace`,
      { requestId: requestId() }
    )
    if (prepared.workspaceId !== workspaceId)
      throw new Error('工作区绑定已变化，请刷新工程后重试。')
    await navigator.clipboard.writeText(prepared.workspace)
    syncMessage.value = `已复制目录路径：${prepared.workspace}`
    agentError.value = ''
  } catch (e) {
    agentError.value = e instanceof Error ? e.message : String(e)
  }
}
async function openAgentConversation(node: Obj) {
  const session = sessions.value.find(
    (item) => item.id === node.workflowSessionId
  )
  if (!session) {
    agentError.value = '这条 Workflow 对话已不存在，请刷新工程。'
    return
  }
  sessionId.value = session.id
  activeWorkflowId.value = session.workflowId
  workflowTargets.value[session.workflowId] = session.targetId
  workflowContexts.value[session.workflowId] = session.contextId || ''
  if (
    workspaceTrustPending(session.workflowId) &&
    trustEntryOpenedFor.value !== session.workflowId
  ) {
    const tab = window.open('about:blank', '_blank')
    if (!tab) {
      agentError.value = '浏览器拦截了新标签页，请允许 Studio 打开 PiWeb。'
      return
    }
    tab.opener = null
    navigationBusy.value = true
    try {
      const prepared = await studioApi(
        `/discussions/${session.discussionId}/workspace`,
        { requestId: requestId() }
      )
      if (!prepared.piWebWorkspaceUrl)
        throw new Error('无法生成 PiWeb 工作区入口。')
      workspaceToTrust.value = workflowWorkspaceLabel(session.workflowId)
      workspaceUrl.value = prepared.piWebWorkspaceUrl
      trustEntryOpenedFor.value = session.workflowId
      tab.location.href = prepared.piWebWorkspaceUrl
      agentError.value = '请在 PiWeb 中手动信任工作区，然后返回此处继续。'
    } catch (e) {
      tab.close()
      agentError.value = e instanceof Error ? e.message : String(e)
    } finally {
      navigationBusy.value = false
    }
    return
  }
  await openPiWeb()
}
async function removeWorkflowConversation(node: Obj) {
  const session = sessions.value.find(
    (item) => item.id === node.workflowSessionId
  )
  if (!session) {
    agentError.value = '这条 Workflow 对话已不存在，请刷新工程。'
    return
  }
  if (
    !window.confirm(
      '从 Studio 关系图移除此对话？PiWeb 中的原生会话和历史记录会保留。'
    )
  )
    return
  navigationBusy.value = true
  agentError.value = ''
  try {
    await studioApi(`/workflow-sessions/${session.id}/archive`, {
      requestId: requestId()
    })
    await refresh()
    selected.value = null
    syncMessage.value = '已从 Studio 关系图移除；PiWeb 原生会话仍保留。'
  } catch (e) {
    agentError.value = e instanceof Error ? e.message : String(e)
  } finally {
    navigationBusy.value = false
  }
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
  if (canvasMode.value === 'agents') {
    projectAgentGraph()
    return
  }
  graph.clear()
  const chapterParents = objectHierarchy(objects.value)
  const visible = canvasObjects.value
  // Lay out a spanning forest; cross references remain edges, never duplicate nodes.
  const byId = new Map(visible.map((o) => [o.id, o]))
  const children = new Map<string, Obj[]>()
  const roots: Obj[] = []
  for (const o of visible) {
    let parentId =
      o.kind === 'chapter'
        ? chapterParents.get(o.id)
        : o.kind === 'workflow_run'
          ? o.inputs?.find((input: Obj) => byId.has(input.id))?.id
          : o.kind === 'proposal_item'
            ? byId.has(o.workflowRunId)
              ? o.workflowRunId
              : o.chapterId
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
    n.size = [
      320,
      o.assetId
        ? 240
        : o.kind === 'proposal_item'
          ? 170
          : o.kind === 'workflow_run'
            ? 145
            : 150
    ]
    n.color =
      o.kind === 'entity'
        ? '#245853'
        : o.kind === 'proposal_item'
          ? '#665231'
          : o.kind === 'workflow_run'
            ? effectiveRunStatus(o) === 'failed'
              ? '#713e3c'
              : activeRun(o)
                ? '#455b70'
                : '#354c48'
            : '#2a3e52'
    n.bgcolor = '#152431'
    n.addInput('', '*')
    n.addOutput('', '*')
    if (o.assetId && o.type !== 'audio') {
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
        o.kind === 'workflow_run'
          ? `${o.agentWorking ? '◉ Agent 工作中' : statusName(o.displayStatus || effectiveRunStatus(o))} · ${o.workflowName || o.name}`
          : `${kindName(o.kind)} · ${o.role || kindName(o.item?.type || o.type || '')}`,
        14,
        40
      )
      if (o.agentActivity) {
        ctx.fillStyle = '#8fd1ae'
        ctx.fillText(`◉ ${o.agentActivity}`, 14, 58, 286)
      }
      if (!o.assetId || o.type === 'audio') {
        ctx.fillStyle = '#d4e0e6'
        ctx.font = '12px system-ui'
        const lines: string[] =
          o.type === 'audio'
            ? ['♫ 声音样音 · 选择节点可试听', String(o.status || '')]
            : []
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
            ctx.fillText(
              text,
              14,
              (o.agentActivity ? 88 : 72) + index * 17,
              286
            )
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
    if (o.kind === 'entity')
      for (const chapter of visible.filter((item) => item.kind === 'chapter'))
        if (
          (o.sources || []).some(
            (source: Obj) =>
              source.sourceId === chapter.sourceId &&
              chapter.anchorIds?.includes(source.anchorId)
          )
        )
          edges.push({
            id: `${chapter.id}:entity:${o.id}`,
            kind: 'data_relation',
            revision: 1,
            fromId: chapter.id,
            toId: o.id
          })
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
    if (o.chapterId && o.kind !== 'proposal_item')
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
  for (const run of visible.filter((o) => o.kind === 'workflow_run')) {
    for (const input of run.inputs || [])
      if (byId.has(input.id))
        edges.push({
          id: `${run.id}:input:${input.id}`,
          kind: 'execution_relation',
          revision: 1,
          fromId: input.id,
          toId: run.id
        })
    for (const outputId of run.outputs || []) {
      const candidates = visible.filter(
        (o) => o.kind === 'proposal_item' && o.proposalId === outputId
      )
      const targets = candidates.length ? candidates : [byId.get(outputId)]
      for (const target of targets) {
        if (!target) continue
        edges.push({
          id: `${run.id}:output:${target.id}`,
          kind: 'execution_relation',
          revision: 1,
          fromId: run.id,
          toId: target.id
        })
      }
    }
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
function projectAgentGraph() {
  graph.clear()
  const nodes = agentGraphNodes.value
  if (!nodes.length) {
    canvas.setDirty(true, true)
    return
  }
  const projectNode = nodes.find((node) => node.kind === 'agent_project')!
  const workflows = nodes.filter((node) => node.kind === 'workflow_agent')
  const conversations = nodes.filter(
    (node) => node.kind === 'workflow_conversation'
  )
  const positions = new Map<string, [number, number]>()
  let cursor = 0
  for (const workflow of workflows) {
    const own = conversations.filter(
      (conversation) => conversation.workflowId === workflow.workflowId
    )
    const rowCount = Math.max(1, own.length)
    const blockHeight = rowCount * 195
    positions.set(workflow.id, [420, cursor + (blockHeight - 155) / 2])
    own.forEach((conversation, index) =>
      positions.set(conversation.id, [1290, cursor + index * 195])
    )
    cursor += blockHeight + 70
  }
  const totalHeight = Math.max(190, cursor - 70)
  positions.set(projectNode.id, [0, totalHeight / 2 - 90])
  for (const node of nodes) {
    const workflowName = definitions.value.find(
      (definition) => definition.id === node.workflowId
    )?.name
    const title =
      node.kind === 'workflow_conversation'
        ? node.sessionName || node.name || `${workflowName || '对话'}`
        : node.name
    const n = new LGraphNode(
      title && title.length > 24
        ? `${title.slice(0, 23)}…`
        : title || kindName(node.kind)
    )
    n.id = toNodeId(node.id)
    n.pos = positions.get(node.id) || [0, 0]
    n.size = [350, node.kind === 'agent_project' ? 180 : 160]
    n.color =
      node.kind === 'agent_project'
        ? '#2a3e52'
        : node.kind === 'workflow_agent'
          ? '#245853'
          : '#51466b'
    n.bgcolor = '#152431'
    n.addInput('', '*')
    n.addOutput('', '*')
    n.onDrawForeground = (ctx) => {
      ctx.save()
      ctx.beginPath()
      ctx.rect(10, 24, n.size[0] - 20, n.size[1] - 30)
      ctx.clip()
      ctx.fillStyle = '#9eb4c4'
      ctx.font = '12px system-ui'
      ctx.fillText(kindName(node.kind), 14, 42)
      ctx.fillStyle = '#d4e0e6'
      ctx.font = '12px system-ui'
      const preview = nodePreview(node)
      const lines: string[] = []
      let line = ''
      for (const character of preview) {
        const next = line + character
        if (line && ctx.measureText(next).width > n.size[0] - 28) {
          lines.push(line)
          line = character.trimStart()
        } else line = next
      }
      if (line) lines.push(line)
      lines
        .slice(0, 4)
        .forEach((text, index) =>
          ctx.fillText(text, 14, 72 + index * 17, n.size[0] - 28)
        )
      ctx.restore()
    }
    graph.add(n)
  }
  const link = (fromId: string, toId: string) => {
    const from = graph.getNodeById(toNodeId(fromId))
    const to = graph.getNodeById(toNodeId(toId))
    if (from && to) from.connect(0, to, 0)
  }
  for (const workflow of workflows) {
    link(projectNode.id, workflow.id)
    for (const conversationId of workflow.conversationIds || [])
      link(workflow.id, conversationId)
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
watch(
  [
    objects,
    focusId,
    showAllResources,
    showHistory,
    canvasMode,
    agentGraphNodes,
    canvasObjects
  ],
  projectGraph
)
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
  canvas.onDrawForeground = () => {}
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvasHost.value!)
  window.addEventListener('resize', resize)
  canvasElement.value!.addEventListener('pointerdown', (event) => {
    clearTimeout(inspectTimer)
    if (event.button !== 2) contextMenu.value = null
    pointerStart = { x: event.clientX, y: event.clientY }
    pointerDragged = false
  })
  canvasElement.value!.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    const [x, y] = canvas.convertEventToCanvasOffset(event)
    const node = hitCanvasNode(graph.nodes, x, y)
    const object = node && objectById(String(node.id))
    if (!object) {
      contextMenu.value = null
      return
    }
    const rect = canvasHost.value!.getBoundingClientRect()
    contextMenu.value = {
      nodeId: object.id,
      x: Math.max(8, Math.min(event.clientX - rect.left, rect.width - 290)),
      y: Math.max(8, Math.min(event.clientY - rect.top, rect.height - 320))
    }
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
          canvasMode.value === 'agents'
            ? '单击查看详情 · 右键使用快捷操作'
            : object.id !== focusId.value &&
                canDrill(objects.value, object.id, showAllResources.value)
              ? '单击查看详情 · 双击进入下级 · 右键启动工作流'
              : '单击查看详情 · 右键查看可用操作'
      }
    } else hoverTooltip.value = null
  })
  canvasElement.value!.addEventListener('pointerleave', () => {
    hoverTooltip.value = null
  })
  canvasElement.value!.addEventListener('click', (event) => {
    if (pointerDragged || event.button !== 0) return
    contextMenu.value = null
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
    if (object && canvasMode.value === 'agents') select(object)
    else if (object) drillInto(object)
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
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  background: #101b25;
  color: var(--ink);
  font: 13px/1.6 system-ui;
}
.floating-brand {
  position: absolute;
  z-index: 20;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: min(520px, calc(100vw - 24px));
  padding: 6px 8px 6px 11px;
  border: 1px solid #344b5b;
  border-radius: 10px;
  background: rgb(20 34 46 / 92%);
  box-shadow: 0 5px 18px rgb(0 0 0 / 24%);
  backdrop-filter: blur(10px);
}
.brand-mark {
  color: #94c8b1;
  font-size: 16px;
}
.brand-project {
  color: #e2eaf0;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.floating-brand select {
  width: min(300px, 55vw);
  padding: 5px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.floating-brand button {
  padding: 4px 9px;
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
  padding-left: 420px;
  padding-right: 12px;
}
.navigation-location {
  flex: 1;
  min-width: 160px;
  margin-right: 0;
}
.agent-view-heading {
  color: var(--muted);
  font-size: 12px;
}
.canvas-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  margin-left: auto;
  margin-right: 0;
}
.sync-message {
  position: absolute;
  z-index: 5;
  top: 66px;
  left: 50%;
  max-width: min(720px, 70vw);
  transform: translateX(-50%);
  padding: 9px 14px;
  border: 1px solid #416258;
  border-radius: 8px;
  background: #17332fef;
  color: #c8e5d8;
  font-size: 12px;
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
.node-context-menu {
  position: absolute;
  z-index: 30;
  display: grid;
  gap: 3px;
  min-width: 220px;
  max-width: min(300px, calc(100vw - 24px));
  padding: 7px;
  border: 1px solid #486173;
  border-radius: 9px;
  background: #14232ff5;
  box-shadow: 0 10px 30px #000a;
}
.node-context-menu strong {
  overflow: hidden;
  padding: 5px 8px 7px;
  color: #c4d2dc;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-context-menu button {
  border: 0;
  text-align: left;
  background: transparent;
}
.node-context-menu button:hover:not(:disabled) {
  background: #294657;
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
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 8px;
  right: 15px;
  top: 15px;
  color: var(--muted);
  font-size: 10px;
}
@keyframes pulse {
  50% {
    opacity: 0.35;
  }
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
.inspector .workflow-run-entry {
  display: block;
  width: 100%;
  text-align: left;
}
.inspector .workspace-path-link {
  margin: 0;
  padding: 0;
  color: #9ad9ed;
  background: transparent;
  border: 0;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.inspector select {
  width: 100%;
  margin: 6px 0;
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
.resource-audio {
  width: 100%;
  margin: 12px 0;
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
@media (max-width: 900px) {
  .floating-brand {
    top: 8px;
    padding: 4px 6px;
  }
  .floating-brand select {
    width: min(240px, 52vw);
  }
  .canvas-navigation {
    padding-top: 62px;
    padding-left: 12px;
  }
}
</style>
