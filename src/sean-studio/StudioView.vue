<!-- eslint-disable @intlify/vue-i18n/no-raw-text -- Sean v1 product UI is Chinese; upstream locales are unchanged. -->
<template>
  <div class="studio-shell">
    <header>
      <div class="brand">
        <span class="mark">◈</span> ENTITY <b>STUDIO</b
        ><small>Sean · 实体创作</small>
      </div>
      <div class="crumb">
        {{ snapshot?.project.name || '工作空间' }} <span>/</span>
        {{ mode === 'workflow' ? 'Qwen Image 2.1 · 真实流程' : '项目画布' }}
      </div>
      <span class="status">{{
        nativeReady ? '● 节点已连接' : '○ 连接节点中'
      }}</span>
    </header>
    <aside class="tree">
      <div class="section-label">工作空间</div>
      <select v-model="projectId" @change="openProject">
        <option value="">选择项目</option>
        <option v-for="p in projects" :key="p.id" :value="p.id">
          {{ p.name }}
        </option></select
      ><button @click="newProject">＋ 新建项目</button>
      <div class="section-label">项目内容</div>
      <button class="tree-item" @click="overview">◈ 项目总览</button
      ><button
        v-for="k in kinds"
        :key="k.key"
        class="tree-item"
        @click="setFilter(k.key)"
      >
        {{ k.icon }} {{ k.name }}
        <span>{{ objects.filter((o) => o.kind === k.key).length }}</span>
      </button>
      <div class="section-label">章节与剧情场景</div>
      <div v-for="c in objects.filter((o) => o.kind === 'chapter')" :key="c.id">
        <button class="tree-item" @click="select(c)">{{ c.name }}</button
        ><button
          v-for="s in objects.filter(
            (o) => o.kind === 'scene' && o.chapterId === c.id
          )"
          :key="s.id"
          class="scene"
          @click="select(s)"
        >
          ↳ {{ s.name }}
        </button>
      </div>
      <button @click="editor = 'source'">＋ 导入原文</button
      ><button @click="editor = 'chapter'">＋ 新建章节</button
      ><button @click="editor = 'scene'">＋ 新建剧情场景</button>
      <div class="tree-footer">
        创作事实由你采用<br />讨论、生成与确认分别记录
      </div>
    </aside>
    <main>
      <div class="canvas-toolbar">
        <div>
          <strong>{{
            mode === 'workflow' ? '固定 Qwen 流程' : '创作画布'
          }}</strong
          ><small>{{
            mode === 'workflow'
              ? '节点与连接只读 · 参数在输入卡修改'
              : '资料 → 讨论与提案 → 实体 → 运行与结果'
          }}</small>
        </div>
        <div class="tools">
          <button v-if="mode === 'workflow'" @click="mode = 'studio'">
            ← 返回项目画布</button
          ><button v-else @click="fit">适配全图</button
          ><button @click="openWorkflow">进入 Qwen 流程 ↗</button>
        </div>
      </div>
      <div class="canvas-area">
        <NativeWorkflow
          v-show="mode === 'workflow'"
          ref="native"
          :active="mode === 'workflow'"
          @ready="nativeReady = true"
          @error="showError"
        />
        <div v-show="mode === 'studio'" ref="projectionHost" class="projection">
          <canvas ref="projectionCanvas" />
          <div v-if="!objects.length" class="empty">
            <span>◈</span>
            <h1>从一段故事开始</h1>
            <p>
              导入原文，与 PI 讨论人物、地点和道具。<br />检查来源并采用，让想法成为可追溯的实体。
            </p>
            <button class="primary" @click="editor = 'source'">
              导入故事原文</button
            ><small>尚未生成任何作品</small>
          </div>
        </div>
        <div v-if="mode === 'studio'" class="canvas-legend">
          ◌ 自动布局 <span>滚轮缩放 · 空白处平移 · 点击卡片查看</span>
        </div>
      </div>
      <section v-if="selected" class="detail">
        <div class="detail-title">
          <span>{{ kindName(selected.kind) }} · v{{ selected.revision }}</span
          ><button @click="selected = null">×</button>
        </div>
        <h2>{{ selected.name || selected.goal || '待采用提案' }}</h2>
        <p>{{ selected.description || selected.brief }}</p>
        <template v-if="selected.kind === 'source'">
          <pre>{{ selected.text }}</pre>
          <div v-for="a in selected.anchors" :key="a.id" class="anchor">
            {{ a.id }} · {{ a.start }}–{{ a.end }} · {{ a.hash.slice(0, 12) }}
          </div></template
        ><template v-if="selected.kind === 'proposal'"
          ><label v-for="i in selected.items" :key="i.key"
            ><input v-model="adoptKeys" type="checkbox" :value="i.key" />
            {{ i.name || i.description || i.key }}
            <small>{{ i.kind }} {{ i.sceneId ? '仅本场' : '' }}</small>
            <pre>{{ JSON.stringify(i, null, 2) }}</pre></label
          ><button
            class="primary"
            :disabled="selected.status !== 'pending'"
            @click="adoptSelected"
          >
            采用所选候选
          </button></template
        >
        <p v-if="selected.kind === 'entity_use'">
          仅本场 · 固定实体 v{{ selected.entityRevision }}<br />{{
            JSON.stringify(selected.state)
          }}
        </p>
        <div
          v-if="selected.kind === 'entity' && selected.type === 'character'"
          class="image-editor"
        >
          <h3>人物基准图 · Qwen Image 2.1</h3>
          <textarea
            v-model="imageDraft.prompt"
            placeholder="基准外观与本轮目标"
          /><label
            >Seed
            <input
              v-model.number="imageDraft.seed"
              type="number"
              min="0" /></label
          ><label
            >步数
            <input
              v-model.number="imageDraft.steps"
              type="number"
              min="1"
              max="50" /></label
          ><select v-model="imageDraft.size">
            <option value="1536x1024">1536 × 1024</option>
            <option value="1024x1536">1024 × 1536</option>
            <option value="1024x1024">1024 × 1024</option>
          </select>
          <p>
            有序生成引用：{{ imageDraft.references.length }}
            张（与讨论上下文分开）
          </p>
          <div v-for="(id, index) in imageDraft.references" :key="id">
            {{ index + 1 }} · {{ id.slice(0, 12)
            }}<button @click="imageDraft.references.splice(index, 1)">
              移除
            </button>
          </div>
          <button @click="saveImageInput">保存新输入版本</button>
        </div>
        <div v-if="selected.kind === 'image_input'">
          <p>{{ selected.input.prompt }}</p>
          <p>
            {{ selected.input.width }} × {{ selected.input.height }} · seed
            {{ selected.input.seed }} · {{ selected.input.steps }} 步
          </p>
          <p>
            明确引用顺序：{{
              selected.input.references
                .map((r: any) => r.assetId)
                .join(' → ') || '零图参考'
            }}
          </p>
          <button @click="viewInput(selected)">进入实际流程 / 核验双图</button
          ><button class="primary" @click="authorizeInput(selected)">
            生成这一版 · 仅一次
          </button>
        </div>
        <div v-if="selected.kind === 'run'">
          <p>{{ selected.status }}</p>
          <p v-if="selected.error">{{ selected.error }}</p>
          <div v-for="(node, id) in selected.nodes" :key="id">
            节点 {{ id }} · {{ node.event }}
            {{ node.value !== undefined ? node.value + '/' + node.max : '' }}
          </div>
          <button @click="viewRun(selected)">查看本次不可变流程</button>
        </div>
        <div v-if="selected.kind === 'asset'">
          <img
            :src="'/studio-api/v1/assets/' + selected.id + '/content'"
            class="result-image"
          />
          <p>来源运行 {{ selected.runId }} · 节点 {{ selected.nodeId }}</p>
          <p>实际输入 {{ selected.inputHash }}</p>
          <button @click="useAsReference(selected)">
            明确作为下一轮生成参考</button
          ><button @click="confirmAppearance(selected)">设为主形象</button
          ><button @click="toggleCompare(selected.id)">
            {{
              compareIds.includes(selected.id) ? '从比较中移除' : '加入并排比较'
            }}
          </button>
        </div>
        <button @click="addContext(selected)">加入本轮讨论 ＋</button>
      </section>
    </main>
    <aside class="pi-panel">
      <div class="pi-heading">
        <span class="pi-mark">π</span>
        <div>
          <strong>创作讨论</strong><small>原生 PI · 多对象上下文</small>
        </div>
        <button @click="newDiscussion">＋</button>
      </div>
      <div class="context">
        <div class="section-label">
          本轮带入 <span>{{ context.length }}</span>
        </div>
        <div v-for="(o, i) in context" :key="o.id" class="context-chip">
          {{ o.name || kindName(o.kind) }} · v{{ o.revision
          }}<button @click="context.splice(i, 1)">×</button>
        </div>
        <p v-if="!context.length">选中卡片后，点击“加入本轮讨论”。</p>
        <small>移除对象不会清除已有会话历史。</small>
      </div>
      <select
        v-model="discussionId"
        class="discussion-select"
        @change="restoreMessages"
      >
        <option value="">新讨论</option>
        <option
          v-for="d in objects.filter((o) => o.kind === 'discussion')"
          :key="d.id"
          :value="d.id"
        >
          {{ d.name || d.goal }}
        </option>
      </select>
      <div v-if="chat.length || streaming" class="chat-history">
        <article v-for="(m, i) in chat" :key="m.id || i" :class="m.role">
          <small>{{
            m.role === 'user'
              ? '你'
              : m.role === 'assistant'
                ? 'PI'
                : '工具活动'
          }}</small>
          <pre>{{ m.text }}</pre>
        </article>
        <article v-if="streaming" class="assistant">
          <small>PI · 回复中</small>
          <pre>{{ streaming }}</pre>
        </article>
      </div>
      <div v-else class="discussion-empty">
        <div>π</div>
        <h3>让故事里的对象彼此连接</h3>
        <p>
          选入原文、人物或场景后发起讨论。<br />PI
          的建议经你采用后成为现行设定。
        </p>
        <span class="notice">{{ piStatus }}</span>
      </div>
      <div class="composer">
        <textarea v-model="message" placeholder="这轮希望讨论什么？" />
        <div>
          <small>{{ discussionId ? '当前讨论已保存' : '先创建讨论' }}</small
          ><button :disabled="sending" @click="sendMessage">
            {{ sending ? '发送中' : '发送讨论 ↗' }}</button
          ><button v-if="sending" @click="stopPi">停止回复</button>
        </div>
      </div>
    </aside>
    <div v-if="compareIds.length" class="compare-strip">
      <button @click="compareIds = []">关闭比较 ×</button>
      <figure v-for="id in compareIds" :key="id">
        <img :src="'/studio-api/v1/assets/' + id + '/content'" />
        <figcaption>{{ id.slice(0, 12) }}</figcaption>
      </figure>
    </div>
    <div v-if="editor" class="modal-backdrop">
      <form class="editor" @submit.prevent="saveEditor">
        <div class="section-label">
          {{
            editor === 'source'
              ? '导入原文'
              : editor === 'chapter'
                ? '新建章节'
                : '新建剧情场景'
          }}<button type="button" @click="editor = ''">×</button>
        </div>
        <input v-model="draft.name" placeholder="名称" required /><select
          v-if="editor === 'scene'"
          v-model="draft.chapterId"
          required
        >
          <option value="">选择所属章节</option>
          <option
            v-for="c in objects.filter((o) => o.kind === 'chapter')"
            :key="c.id"
            :value="c.id"
          >
            {{ c.name }}
          </option></select
        ><textarea
          v-model="draft.text"
          :placeholder="
            editor === 'source'
              ? '粘贴原文，保留段落以建立来源锚点'
              : '目标或剧情简述'
          "
        /><button class="primary">保存</button>
      </form>
    </div>
    <div v-if="error" class="toast" @click="error = ''">
      {{ error }} <span>×</span>
    </div>
  </div>
