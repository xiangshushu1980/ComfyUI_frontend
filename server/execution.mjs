// Owner: Sean. Independent fixed-Qwen executor, adapted from comfy-ops Reference runs/adapters.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { uuid, hash, requireThat } from './store.mjs'
import { compileQwen, verifyWorkflow, nativeSnapshot } from './qwen.mjs'
const exec = promisify(execFile),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const terminal = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'submission_unknown'
])
export class Execution {
  constructor(store, dataDir, comfyUrl) {
    this.store = store
    this.dataDir = dataDir
    this.comfyUrl = comfyUrl
    this.active = new Set()
    this.stopped = false
  }
  async comfy(path, body) {
    const response = await fetch(this.comfyUrl + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000)
    })
    const raw = await response.text()
    const data = raw ? JSON.parse(raw) : null
    requireThat(
      response.ok,
      'Comfy rejected: ' + JSON.stringify(data).slice(0, 500),
      response.status
    )
    return data
  }
  update(id, fields) {
    return this.store.transaction(() => {
      const r = this.store.get(id)
      return this.store.update(id, r.revision, fields)
    })
  }
  createInput(entityId, body) {
    const entity = this.store.get(entityId)
    requireThat(
      entity.kind === 'entity' && entity.type === 'character',
      'character target required'
    )
    requireThat(
      entity.revision === body.entityRevision,
      'entity basis conflict',
      409
    )
    const input = {
      prompt: body.prompt || '',
      style: body.style || '',
      seed: body.seed ?? 42,
      steps: body.steps ?? 25,
      width: body.width ?? 1536,
      height: body.height ?? 1024,
      references: body.references || []
    }
    const refs = input.references.map((id) => {
      const a = this.store.sameProject(id, entity.projectId, 'asset')
      requireThat(a.mime === 'image/png', 'PNG image reference required')
      return {
        assetId: a.id,
        hash: a.hash,
        image: `sean_entity_canvas/${a.hash}.png`
      }
    })
    compileQwen({ ...input, references: refs })
    this.revokeTargetActions(entityId)
    return this.store.create(entity.projectId, 'image_input', {
      name: entity.name + ' · 图片输入',
      targetEntityId: entityId,
      entityRevision: entity.revision,
      input: { ...input, references: refs },
      inputHash: hash({ ...input, references: refs }),
      status: 'draft',
      sourceInputId: body.sourceInputId || null
    })
  }
  revokeTargetActions(entityId) {
    for (const row of this.store.db
      .prepare("SELECT body FROM objects WHERE kind='action'")
      .all()) {
      const action = JSON.parse(row.body)
      if (
        action.status === 'authorized' &&
        this.store.get(action.inputId).targetEntityId === entityId
      )
        this.store.update(action.id, action.revision, { status: 'revoked' })
    }
  }
  preview(id) {
    const input = this.store.get(id)
    requireThat(input.kind === 'image_input', 'input required')
    return {
      ...compileQwen(input.input, `sean_entity_canvas/inputs/${id}/concept`),
      inputId: id,
      inputHash: input.inputHash,
      input: input.input
    }
  }
  verify(id, body) {
    const i = this.store.get(id),
      verified = verifyWorkflow(body, this.preview(id))
    this.store.transaction(() =>
      this.store.compatSet('verified:' + id, {
        ...verified,
        inputHash: i.inputHash
      })
    )
    return verified
  }
  authorize(id, body) {
    const i = this.store.get(id)
    requireThat(
      i.kind === 'image_input' &&
        i.revision === body.inputRevision &&
        i.inputHash === body.inputHash,
      'input authorization conflict',
      409
    )
    requireThat(
      body.authorizedOnce === true,
      'explicit once authorization required',
      403
    )
    const verified = this.store.compatGet('verified:' + id, null)
    requireThat(
      verified?.inputHash === i.inputHash,
      'UI/API snapshot must verify first',
      409
    )
    this.revokeTargetActions(i.targetEntityId)
    return this.store.create(i.projectId, 'action', {
      inputId: id,
      inputRevision: i.revision,
      inputHash: i.inputHash,
      expiresAt: Date.now() + 600000,
      status: 'authorized',
      runId: null
    })
  }
  consume(actionId) {
    let run
    const action = this.store.get(actionId)
    if (action.runId) return this.store.get(action.runId)
    this.store.transaction(() => {
      const a = this.store.get(actionId),
        input = this.store.get(a.inputId)
      requireThat(
        a.kind === 'action' &&
          a.status === 'authorized' &&
          a.expiresAt > Date.now(),
        'action expired or revoked',
        403
      )
      requireThat(
        input.revision === a.inputRevision && input.inputHash === a.inputHash,
        'action input changed',
        409
      )
      requireThat(
        !this.store.db
          .prepare("SELECT body FROM objects WHERE kind='run'")
          .all()
          .map((r) => JSON.parse(r.body))
          .some(
            (r) => !['succeeded', 'failed', 'cancelled'].includes(r.status)
          ),
        'one local active generation allowed',
        409
      )
      const checked = this.store.compatGet('verified:' + input.id, null)
      requireThat(
        checked?.inputHash === input.inputHash,
        'verified snapshot unavailable',
        409
      )
      run = this.store.create(a.projectId, 'run', {
        name: 'Qwen · 单次运行',
        actionId: a.id,
        inputId: input.id,
        targetEntityId: input.targetEntityId,
        inputHash: input.inputHash,
        inputSnapshot: input,
        graph: checked.graph,
        workflow: checked.workflow,
        apiHash: checked.apiHash,
        uiHash: checked.uiHash,
        status: 'prepared',
        executionKey: uuid(),
        clientId: 'sean-entity-' + uuid(),
        promptId: null,
        nodes: {},
        outputs: [],
        createdAt: new Date().toISOString()
      })
      this.store.update(a.id, a.revision, { status: 'consumed', runId: run.id })
    })
    void this.execute(run.id)
    return run
  }
  async resource(...args) {
    return (await exec('hive-resource', args, { timeout: 20000 })).stdout
  }
  prepareBusinessRun({
    projectId,
    targetEntityId,
    workflowRunId,
    sessionId,
    input,
    stage
  }) {
    const compiled = compileQwen(input)
    const workflow = nativeSnapshot(compiled.graph)
    return this.store.create(projectId, 'run', {
      name: stage === 'threeview' ? 'Qwen · 三视图' : 'Qwen · 概念图',
      targetEntityId,
      workflowRunId,
      sessionId,
      stage,
      inputSnapshot: { input },
      inputHash: hash(input),
      graph: compiled.graph,
      workflow,
      apiHash: compiled.apiHash,
      uiHash: hash(workflow),
      templateId: compiled.templateId,
      status: 'prepared',
      executionKey: uuid(),
      clientId: 'sean-entity-' + uuid(),
      promptId: null,
      nodes: {},
      outputs: [],
      createdAt: new Date().toISOString()
    })
  }
  async uploadReferences(run) {
    for (const ref of run.inputSnapshot.input.references) {
      const a = this.store.sameProject(ref.assetId, run.projectId, 'asset'),
        bytes = await readFile(join(this.dataDir, a.path))
      requireThat(hash(bytes) === ref.hash, 'reference bytes hash changed', 409)
      const form = new FormData()
      form.set(
        'image',
        new Blob([bytes], { type: 'image/png' }),
        `${ref.hash}.png`
      )
      form.set('subfolder', 'sean_entity_canvas')
      form.set('overwrite', 'true')
      const response = await fetch(this.comfyUrl + '/upload/image', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(30000)
      })
      const saved = await response.json()
      requireThat(
        response.ok && `${saved.subfolder}/${saved.name}` === ref.image,
        'reference upload identity mismatch'
      )
    }
  }
  async reconcile(id) {
    const run = this.store.get(id)
    const [queue, history] = await Promise.all([
      this.comfy('/queue'),
      this.comfy('/history')
    ])
    const queued = [...queue.queue_running, ...queue.queue_pending].find(
      (item) => item[3]?.entityStudio?.executionKey === run.executionKey
    )
    const historical = Object.entries(history).find(
      ([, h]) => h.prompt?.[3]?.entityStudio?.executionKey === run.executionKey
    )
    const promptId = queued?.[1] || historical?.[0]
    if (promptId) {
      this.update(id, { promptId, status: 'queued' })
      setTimeout(() => {
        void this.execute(id, true)
      }, 0)
    } else
      this.update(id, {
        status: 'submission_unknown',
        error:
          'Submission could not be disproved. Original executionKey retained; no automatic re-submit.'
      })
    return this.store.get(id)
  }
  async collect(run, entry) {
    this.update(run.id, { status: 'collecting' })
    const files = Object.entries(entry.outputs || {}).flatMap(
      ([nodeId, output]) =>
        (output.images || [])
          .filter((f) => f.type === 'output')
          .map((f) => ({ ...f, nodeId }))
    )
    requireThat(files.length > 0, 'completed without image output')
    const staged = []
    await mkdir(join(this.dataDir, 'media'), { recursive: true })
    for (const f of files) {
      const q = new URLSearchParams({
        filename: f.filename,
        subfolder: f.subfolder || '',
        type: 'output'
      })
      const response = await fetch(this.comfyUrl + '/view?' + q)
      requireThat(response.ok, 'output collection failed')
      const bytes = Buffer.from(await response.arrayBuffer())
      requireThat(
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        'output is not PNG'
      )
      const digest = hash(bytes),
        relative = 'media/' + digest + '.png',
        temporary = join(this.dataDir, 'media', uuid() + '.tmp')
      await writeFile(temporary, bytes)
      await rename(temporary, join(this.dataDir, relative))
      staged.push({
        file: f,
        hash: digest,
        path: relative,
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20)
      })
    }
    this.store.transaction(() => {
      const current = this.store.get(run.id)
      const existing = this.store
        .list(run.projectId, 'asset')
        .filter((a) => a.runId === run.id)
      const assets = existing.length
        ? existing
        : staged.map((s) =>
            this.store.create(run.projectId, 'asset', {
              name: 'Qwen 候选',
              runId: run.id,
              nodeId: s.file.nodeId,
              hash: s.hash,
              path: s.path,
              mime: 'image/png',
              width: s.width,
              height: s.height,
              inputId: run.inputId,
              sourceAssetIds: run.inputSnapshot.input.references.map(
                (r) => r.assetId
              ),
              inputHash: run.inputHash
            })
          )
      this.store.update(run.id, current.revision, {
        status: 'succeeded',
        outputs: assets.map((a) => a.id),
        completedAt: new Date().toISOString()
      })
    })
    // Clean only this run's proven outputs after durable recovery.
    const root = resolve(
        process.env.COMFY_OUTPUT_DIR || '/home/sean/projects/ComfyUI/output'
      ),
      expected = resolve(root, 'sean_entity_canvas', 'runs', run.id) + sep
    for (const s of staged) {
      const path = resolve(root, s.file.subfolder || '', s.file.filename)
      if (path.startsWith(expected)) await unlink(path).catch(() => {})
    }
  }
  async execute(id, recovery = false) {
    if (this.active.has(id) || this.stopped) return
    this.active.add(id)
    let lease,
      heartbeat,
      socket,
      sampler,
      peakVramMb = null
    const sample = async () => {
      try {
        const r = JSON.parse(
          await this.resource(
            'resources',
            '--json',
            '--refresh',
            '--processes',
            '0'
          )
        )
        const n = r.resources?.['gpu:0']?.metrics?.memoryUsedMb
        if (Number.isFinite(n)) peakVramMb = Math.max(peakVramMb || 0, n)
      } catch {}
    }
    try {
      let run = this.store.get(id)
      if (terminal.has(run.status)) return
      if (!run.promptId) {
        if (
          recovery &&
          ['submitting', 'submission_unknown'].includes(run.status)
        ) {
          await this.reconcile(id)
          return
        }
        this.update(id, { status: 'waiting_resource' })
        while (!this.stopped) {
          requireThat(
            this.store.get(id).status !== 'cancelled',
            'run cancelled',
            409
          )
          const q = await this.comfy('/queue')
          const uncertain = this.store.db
            .prepare("SELECT body FROM objects WHERE kind='run'")
            .all()
            .map((r) => JSON.parse(r.body))
            .some(
              (r) =>
                r.id !== id &&
                ['submitting', 'submission_unknown'].includes(r.status)
            )
          if (uncertain) {
            await sleep(3000)
            continue
          }
          if (q.queue_running.length || q.queue_pending.length) {
            await sleep(3000)
            continue
          }
          try {
            await this.resource('occupancy')
            const result = await this.resource(
              'lease',
              'acquire',
              '--owner',
              'entity-studio:' + id,
              '--resources',
              'gpu:0',
              '--pid',
              String(process.pid),
              '--ttl',
              '600000'
            )
            lease = result.match(/租约\s+(\S+)\s+已授予/)?.[1]
            if (lease) break
          } catch {}
          await sleep(3000)
        }
        requireThat(lease, 'resource lease unavailable')
        heartbeat = setInterval(() => {
          void this.resource(
            'lease',
            'heartbeat',
            lease,
            '--ttl',
            '600000'
          ).catch((e) => this.update(id, { connectionError: e.message }))
        }, 30000)
        await sample()
        sampler = setInterval(() => {
          void sample()
        }, 5000)
        const q = await this.comfy('/queue')
        requireThat(
          q.queue_running.length === 0 && q.queue_pending.length === 0,
          'shared queue changed before submission',
          409
        )
        run = this.store.get(id)
        requireThat(run.status !== 'cancelled', 'run cancelled', 409)
        this.update(id, { status: 'preparing' })
        await this.uploadReferences(run)
        const graph = structuredClone(run.graph),
          workflow = structuredClone(run.workflow),
          prefix = `sean_entity_canvas/runs/${id}/concept`
        graph['9'].inputs.filename_prefix = prefix
        const save = workflow.nodes.find((n) => String(n.id) === '9')
        requireThat(
          save?.widgets_values?.length,
          'SaveImage UI binding missing'
        )
        save.widgets_values[0] = prefix
        if (save.widgets_values_named)
          save.widgets_values_named.filename_prefix = prefix
        run = this.update(id, {
          status: 'submitting',
          graph,
          workflow,
          apiHash: hash(graph),
          uiHash: hash(workflow)
        })
        try {
          const result = await this.comfy('/prompt', {
            prompt: graph,
            client_id: run.clientId,
            extra_data: {
              entityStudio: {
                owner: 'Sean',
                runId: id,
                executionKey: run.executionKey
              },
              extra_pnginfo: { workflow, owner: 'Sean' }
            }
          })
          requireThat(result.prompt_id, 'missing prompt identity')
          run = this.update(id, {
            promptId: result.prompt_id,
            status: 'queued'
          })
        } catch (e) {
          if (e.status && e.status < 500) {
            this.update(id, { status: 'failed', error: e.message })
            return
          }
          this.update(id, { status: 'submission_unknown', error: e.message })
          await this.reconcile(id)
          return
        }
      }
      run = this.store.get(id)
      socket = new WebSocket(
        this.comfyUrl.replace(/^http/, 'ws') +
          '/ws?clientId=' +
          encodeURIComponent(run.clientId)
      )
      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return
        try {
          const e = JSON.parse(event.data),
            d = e.data || {}
          if (d.prompt_id && d.prompt_id !== run.promptId) return
          if (!d.prompt_id) return
          if (
            [
              'executing',
              'progress',
              'execution_cached',
              'executed',
              'execution_error'
            ].includes(e.type)
          ) {
            const current = this.store.get(id),
              nodes = { ...current.nodes }
            if (d.node) nodes[d.node] = { event: e.type, ...d }
            for (const n of d.nodes || [])
              nodes[n] = { event: 'execution_cached' }
            this.update(id, { nodes })
          }
        } catch {}
      }
      while (!this.stopped) {
        run = this.store.get(id)
        if (terminal.has(run.status)) break
        const history = await this.comfy(
            '/history/' + encodeURIComponent(run.promptId)
          ),
          entry = history[run.promptId]
        if (entry?.status?.status_str === 'error') {
          this.update(id, {
            status: 'failed',
            error: JSON.stringify(entry.status.messages)
          })
          break
        }
        if (entry?.status?.completed) {
          await this.collect(run, entry)
          break
        }
        const q = await this.comfy('/queue')
        const running = q.queue_running.some((i) => i[1] === run.promptId),
          queued = q.queue_pending.some((i) => i[1] === run.promptId)
        const status = running ? 'running' : queued ? 'queued' : 'observing'
        if (run.status !== status) this.update(id, { status })
        await sleep(2000)
      }
    } catch (e) {
      const run = this.store.get(id)
      if (!terminal.has(run.status))
        this.update(id, {
          status: run.promptId ? 'observing' : 'failed',
          error: e.message
        })
    } finally {
      clearInterval(heartbeat)
      clearInterval(sampler)
      socket?.close()
      if (lease) {
        await sample()
        await this.resource(
          'observe',
          '--resource',
          'gpu:0',
          '--job',
          'entity-studio:' + id,
          '--metrics',
          JSON.stringify({ peakVramMb, status: this.store.get(id).status })
        ).catch(() => {})
        await this.resource('lease', 'release', lease).catch(() => {})
      }
      this.active.delete(id)
      const pending = this.store.get(id)
      if (!this.stopped && pending.promptId && pending.status === 'observing')
        setTimeout(() => void this.execute(id, true), 3000).unref()
    }
  }
  recover() {
    for (const row of this.store.db
      .prepare("SELECT body FROM objects WHERE kind='run'")
      .all()) {
      const run = JSON.parse(row.body)
      if (run.promptId && !terminal.has(run.status))
        void this.execute(run.id, true)
      else if (
        run.workflowRunId &&
        ['prepared', 'waiting_resource', 'preparing'].includes(run.status)
      )
        void this.execute(run.id, true)
      else if (['submitting', 'submission_unknown'].includes(run.status))
        void this.reconcile(run.id)
    }
  }
}