</template>
<script setup lang="ts">
// Owner: Sean. Domain objects project to an isolated LiteGraph; never the execution root.
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { toNodeId } from '@/types/nodeId'
import { LGraph, LGraphCanvas, LGraphNode } from '@/lib/litegraph/src/litegraph'
import NativeWorkflow from './NativeWorkflow.vue'
import { studioApi, requestId } from './api'
type NativeMessage = {
  role: string
  content: string | { type: string; text?: string }[]
}
type NativeEntry = NativeMessage & { id: string; message?: NativeMessage }
type Obj = {
  id: string
  kind: string
  revision: number
  name?: string
  // Heterogeneous versioned business payloads; service validates each kind before writes.
  // oxlint-disable-next-line typescript/no-explicit-any
  [key: string]: any
}
const projects = ref<Obj[]>([]),
  projectId = ref(localStorage.getItem('sean-studio-project') || ''),
  snapshot = ref<{ project: Obj; objects: Obj[]; latestSeq: number }>(),
  selected = ref<Obj | null>(null),
  context = ref<Obj[]>([]),
  mode = ref('studio'),
  filter = ref(''),
  editor = ref(''),
  error = ref(''),
  nativeReady = ref(false),
  adoptKeys = ref<string[]>([]),
  message = ref(''),
  imageDraft = ref({
    prompt: '',
    seed: 42,
    steps: 25,
    size: '1536x1024',
    references: [] as string[]
  }),
  compareIds = ref<string[]>([]),
  discussionId = ref(''),
  chat = ref<{ id?: string; role: string; text: string }[]>([]),
  streaming = ref(''),
  piStatus = ref('原生 PI · 等待发送'),
  sending = ref(false)
const draft = ref({ name: '', text: '', chapterId: '' }),
  native = ref<InstanceType<typeof NativeWorkflow>>(),
  projectionHost = ref<HTMLElement>(),
  projectionCanvas = ref<HTMLCanvasElement>()
const objects = computed<Obj[]>(() => snapshot.value?.objects || [])
const kinds = [
  { key: 'source', name: '原始资料', icon: '▤' },
  { key: 'entity', name: '实体', icon: '◇' },
  { key: 'relation', name: '关系', icon: '⇄' },
  { key: 'discussion', name: '讨论', icon: '◌' },
  { key: 'proposal', name: '待采用提案', icon: '⊕' },
  { key: 'entity_use', name: '场景局部状态', icon: '◐' },
  { key: 'image_input', name: '图片输入', icon: '▧' },
  { key: 'run', name: '运行', icon: '▷' },
  { key: 'asset', name: '候选结果', icon: '▣' }
]
const kindName = (k: string) => kinds.find((i) => i.key === k)?.name || k
const showError = (e: unknown) => {
  error.value = String(e instanceof Error ? e.message : e)
}
let graph: LGraph,
  canvas: LGraphCanvas,
  observer: ResizeObserver,
  events: EventSource | undefined,
  viewRevision = 0,
  viewTimer: ReturnType<typeof setTimeout> | undefined
function overview() {
  mode.value = 'studio'
  filter.value = ''
}
function setFilter(kind: string) {
  filter.value = kind
  mode.value = 'studio'
}
function select(o: Obj) {
  if (o.kind === 'discussion') {
    discussionId.value = o.id
    void restoreMessages()
  }
  selected.value = o
  if (o.kind === 'entity') imageDraft.value.prompt = o.description || ''
  adoptKeys.value =
    o.kind === 'proposal' ? o.items.map((i: { key: string }) => i.key) : []
}
function addContext(o: Obj) {
  if (!context.value.some((i) => i.id === o.id)) context.value.push(o)
}
async function refresh() {
  if (projectId.value)
    snapshot.value = await studioApi(`/projects/${projectId.value}/snapshot`)
}
async function openProject() {
  try {
    localStorage.setItem('sean-studio-project', projectId.value)
    selected.value = null
    context.value = []
    await refresh()
    const v = await studioApi(`/projects/${projectId.value}/views/studio`)
    viewRevision = v.revision
    await nextTick()
    if (v.scale) canvas.ds.scale = v.scale
    if (v.offset) canvas.ds.offset = [v.offset[0], v.offset[1]]
    events?.close()
    events = new EventSource(
      `/studio-api/v1/projects/${projectId.value}/events?after=${snapshot.value?.latestSeq || 0}`
    )
    events.onmessage = () => {
      void refresh()
    }
  } catch (e) {
    showError(e)
  }
}
async function newProject() {
  const name = window.prompt('项目名称')
  if (!name) return
  try {
    const p = await studioApi('/projects', { name, requestId: requestId() })
    projects.value.push(p)
    projectId.value = p.id
    await openProject()
  } catch (e) {
    showError(e)
  }
}
async function saveEditor() {
  try {
    if (!projectId.value) throw new Error('请先新建或选择项目')
    const collection = {
      source: 'sources',
      chapter: 'chapters',
      scene: 'scenes'
    }[editor.value]
    await studioApi(`/projects/${projectId.value}/${collection}`, {
      ...draft.value,
      brief: draft.value.text,
      requestId: requestId()
    })
    editor.value = ''
    draft.value = { name: '', text: '', chapterId: '' }
    await refresh()
  } catch (e) {
    showError(e)
  }
}
async function adoptSelected() {
  try {
    await studioApi(`/proposals/${selected.value!.id}/adopt`, {
      expectedHash: selected.value!.contentHash,
      selectedKeys: adoptKeys.value,
      requestId: requestId()
    })
    await refresh()
    selected.value = null
  } catch (e) {
    showError(e)
  }
}
async function newDiscussion() {
  discussionId.value = ''
  message.value = ''
}
async function saveDiscussion() {
  try {
    if (!projectId.value) throw new Error('请先选择项目')
    const d = await studioApi(`/projects/${projectId.value}/discussions`, {
      goal: message.value,
      links: context.value.map((o) => ({
        id: o.id,
        revision: o.revision,
        role: 'basis'
      })),
      requestId: requestId()
    })
    discussionId.value = d.id
    await refresh()
  } catch (e) {
    showError(e)
  }
}
let piEvents: EventSource | undefined
async function restoreMessages() {
  if (!discussionId.value) return
  try {
    const history = await studioApi(
      `/discussions/${discussionId.value}/messages`
    )
    const context = history.context?.messages || history.context || []
    chat.value = Array.isArray(context)
      ? context
          .map((entry: NativeEntry, i: number) => {
            const m = entry.message || entry
            return {
              id: history.entryIds?.[i] || entry.id,
              role: m.role,
              text:
                typeof m.content === 'string'
                  ? m.content
                  : (m.content || [])
                      .filter(
                        (b: { type: string; text?: string }) =>
                          b.type === 'text'
                      )
                      .map((b: { text?: string }) => b.text)
                      .join('\n')
            }
          })
          .filter((m: { id: string; role: string; text: string }) =>
            ['user', 'assistant', 'toolResult'].includes(m.role)
          )
          .map((m: { id: string; role: string; text: string }) => ({
            ...m,
            text: m.text.replace(/^\[entity-studio-turn:[^\]]+\]\n/, '')
          }))
      : []
  } catch (e) {
    piStatus.value = String(e)
  }
}
function subscribePi() {
  piEvents?.close()
  piEvents = new EventSource(
    `/studio-api/v1/discussions/${discussionId.value}/pi-events`
  )
  piEvents.onmessage = (event) => {
    try {
      const e = JSON.parse(event.data)
      if (e.type === 'message_update') {
        const delta = e.assistantMessageEvent?.delta
        if (typeof delta === 'string') streaming.value += delta
      }
      if (
        e.type === 'message_end' ||
        e.type === 'agent_end' ||
        e.type === 'agent_settled'
      ) {
        streaming.value = ''
        void restoreMessages()
        if (e.type === 'agent_end' || e.type === 'agent_settled')
          sending.value = false
      }
      if (e.type === 'tool_execution_start')
        piStatus.value = '正在读取或保存提案'
    } catch {
      // Ignore malformed transport fragments; native history remains authoritative.
    }
  }
  piEvents.onerror = () => {
    piStatus.value = '连接中断，重新读取原会话历史'
    void restoreMessages()
  }
}
async function sendMessage() {
  try {
    if (!message.value.trim()) return
    if (!discussionId.value) await saveDiscussion()
    await studioApi(`/discussions/${discussionId.value}/pi-session`, {
      requestId: requestId()
    })
    subscribePi()
    const text = message.value
    sending.value = true
    await studioApi(`/discussions/${discussionId.value}/turns`, {
      requestId: requestId(),
      text,
      context: context.value.map((o) => ({
        id: o.id,
        revision: o.revision,
        role: 'basis'
      }))
    })
    chat.value.push({ role: 'user', text })
    message.value = ''
    piStatus.value = '原生 PI 回复中'
  } catch (e) {
    sending.value = false
    showError(e)
  }
}
async function stopPi() {
  try {
    await studioApi(`/discussions/${discussionId.value}/stop`, {
      requestId: requestId()
    })
    sending.value = false
    streaming.value = ''
    await restoreMessages()
  } catch (e) {
    showError(e)
  }
}
async function saveImageInput() {
  try {
    const e = selected.value!,
      [width, height] = imageDraft.value.size.split('x').map(Number)
    await studioApi(`/entities/${e.id}/image-inputs`, {
      ...imageDraft.value,
      width,
      height,
      entityRevision: e.revision,
      requestId: requestId()
    })
    await refresh()
  } catch (e) {
    showError(e)
  }
}
async function viewInput(input: Obj) {
  try {
    const preview = await studioApi(`/image-inputs/${input.id}/preview`)
    mode.value = 'workflow'
    await nextTick()
    const graph = await native.value!.loadApiGraph(preview.graph)
    await studioApi(`/image-inputs/${input.id}/verify`, graph)
  } catch (e) {
    showError(e)
  }
}
async function viewRun(run: Obj) {
  try {
    mode.value = 'workflow'
    await nextTick()
    await native.value!.loadSnapshot(run.workflow)
  } catch (e) {
    showError(e)
  }
}
async function authorizeInput(input: Obj) {
  try {
    if (!discussionId.value) throw new Error('请先选择已绑定的原生 PI 讨论')
    await viewInput(input)
    const action = await studioApi(`/image-inputs/${input.id}/actions`, {
      requestId: requestId(),
      inputRevision: input.revision,
      inputHash: input.inputHash,
      authorizedOnce: true
    })
    await studioApi(`/discussions/${discussionId.value}/pi-session`, {
      requestId: requestId()
    })
    subscribePi()
    await studioApi(`/discussions/${discussionId.value}/turns`, {
      requestId: requestId(),
      text: `用户通过输入卡明确授权只生成这一版。先 context/preview 核对，随后 submit_action，actionId=${action.id}。不要修改输入，不要采用事实或确认主形象。`,
      context: [{ id: input.id, revision: input.revision, role: 'target' }],
      actionId: action.id
    })
    await refresh()
  } catch (e) {
    showError(e)
  }
}
function useAsReference(asset: Obj) {
  const run = objects.value.find((o) => o.id === asset.runId),
    entity = objects.value.find((o) => o.id === run?.targetEntityId)
  if (!entity) return
  select(entity)
  imageDraft.value = {
    prompt: run!.inputSnapshot.input.prompt,
    seed: run!.inputSnapshot.input.seed,
    steps: run!.inputSnapshot.input.steps,
    size:
      run!.inputSnapshot.input.width + 'x' + run!.inputSnapshot.input.height,
    references: [asset.id]
  }
}
function toggleCompare(id: string) {
  if (compareIds.value.includes(id))
    compareIds.value = compareIds.value.filter((i) => i !== id)
  else compareIds.value = [...compareIds.value.slice(-1), id]
}
async function confirmAppearance(asset: Obj) {
  try {
    const run = objects.value.find((o) => o.id === asset.runId),
      entity = objects.value.find((o) => o.id === run?.targetEntityId)
    if (!entity) throw new Error('目标人物不存在')
    await studioApi(`/entities/${entity.id}/appearance`, {
      requestId: requestId(),
      assetId: asset.id,
      expectedRevision: entity.revision
    })
    await refresh()
  } catch (e) {
    showError(e)
  }
}
async function openWorkflow() {
  try {
    if (!nativeReady.value) throw new Error('原生节点仍在初始化')
    const data = await studioApi('/templates/qwen')
    mode.value = 'workflow'
    await nextTick()
    const exported = await native.value!.loadApiGraph(data.graph)
    await studioApi('/templates/qwen/verify', {
      ...exported,
      requestId: requestId()
    })
  } catch (e) {
    showError(e)
  }
}
function fit() {
  if (!canvas) return
  if (graph.nodes.length) {
    canvas.fitViewToSelectionAnimated()
    return
  }
  canvas.ds.scale = 0.72
  canvas.ds.offset = [40, 70]
  canvas.setDirty(true, true)
}
function projectGraph() {
  if (!graph) return
  const old = new Map(graph.nodes.map((n) => [String(n.id), n.pos]))
  graph.clear()
  const visible = objects.value
    .filter(
      (o) =>
        ![
          'pi_binding',
          'pi_turn',
          'read_audit',
          'request_audit',
          'decision',
          'action',
          'appearance_selection'
        ].includes(o.kind)
    )
    .filter((o) => !filter.value || o.kind === filter.value)
  const counters = [0, 0, 0, 0]
  for (const o of visible) {
    const col = ['source', 'chapter', 'scene'].includes(o.kind)
      ? 0
      : ['discussion', 'proposal'].includes(o.kind)
        ? 1
        : ['entity', 'relation', 'entity_use'].includes(o.kind)
          ? 2
          : 3
    const n = new LGraphNode(o.name || o.goal || kindName(o.kind))
    n.id = toNodeId(o.id)
    const order = counters[col]++
    n.pos = old.get(o.id) || [col * 355, order * 200]
    n.size = [300, 150]
    n.color =
      o.kind === 'proposal'
        ? '#6a4d22'
        : o.kind === 'entity'
          ? '#214d49'
          : '#303d50'
    n.bgcolor = '#17222f'
    if (o.kind === 'asset') {
      const image = new Image()
      image.src = '/studio-api/v1/assets/' + o.id + '/thumbnail'
      image.onload = () => canvas.setDirty(true, true)
      n.onDrawBackground = (ctx) => {
        if (image.complete && image.naturalWidth)
          ctx.drawImage(image, 12, 38, 276, 90)
      }
    }
    n.addInput('依据', '*')
    n.addOutput('引用', '*')
    n.onDrawForeground = (ctx) => {
      ctx.fillStyle = '#94a5b8'
      ctx.font = '12px sans-serif'
      ctx.fillText(`${kindName(o.kind)} · v${o.revision}`, 16, 32)
      ctx.fillStyle = '#d4dce5'
      const text = (
        o.description ||
        o.brief ||
        o.status ||
        '点击查看详情'
      ).slice(0, 72)
      ctx.fillText(text.slice(0, 25), 16, 65)
      ctx.fillText(text.slice(25, 50), 16, 87)
      ctx.fillText(text.slice(50, 72), 16, 109)
    }
    graph.add(n)
  }
  for (const o of visible) {
    const to = graph.getNodeById(toNodeId(o.id))
    for (const fromId of [
      o.chapterId,
      o.fromId,
      o.entityId,
      o.proposalId,
      ...(o.sources || []).map((s: { sourceId: string }) => s.sourceId)
    ]) {
      const from = graph.getNodeById(toNodeId(fromId))
      if (from && to) from.connect(0, to, 0)
    }
  }
  canvas.setDirty(true, true)
}
watch([objects, filter], projectGraph)
watch(mode, async (m) => {
  await nextTick()
  if (m === 'studio') {
    canvas?.startRendering()
    resize()
  } else canvas?.stopRendering()
})
function resize() {
  if (!canvas || !projectionHost.value) return
  const r = projectionHost.value.getBoundingClientRect()
  canvas.resize(r.width, r.height)
}
function saveView() {
  clearTimeout(viewTimer)
  viewTimer = setTimeout(async () => {
    if (!projectId.value) return
    try {
      const v = await studioApi(
        `/projects/${projectId.value}/views/studio`,
        {
          expectedRevision: viewRevision,
          view: {
            scale: canvas.ds.scale,
            offset: Array.from(canvas.ds.offset)
          },
          requestId: requestId()
        },
        'PATCH'
      )
      viewRevision = v.revision
    } catch (e) {
      showError(e)
    }
  }, 500)
}
onMounted(async () => {
  graph = new LGraph()
  canvas = new LGraphCanvas(projectionCanvas.value!, graph)
  canvas.read_only = true
  canvas.allow_dragnodes = false
  canvas.allow_searchbox = false
  canvas.onNodeSelected = (n) => {
    const o = objects.value.find((o) => o.id === String(n.id))
    if (o) select(o)
  }
  observer = new ResizeObserver(resize)
  observer.observe(projectionHost.value!)
  projectionCanvas.value!.addEventListener('click', (event) => {
    const [x, y] = canvas.convertEventToCanvasOffset(event)
    const node = graph.getNodeOnPos(x, y)
    if (node) {
      const o = objects.value.find((o) => o.id === String(node.id))
      if (o) select(o)
    }
  })
  projectionCanvas.value!.addEventListener('pointerup', saveView)
  projectionCanvas.value!.addEventListener('wheel', saveView)
  fit()
  try {
    projects.value = await studioApi('/projects')
    if (projectId.value) await openProject()
  } catch (e) {
    showError(e)
  }
})
onBeforeUnmount(() => {
  events?.close()
  piEvents?.close()
  observer?.disconnect()
  canvas?.stopRendering()
  clearTimeout(viewTimer)
})
</script>
<style scoped>
.studio-shell {
  --ink: #e5eaf0;
  --muted: #8193a8;
  --stroke: #273342;
  display: grid;
  grid-template-columns: 224px 1fr 350px;
  grid-template-rows: 64px 1fr;
  height: 100%;
  background: #101923;
  color: var(--ink);
  font:
    14px Inter,
    system-ui,
    sans-serif;
}
header {
  grid-column: 1/-1;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--stroke);
  padding: 0 24px;
  gap: 40px;
  background: #121d29;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 2px;
}
.brand b {
  color: #69cfb8;
}
.brand small {
  letter-spacing: 0;
  margin-left: 12px;
  color: var(--muted);
  font-size: 11px;
}
.mark {
  font-size: 30px;
  color: #69cfb8;
}
.crumb {
  font-size: 12px;
  color: #b5c0ce;
}
.crumb span {
  margin: 0 12px;
  color: #546274;
}
.status {
  margin-left: auto;
  color: #79b9a7;
  font-size: 11px;
}
.tree,
.pi-panel {
  background: #141f2b;
  overflow: auto;
}
.tree {
  padding: 22px 16px;
  border-right: 1px solid var(--stroke);
  position: relative;
}
.section-label {
  font-size: 10px;
  letter-spacing: 1.6px;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 14px;
  display: flex;
  justify-content: space-between;
}
.tree .section-label:not(:first-child) {
  margin-top: 30px;
}
button,
select,
input,
textarea {
  font: inherit;
}
button {
  border: 1px solid var(--stroke);
  border-radius: 7px;
  background: #1d2a38;
  padding: 8px 12px;
  color: var(--ink);
  cursor: pointer;
}
button:hover {
  background: #2b3d4d;
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
.tree > button,
.tree select {
  width: 100%;
  margin-bottom: 8px;
}
.tree-item {
  display: flex;
  text-align: left;
  background: none;
  border: none;
  width: 100%;
  margin: 3px 0;
  padding: 11px 8px;
}
.tree-item span {
  margin-left: auto;
  color: var(--muted);
}
.scene {
  border: none;
  background: none;
  color: var(--muted);
  font-size: 12px;
}
.tree-footer {
  font-size: 11px;
  line-height: 1.8;
  color: #60758a;
  margin-top: 40px;
}
main {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.canvas-toolbar {
  height: 75px;
  border-bottom: 1px solid var(--stroke);
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.canvas-toolbar strong {
  font-size: 14px;
}
.canvas-toolbar small {
  display: block;
  font-size: 11px;
  color: var(--muted);
  margin-top: 6px;
}
.tools {
  display: flex;
  gap: 8px;
}
.tools button {
  font-size: 11px;
}
.canvas-area {
  position: relative;
  flex: 1;
  min-height: 0;
}
.projection {
  position: absolute;
  inset: 0;
}
.projection canvas {
  width: 100%;
  height: 100%;
  touch-action: none;
}
.empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  width: 380px;
  pointer-events: auto;
}
.empty > span {
  font-size: 64px;
  color: #4a7d7c;
}
.empty h1 {
  font-size: 25px;
  font-weight: 500;
  margin: 20px 0 14px;
}
.empty p {
  font-size: 13px;
  line-height: 1.9;
  color: var(--muted);
  margin-bottom: 25px;
}
.primary {
  background: #70d4ba;
  color: #102b26;
  border: none;
  font-weight: 600;
}
.empty small {
  display: block;
  color: #536b7e;
  font-size: 10px;
  margin-top: 18px;
}
.canvas-legend {
  position: absolute;
  bottom: 20px;
  left: 24px;
  color: #8c9bac;
  font-size: 10px;
  pointer-events: none;
}
.canvas-legend span {
  margin-left: 16px;
  color: #53687b;
}
.pi-panel {
  border-left: 1px solid var(--stroke);
  display: flex;
  flex-direction: column;
}
.pi-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 23px;
  border-bottom: 1px solid var(--stroke);
}
.pi-heading small {
  display: block;
  color: var(--muted);
  font-size: 10px;
  margin-top: 5px;
}
.pi-heading button {
  margin-left: auto;
}
.pi-mark {
  background: #253b3b;
  color: #80d8c1;
  border-radius: 12px;
  font-size: 28px;
  padding: 4px 12px;
}
.context {
  padding: 20px;
  border-bottom: 1px solid var(--stroke);
}
.context p {
  color: #8a9baf;
  font-size: 12px;
  line-height: 1.7;
}
.context small {
  font-size: 10px;
  color: #5f7489;
}
.context-chip {
  font-size: 11px;
  background: #21333c;
  padding: 7px 8px;
  margin-bottom: 6px;
  border-radius: 5px;
}
.context-chip button {
  float: right;
  padding: 0;
  border: none;
  background: none;
}
.discussion-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 25px;
}
.discussion-empty > div {
  font-size: 45px;
  color: #304e55;
}
.discussion-empty h3 {
  font-size: 14px;
  font-weight: 500;
  margin: 20px 0 12px;
}
.discussion-empty p {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.8;
}
.notice {
  font-size: 10px;
  color: #c3aa76;
  line-height: 1.8;
  background: #302b22;
  padding: 10px 15px;
  border-radius: 8px;
  margin-top: 20px;
}
.discussion-select {
  background: #172633;
  color: #b5c7d8;
  border: 1px solid #334859;
  margin: 12px;
  border-radius: 6px;
  padding: 8px;
  font-size: 11px;
  max-width: 320px;
}
.chat-history {
  flex: 1;
  overflow: auto;
  padding: 16px;
}
.chat-history article {
  margin: 10px 0;
  padding: 12px;
  border-radius: 9px;
  background: #1d2e3b;
}
.chat-history article.user {
  background: #253d3e;
}
.chat-history small {
  font-size: 10px;
  color: #80bea9;
}
.chat-history pre {
  font: 12px/1.8 system-ui;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 8px 0;
}
.result-image {
  width: 100%;
  border-radius: 8px;
}
.image-editor textarea,
.image-editor input,
.image-editor select {
  width: 100%;
  background: #101c27;
  color: #dde7ec;
  border: 1px solid #3c5266;
  border-radius: 6px;
  padding: 10px;
  margin: 8px 0;
}
.image-editor textarea {
  min-height: 150px;
}
.compare-strip {
  position: fixed;
  inset: 100px 380px 40px 240px;
  z-index: 2000;
  background: #162634;
  border: 1px solid #567;
  padding: 20px;
  display: flex;
  gap: 20px;
}
.compare-strip > button {
  position: absolute;
  right: 20px;
  top: 12px;
}
.compare-strip figure {
  flex: 1;
  min-width: 0;
  margin-top: 40px;
}
.compare-strip img {
  max-width: 100%;
  max-height: 80%;
}
.composer {
  margin: 16px;
  border: 1px solid #334859;
  border-radius: 12px;
  background: #192634;
  overflow: hidden;
}
.composer textarea {
  border: none;
  width: 100%;
  padding: 14px;
  background: transparent;
  color: var(--ink);
  min-height: 100px;
  font-size: 12px;
  resize: vertical;
}
.composer > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px;
}
.composer small {
  font-size: 10px;
  color: var(--muted);
}
.composer button {
  font-size: 10px;
}
.detail {
  position: absolute;
  right: 16px;
  top: 90px;
  bottom: 60px;
  width: 340px;
  overflow: auto;
  background: #192735;
  border: 1px solid #3c5266;
  border-radius: 12px;
  box-shadow: 0 20px 80px #0008;
  padding: 20px;
}
.detail-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--muted);
  font-size: 11px;
}
.detail-title button {
  border: none;
}
.detail h2 {
  font-size: 20px;
  margin: 14px 0;
}
.detail p {
  font-size: 13px;
  line-height: 1.8;
}
.detail pre {
  white-space: pre-wrap;
  font: 11px/1.8 system-ui;
  max-height: 350px;
  overflow: auto;
  margin: 12px 0;
  color: #bac8d7;
}
.anchor {
  font-size: 10px;
  padding: 4px;
  color: #6cc7ad;
}
.detail label {
  display: block;
}
.detail > button {
  margin-top: 16px;
  width: 100%;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: #0009;
  display: grid;
  place-items: center;
  z-index: 3000;
}
.editor {
  width: 600px;
  max-width: 90vw;
  background: #192735;
  border: 1px solid #3b5267;
  border-radius: 16px;
  padding: 26px;
}
.editor input,
.editor select,
.editor textarea {
  display: block;
  width: 100%;
  background: #101c27;
  border: 1px solid #35475a;
  color: var(--ink);
  border-radius: 7px;
  padding: 12px;
  margin-bottom: 14px;
}
.editor textarea {
  min-height: 280px;
}
.editor .section-label button {
  padding: 0 5px;
}
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #5b3033;
  padding: 16px 24px;
  border: 1px solid #a66b6b;
  border-radius: 10px;
  z-index: 4000;
  font-size: 12px;
  max-width: 700px;
}
.toast span {
  margin-left: 20px;
}
</style>
