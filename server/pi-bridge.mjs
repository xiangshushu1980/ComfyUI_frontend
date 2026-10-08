// Owner: Sean. Native PiWeb bridge with durable send/create uncertainty.
import { readFileSync } from 'node:fs'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { requireThat, hash } from './store.mjs'
import { propose } from './domain.mjs'
export class PiBridge {
  constructor(
    store,
    dataDir,
    url = process.env.PI_WEB_URL || 'http://127.0.0.1:30141',
    apiUrl = process.env.STUDIO_API_URL || 'http://127.0.0.1:4318'
  ) {
    this.store = store
    this.dataDir = dataDir
    this.url = url
    this.apiUrl = apiUrl
    this.workspaceLocks = new Map()
  }
  async request(path, body) {
    const r = await fetch(this.url + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000)
    })
    const data = await r.json()
    requireThat(r.ok, data.error || 'PI request failed', r.status)
    return data
  }
  async prepareWorkspace(discussionId) {
    const d = this.store.get(discussionId)
    const prior = this.workspaceLocks.get(d.projectId) || Promise.resolve()
    let unlock
    const lock = new Promise((resolve) => (unlock = resolve))
    this.workspaceLocks.set(d.projectId, lock)
    await prior
    try {
      return await this.prepareWorkspaceLocked(discussionId)
    } finally {
      unlock()
      if (this.workspaceLocks.get(d.projectId) === lock)
        this.workspaceLocks.delete(d.projectId)
    }
  }
  async prepareWorkspaceLocked(discussionId) {
    const d = this.store.get(discussionId)
    requireThat(d.kind === 'discussion', 'discussion required')
    const project = this.store.project(d.projectId)
    const sessionName = d.name || 'Agent 对话'
    const bindings = this.store.list(d.projectId, 'pi_binding')
    let binding = bindings.find((b) => b.discussionId === d.id)
    const slug = (value) =>
      value
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'workspace'
    const projectWorkspace = join(
      this.dataDir,
      'projects',
      d.projectId,
      'agent-workspace',
      `${slug(project.name)}--${d.projectId.slice(0, 8)}`
    )
    const cwd = binding?.cwd || projectWorkspace
    const sharedProjectWorkspace = cwd === projectWorkspace
    await mkdir(join(cwd, '.pi/extensions'), { recursive: true })
    await mkdir(join(cwd, '.pi/skills/chapter-entity-extraction'), {
      recursive: true
    })
    await copyFile(
      new URL('../pi/entity-extension.mjs', import.meta.url),
      join(cwd, '.pi/extensions/entity-studio.js')
    )
    await copyFile(
      new URL(
        '../pi/skills/chapter-entity-extraction/SKILL.md',
        import.meta.url
      ),
      join(cwd, '.pi/skills/chapter-entity-extraction/SKILL.md')
    )
    let capability =
      binding?.capability ||
      bindings.find((b) => b.cwd === projectWorkspace)?.capability
    const configPath = join(cwd, '.entity-studio-binding.json')
    if (binding) {
      try {
        capability ||= JSON.parse(readFileSync(configPath, 'utf8')).capability
      } catch {
        // A missing or stale config is repaired below from the durable binding.
      }
    }
    capability ||= randomBytes(32).toString('hex')
    await writeFile(
      configPath,
      JSON.stringify({
        owner: 'Sean',
        apiUrl: this.apiUrl,
        projectId: d.projectId,
        capability,
        projectName: project.name,
        ...(!sharedProjectWorkspace ? { discussionId: d.id, sessionName } : {})
      }),
      { mode: 0o600 }
    )
    await writeFile(
      join(cwd, 'AGENTS.md'),
      `Owner: Sean. Product creation workspace for ${project.name}. Workflow conversations are separate named sessions. Only entity_studio business tools are allowed. Human adoption, one-use generation and appearance confirmation remain separate. No software development or Task Center here.\n`
    )
    if (binding) return binding
    binding = this.store.transaction(() =>
      this.store.create(d.projectId, 'pi_binding', {
        discussionId: d.id,
        cwd,
        capability,
        bindingVersion: 1,
        status: 'prepared',
        sessionId: null,
        guardVersion: null
      })
    )
    return binding
  }
  publicBinding(b) {
    const { capability, cwd, ...safe } = b
    return {
      ...safe,
      workspace: cwd,
      workspaceId: hash(cwd).slice(0, 16),
      workspaceLabel: `agent-workspace/${basename(cwd)}`,
      piWebWorkspaceUrl: `${process.env.PI_WEB_PUBLIC_URL || this.url}/?cwd=${encodeURIComponent(cwd)}`,
      piWebUrl: b.sessionId
        ? `${process.env.PI_WEB_PUBLIC_URL || this.url}/?session=${encodeURIComponent(b.sessionId)}`
        : null
    }
  }
  async nativeSessionForBinding(binding) {
    const catalog = await this.request('/api/sessions')
    const session = catalog.sessions?.find(
      (item) => item.id === binding.sessionId
    )
    if (session && session.cwd !== binding.cwd)
      throw Object.assign(
        new Error(
          `PiWeb session workspace mismatch: expected ${binding.cwd}, found ${session.cwd || 'unknown'}`
        ),
        { status: 409 }
      )
    return session || null
  }
  async syncProject(projectId) {
    this.store.project(projectId)
    const catalog = await this.request('/api/sessions')
    const nativeSessions = catalog.sessions || []
    const bindings = this.store.list(projectId, 'pi_binding')
    const workspaceDirs = new Set(bindings.map((binding) => binding.cwd))
    const boundNativeIds = new Set()
    let foundBindings = 0
    let resetEmpty = 0
    let missingWithHistory = 0
    let uncertainCreation = 0
    let workspaceMismatches = 0
    for (const binding of bindings) {
      if (!binding.sessionId) continue
      const native = nativeSessions.find(
        (session) => session.id === binding.sessionId
      )
      if (native) {
        if (native.cwd !== binding.cwd) {
          workspaceMismatches++
          continue
        }
        foundBindings++
        boundNativeIds.add(native.id)
        continue
      }
      if (['creating', 'creation_unknown'].includes(binding.status)) {
        uncertainCreation++
        continue
      }
      const hasTurns = this.store
        .list(projectId, 'pi_turn')
        .some((turn) => turn.discussionId === binding.discussionId)
      const current = this.store.get(binding.id)
      if (!hasTurns) {
        this.store.transaction(() =>
          this.store.update(current.id, current.revision, {
            sessionId: null,
            guardVersion: null,
            status: 'prepared',
            error: null,
            previousEmptySessionId: current.sessionId
          })
        )
        resetEmpty++
      } else {
        if (current.status !== 'session_missing')
          this.store.transaction(() =>
            this.store.update(current.id, current.revision, {
              status: 'session_missing',
              error:
                'PiWeb session is absent from the native session catalog; history retained.'
            })
          )
        missingWithHistory++
      }
    }
    const workspaceSessions = nativeSessions.filter((session) =>
      workspaceDirs.has(session.cwd)
    )
    return {
      checkedBindings: bindings.length,
      foundBindings,
      resetEmpty,
      missingWithHistory,
      uncertainCreation,
      workspaceMismatches,
      workspaceSessionCount: workspaceSessions.length,
      unboundWorkspaceSessions: workspaceSessions.filter(
        (session) => !boundNativeIds.has(session.id)
      ).length
    }
  }
  directInput(capability, body) {
    const binding = this.authenticate(capability, body.sessionId)
    const d = this.store.get(binding.discussionId)
    return this.store.transaction(() => {
      requireThat(
        !this.store
          .list(d.projectId, 'pi_turn')
          .some(
            (t) =>
              t.discussionId === d.id &&
              [
                'prepared',
                'sending',
                'received',
                'accepted',
                'delivery_unknown'
              ].includes(t.status)
          ),
        'session already has active or uncertain turn',
        409
      )
      const workflow = this.store
        .list(d.projectId, 'workflow_session')
        .find((s) => s.discussionId === d.id)
      const context = workflow
        ? this.workflows.context(workflow.id).objects
        : d.links || []
      for (const c of context)
        requireThat(
          this.store.sameProject(c.id, d.projectId).revision === c.revision,
          'context revision conflict',
          409
        )
      const action = d.pendingActionId
        ? this.store.get(d.pendingActionId)
        : null
      const turn = this.store.create(d.projectId, 'pi_turn', {
        discussionId: d.id,
        text: body.text,
        context,
        contextHash: hash(context),
        receipt: randomBytes(32).toString('hex'),
        actionId:
          action?.status === 'authorized' && action.expiresAt > Date.now()
            ? action.id
            : null,
        status: 'received',
        origin: 'piweb',
        workflowSessionId: workflow?.id || null
      })
      if (d.pendingActionId)
        this.store.update(d.id, d.revision, { pendingActionId: null })
      return turn
    })
  }
  directEnd(capability, body) {
    const binding = this.authenticate(capability, body.sessionId)
    const turn = this.store.sameProject(
      body.turnId,
      binding.projectId,
      'pi_turn'
    )
    requireThat(
      turn.receipt === body.receipt &&
        turn.discussionId === binding.discussionId,
      'invalid receipt',
      403
    )
    return this.store.transaction(() =>
      this.store.update(turn.id, turn.revision, { status: 'finished' })
    )
  }
  async launch(discussionId, body) {
    let b = await this.prepareWorkspace(discussionId)
    if (b.sessionId) {
      const nativeSession = await this.nativeSessionForBinding(b)
      if (!nativeSession) {
        const hasTurns = this.store
          .list(b.projectId, 'pi_turn')
          .some((turn) => turn.discussionId === discussionId)
        requireThat(
          !hasTurns,
          'PiWeb session is missing, but this Studio conversation has history. Create a new Workflow conversation to continue safely.',
          409
        )
        requireThat(
          !['creating', 'creation_unknown'].includes(b.status),
          'PiWeb session creation is uncertain; synchronize before retrying',
          409
        )
        const current = this.store.get(b.id)
        b = this.store.transaction(() =>
          this.store.update(current.id, current.revision, {
            sessionId: null,
            guardVersion: null,
            status: 'prepared',
            error: null,
            previousEmptySessionId: current.sessionId
          })
        )
        return this.launch(discussionId, body)
      }
      let tools
      try {
        tools = await this.request(`/api/agent/${b.sessionId}`, {
          type: 'get_tools'
        })
      } catch (e) {
        // PiWeb trust reload destroys unsaved empty sessions. Recreate only if no turn was ever sent.
        if (
          e.status !== 404 ||
          this.store
            .list(b.projectId, 'pi_turn')
            .some((t) => t.discussionId === discussionId)
        )
          throw e
        b = this.store.transaction(() =>
          this.store.update(b.id, b.revision, {
            status: 'prepared',
            sessionId: null,
            guardVersion: null,
            previousEmptySessionId: b.sessionId
          })
        )
        return this.launch(discussionId, body)
      }
      const current = this.store.get(b.id)
      requireThat(
        current.guardVersion === 1 &&
          JSON.stringify(tools).includes('entity_studio'),
        'Trust the exact workspace in PiWeb, then reload this native session; business tools are not verified',
        428
      )
      return this.ensureNavigable(current)
    }
    requireThat(
      !['creating', 'creation_unknown'].includes(b.status),
      'PI creation uncertain; reconcile original binding before retry',
      409
    )
    // An empty native session registers its workspace; no model prompt until guard verified.
    this.store.transaction(() =>
      this.store.update(b.id, b.revision, {
        status: 'creating',
        launchRequestId: body.requestId
      })
    )
    try {
      const created = await this.request('/api/agent/new', {
        cwd: b.cwd,
        type: 'ensure_session',
        toolNames: ['read']
      })
      const current = this.store.get(b.id)
      requireThat(
        !current.sessionId || current.sessionId === created.sessionId,
        'native session identity mismatch',
        409
      )
      const attached = this.store.transaction(() =>
        this.store.update(b.id, current.revision, {
          sessionId: created.sessionId,
          status: 'creating',
          error: null,
          model: created.model
        })
      )
      const tools = await this.request(`/api/agent/${created.sessionId}`, {
        type: 'get_tools'
      })
      requireThat(
        JSON.stringify(tools).includes('entity_studio'),
        'Native extension guard not verified',
        503
      )
      const updated = this.store.transaction(() =>
        this.store.update(attached.id, attached.revision, {
          status: 'bound',
          guardVersion: 1,
          error: null
        })
      )
      const discussion = this.store.get(discussionId)
      try {
        await this.request(`/api/agent/${created.sessionId}`, {
          type: 'set_session_name',
          name: discussion.name || 'Agent 对话'
        })
      } catch {
        // Session labels are best-effort; the shared workspace name stays readable.
      }
      return this.ensureNavigable(updated)
    } catch (e) {
      const current = this.store.get(b.id)
      this.store.transaction(() =>
        this.store.update(b.id, current.revision, {
          status: current.sessionId ? 'guard_unverified' : 'creation_unknown',
          error: e.message
        })
      )
      throw e
    }
  }
  async ensureNavigable(binding) {
    const session = await this.nativeSessionForBinding(binding)
    if (!session) {
      // Pi Web deliberately excludes idle transient sessions. A recorded,
      // guarded initialization turn makes the exact session navigable.
      await this.send(binding.discussionId, {
        requestId: `initialize:${binding.sessionId}`,
        text: '初始化当前业务 Workflow 会话：读取 context，简短说明当前目标及等待用户指示。此初始化不调用任何写操作、不生成、不采用、不确认。'
      })
      for (let attempt = 0; attempt < 40; attempt++) {
        const next = await this.nativeSessionForBinding(binding)
        if (next) return this.publicBinding(this.store.get(binding.id))
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      throw Object.assign(
        new Error(
          'Exact Pi Web session is not yet navigable; retry after initialization completes'
        ),
        { status: 503 }
      )
    }
    return this.publicBinding(binding)
  }
  authenticate(capability, sessionId, discussionId) {
    const row = this.store.db
      .prepare("SELECT body FROM objects WHERE kind='pi_binding'")
      .all()
      .map((r) => JSON.parse(r.body))
      .find(
        (b) =>
          b.capability === capability &&
          b.sessionId === sessionId &&
          (!discussionId || b.discussionId === discussionId)
      )
    requireThat(row, 'invalid session capability', 403)
    return row
  }
  bind(capability, body) {
    const bindings = this.store.db
      .prepare("SELECT body FROM objects WHERE kind='pi_binding'")
      .all()
      .map((r) => JSON.parse(r.body))
      .filter((b) => b.capability === capability)
    if (!body.discussionId) {
      const projectBindings = bindings.filter(
        (b) => b.projectId === body.projectId
      )
      requireThat(projectBindings.length, 'invalid project capability', 403)
      const row = projectBindings.find((b) => b.sessionId === body.sessionId)
      if (!row) return { ok: true, projectId: body.projectId }
      requireThat(body.guardVersion === 1, 'invalid guard')
      const updated = this.store.transaction(() =>
        this.store.update(row.id, row.revision, {
          guardVersion: 1,
          status: 'bound'
        })
      )
      const discussion = this.store.get(row.discussionId)
      return {
        ...updated,
        sessionName: discussion.name || 'Agent 对话'
      }
    }
    const row = bindings.find((b) => b.discussionId === body.discussionId)
    requireThat(
      row &&
        row.discussionId === body.discussionId &&
        row.bindingVersion === body.bindingVersion &&
        ['creating', 'bound', 'guard_unverified'].includes(row.status),
      'binding not creating',
      403
    )
    requireThat(
      !row.sessionId || row.sessionId === body.sessionId,
      'session conflict',
      403
    )
    requireThat(body.guardVersion === 1, 'invalid guard')
    return this.store.transaction(() =>
      this.store.update(row.id, row.revision, {
        sessionId: body.sessionId,
        guardVersion: 1,
        status: 'bound'
      })
    )
  }
  receipt(capability, body) {
    const binding = this.authenticate(capability, body.sessionId)
    const turn = this.store.sameProject(
      body.turnId,
      binding.projectId,
      'pi_turn'
    )
    requireThat(
      turn.discussionId === binding.discussionId &&
        turn.receipt === body.receipt,
      'invalid turn receipt',
      403
    )
    requireThat(
      ['sending', 'accepted', 'received'].includes(turn.status),
      'turn is not active',
      409
    )
    return this.store.transaction(() =>
      this.store.update(turn.id, turn.revision, {
        status: 'received',
        receivedAt: new Date().toISOString()
      })
    )
  }
  tool(capability, body) {
    const binding = this.authenticate(capability, body.sessionId),
      turn = this.store.sameProject(body.turnId, binding.projectId, 'pi_turn')
    requireThat(
      turn.receipt === body.receipt &&
        turn.discussionId === binding.discussionId &&
        ['received', 'accepted'].includes(turn.status),
      'invalid active turn',
      403
    )
    const args = body.args || {}
    const workflowSession = this.store
      .list(turn.projectId, 'workflow_session')
      .find((s) => s.discussionId === turn.discussionId)
    if (body.tool === 'workflow_operation') {
      requireThat(workflowSession, 'enter a business Workflow first', 403)
      return this.workflows.operate(
        workflowSession.id,
        args.operation,
        args.parameters || {}
      )
    }
    if (body.tool === 'read_chapter') {
      const chapter = this.store.sameProject(args.id, turn.projectId, 'chapter')
      const source = this.store.sameProject(
        chapter.sourceId,
        turn.projectId,
        'source'
      )
      const offset = args.offset ?? 0
      requireThat(
        Number.isInteger(offset) &&
          offset >= 0 &&
          offset <= chapter.end - chapter.start,
        'invalid chapter offset'
      )
      const end = Math.min(chapter.end, chapter.start + offset + 12000)
      const result = {
        chapter: {
          id: chapter.id,
          revision: chapter.revision,
          name: chapter.name
        },
        sourceId: source.id,
        sourceRevision: source.revision,
        anchorIds: chapter.anchorIds,
        offset,
        nextOffset: end < chapter.end ? offset + 12000 : null,
        text: source.text.slice(chapter.start + offset, end)
      }
      this.store.transaction(() =>
        this.store.create(turn.projectId, 'read_audit', {
          turnId: turn.id,
          objectId: chapter.id,
          revision: chapter.revision,
          contentHash: hash(result),
          tool: 'read_chapter'
        })
      )
      return result
    }
    if (body.tool === 'submit_action') {
      requireThat(
        turn.actionId === args.actionId,
        'action not authorized for this turn',
        403
      )
      return this.execution.consume(args.actionId)
    }
    if (body.tool === 'preview')
      return this.execution.preview(
        this.store.sameProject(args.inputId, turn.projectId, 'image_input').id
      )
    if (body.tool === 'get_run') {
      const run = this.store.sameProject(args.runId, turn.projectId)
      requireThat(['run', 'workflow_run'].includes(run.kind), 'Run required')
      return run.kind === 'workflow_run'
        ? {
            ...run,
            children: (run.childRunIds || []).map((id) =>
              this.store.sameProject(id, turn.projectId, 'run')
            )
          }
        : run
    }
    if (body.tool === 'view_image') {
      const audits = this.store
        .list(turn.projectId, 'request_audit')
        .filter((a) => a.turnId === turn.id)
      requireThat(
        audits.at(-1)?.modelInput?.includes('image'),
        'Current PI model is not verified for vision',
        422
      )
      const asset = this.store.sameProject(
        args.assetId,
        turn.projectId,
        'asset'
      )
      const bytes = readFileSync(join(this.dataDir, asset.path))
      requireThat(hash(bytes) === asset.hash, 'asset bytes hash changed')
      this.store.transaction(() =>
        this.store.create(turn.projectId, 'read_audit', {
          turnId: turn.id,
          assetId: asset.id,
          hash: asset.hash,
          view: 'original',
          tool: 'view_image'
        })
      )
      return {
        assetId: asset.id,
        hash: asset.hash,
        view: 'original',
        content: [
          {
            type: 'image',
            data: bytes.toString('base64'),
            mimeType: asset.mime
          },
          {
            type: 'text',
            text: JSON.stringify({
              assetId: asset.id,
              hash: asset.hash,
              view: 'original'
            })
          }
        ]
      }
    }
    if (body.tool === 'catalog')
      return {
        tools: {
          workflow_operation: {
            operation:
              'structure_novel | refine_chapters | propose_entities | add_reference | select_references | generate_concepts | prepare_appearance_adjustment | generate_threeview | set_voice_design',
            parameters: {
              requestId: 'unique key',
              chapterId: 'propose_entities: chapter UUID',
              items:
                'propose_entities: same exact entity/relation schemas as propose; chapter anchor sources REQUIRED',
              type: 'add_reference: text|image',
              text: 'reference text',
              assetId: 'reference image asset UUID',
              prompt:
                'required for generate_concepts and prepare_appearance_adjustment; generate_threeview defaults to the fixed template prompt',
              count:
                '1..4 images total within the human grant; default 2 per prepared image Run',
              seed: 'optional integer, default 42',
              steps: 'optional integer 1..50, default 25',
              referenceIds:
                'optional ordered entity image asset UUIDs for this Run only; manually-added reference images and prior concept/appearance images are valid; each Run has its own selection',
              voiceDescription:
                'set_voice_design: text-designed character voice direction; required, max 1200 chars',
              sampleText:
                'set_voice_design: short sentence spoken in the sample; required, max 1200 chars',
              language: 'voice design: zh (default) or en',
              selectReferences:
                'select_references: referenceIds is the explicit ordered subset of this character’s image references',
              sourceId: 'structure_novel: existing source UUID',
              sourceRevision:
                'refine_chapters: revision returned by read_source',
              chapters:
                'refine_chapters: ordered [{name,startAnchorId,endAnchorId,brief?}]; cover every source anchor exactly once'
            },
            scope: workflowSession?.workflowId || 'enter Workflow first'
          },
          read_chapter: {
            id: 'chapter UUID',
            offset: 'optional text offset; page size 12000'
          },
          submit_action: { actionId: 'current turn authorized action only' },
          preview: { inputId: 'UUID' },
          get_run: {
            runId:
              'Workflow Run or child Run UUID; business result includes child states'
          },
          view_image: { assetId: 'UUID; requires verified image model' },
          context: {},
          read_source: {
            id: 'sourceId',
            anchorId: 'optional paragraph ID; omit for paged anchor index',
            offset: 'optional anchor index offset; pages of 100'
          },
          read_entity: { id: 'objectId', revision: 1 },
          load_method: { name: 'qwen-concept' },
          propose: {
            requestId: 'unique request key',
            basis: [{ id: 'existing object UUID', revision: 1 }],
            items: [
              {
                key: 'unique candidate key REQUIRED',
                kind: 'entity',
                type: 'character | location | prop',
                name: 'name',
                description: 'global facts',
                sources: [{ sourceId: 'UUID', revision: 1, anchorId: 'P3' }]
              },
              {
                key: 'unique relation key REQUIRED',
                kind: 'relation',
                from: 'candidate key or adopted entity UUID',
                to: 'candidate key or adopted entity UUID',
                description: 'relationship',
                sources: [{ sourceId: 'UUID', revision: 1, anchorId: 'P4' }]
              }
            ]
          }
        }
      }
    if (body.tool === 'context')
      return {
        workflow: workflowSession
          ? this.workflows.context(workflowSession.id)
          : null,
        goal: this.store.get(turn.discussionId).goal,
        context: turn.context,
        project: this.store.project(turn.projectId),
        index: this.store
          .list(turn.projectId)
          .filter((o) => !['pi_binding', 'pi_turn'].includes(o.kind))
          .map((o) => ({
            id: o.id,
            kind: o.kind,
            name: o.name,
            revision: o.revision
          })),
        actionId: turn.actionId || null
      }
    if (body.tool === 'read_source' || body.tool === 'read_entity') {
      const o = this.store.sameProject(args.id, turn.projectId)
      requireThat(
        !['pi_binding', 'pi_turn'].includes(o.kind),
        'private runtime object',
        403
      )
      const obj = args.revision ? this.store.get(o.id, args.revision) : o
      requireThat(
        body.tool !== 'read_entity' || o.kind !== 'source',
        'read novel via source anchors or read_chapter'
      )
      let result = obj
      if (body.tool === 'read_source') {
        requireThat(o.kind === 'source', 'source required')
        if (args.anchorId) {
          const a = o.anchors.find((a) => a.id === args.anchorId)
          requireThat(a, 'anchor not found')
          result = {
            id: o.id,
            revision: o.revision,
            anchor: a,
            text: o.text.slice(a.start, a.end)
          }
        } else {
          const offset = args.offset ?? 0
          requireThat(
            Number.isInteger(offset) &&
              offset >= 0 &&
              offset <= o.anchors.length,
            'invalid source anchor offset'
          )
          const pageSize = 100
          const anchors = o.anchors
            .slice(offset, offset + pageSize)
            .map(({ id, start, end }) => ({ id, start, end }))
          result = {
            id: o.id,
            name: o.name,
            revision: o.revision,
            offset,
            nextOffset:
              offset + anchors.length < o.anchors.length
                ? offset + anchors.length
                : null,
            anchors
          }
        }
      }
      this.store.transaction(() =>
        this.store.create(turn.projectId, 'read_audit', {
          turnId: turn.id,
          objectId: o.id,
          revision: obj.revision,
          contentHash: hash(result),
          tool: body.tool
        })
      )
      return result
    }
    if (body.tool === 'load_method') {
      const method = {
        owner: 'Sean',
        name: 'qwen-concept',
        version: 1,
        text: 'Use the fixed Qwen Image 2.1 concept template. Clearly distinguish global identity from scene-only state. Preserve reference order. Business Workflow operations automatically bind immutable target/reference snapshots within the finite Workflow grant. Concepts may run in parallel and await formal appearance confirmation; the authorized fixed ThreeView then uses the selected appearance automatically. Legacy submit_action remains one-use. Never confirm a main appearance.'
      }
      this.store.transaction(() =>
        this.store.create(turn.projectId, 'read_audit', {
          turnId: turn.id,
          method: method.name,
          version: 1,
          contentHash: hash(method)
        })
      )
      return method
    }
    if (body.tool === 'propose')
      requireThat(
        !workflowSession,
        'use workflow_operation/propose_entities with chapterId',
        403
      )
    if (body.tool === 'propose')
      return this.store.write(
        'pi-propose:' + turn.id,
        { requestId: args.requestId || hash(args), ...args },
        () =>
          propose(this.store, turn.projectId, {
            ...args,
            discussionId: turn.discussionId
          })
      )
    requireThat(false, 'tool unavailable or not authorized', 403)
  }
  binding(discussionId) {
    const d = this.store.get(discussionId)
    requireThat(d.kind === 'discussion', 'discussion required')
    const b = this.store
      .list(d.projectId, 'pi_binding')
      .find((b) => b.discussionId === discussionId)
    requireThat(b?.sessionId && b.guardVersion === 1, 'PI not bound', 503)
    return b
  }
  async messages(discussionId) {
    const b = this.binding(discussionId)
    const data = await this.request(`/api/sessions/${b.sessionId}`)
    return {
      sessionId: b.sessionId,
      snapshotRevision: data.snapshotRevision,
      context: data.context,
      entryIds: data.entryIds
    }
  }
  async stop(discussionId) {
    const b = this.binding(discussionId)
    const result = await this.request(`/api/agent/${b.sessionId}`, {
      type: 'abort'
    })
    for (const t of this.store
      .list(b.projectId, 'pi_turn')
      .filter(
        (t) =>
          t.discussionId === discussionId &&
          ['prepared', 'sending', 'accepted', 'received'].includes(t.status)
      )) {
      this.store.transaction(() => {
        if (t.actionId) {
          const a = this.store.get(t.actionId)
          if (a.status === 'authorized')
            this.store.update(a.id, a.revision, { status: 'revoked' })
        }
        this.store.update(t.id, t.revision, { status: 'stopped' })
      })
    }
    return result
  }
  async observe(turnId) {
    const turn = this.store.get(turnId),
      b = this.binding(turn.discussionId)
    try {
      const response = await fetch(
        this.url + `/api/agent/${b.sessionId}/events`,
        { signal: AbortSignal.timeout(600000) }
      )
      requireThat(response.ok, 'PI event subscription unavailable', 503)
      let buffer = ''
      const reader = response.body.getReader(),
        decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let end
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const line = chunk.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          let event
          try {
            event = JSON.parse(line.slice(5))
          } catch {
            continue
          }
          if (event.type === 'agent_end' || event.type === 'agent_settled') {
            const current = this.store.get(turnId)
            if (['accepted', 'received', 'sending'].includes(current.status))
              this.store.transaction(() =>
                this.store.update(turnId, current.revision, {
                  status: 'finished'
                })
              )
            await reader.cancel()
            return
          }
        }
      }
    } catch (e) {
      const current = this.store.get(turnId)
      this.store.transaction(() =>
        this.store.event(current.projectId, 'pi.connection_lost', {
          turnId,
          error: e.message
        })
      )
    }
  }
  async send(discussionId, body) {
    const d = this.store.get(discussionId),
      binding = this.store
        .list(d.projectId, 'pi_binding')
        .find((b) => b.discussionId === discussionId)
    requireThat(
      binding?.sessionId &&
        binding.guardVersion === 1 &&
        binding.status === 'bound',
      'native PI guard not verified',
      503
    )
    const context = body.context || []
    for (const c of context)
      requireThat(
        this.store.sameProject(c.id, d.projectId).revision === c.revision,
        'context revision conflict',
        409
      )
    if (body.actionId) {
      const action = this.store.sameProject(
        body.actionId,
        d.projectId,
        'action'
      )
      requireThat(action.status === 'authorized', 'action unavailable', 403)
    }
    const turn = this.store.write('turn:' + discussionId, body, () => {
      requireThat(
        !this.store
          .list(d.projectId, 'pi_turn')
          .some((t) =>
            [
              'prepared',
              'sending',
              'received',
              'accepted',
              'delivery_unknown'
            ].includes(t.status)
          ),
        'project already has active or uncertain turn',
        409
      )
      return this.store.create(d.projectId, 'pi_turn', {
        discussionId,
        text: body.text,
        context,
        contextHash: hash(context),
        receipt: randomBytes(32).toString('hex'),
        actionId: body.actionId || null,
        status: 'prepared'
      })
    })
    if (turn.status !== 'prepared') return turn
    this.store.transaction(() =>
      this.store.update(turn.id, turn.revision, { status: 'sending' })
    )
    try {
      const result = await this.request(`/api/agent/${binding.sessionId}`, {
        type: 'prompt',
        message: `[entity-studio-turn:${turn.id}:${turn.receipt}]\n${body.text}`
      })
      const current = this.store.get(turn.id)
      void this.observe(turn.id)
      return this.store.transaction(() =>
        this.store.update(turn.id, current.revision, {
          status: 'accepted',
          nativeAcceptance: result.success === true
        })
      )
    } catch (e) {
      const current = this.store.get(turn.id)
      this.store.transaction(() =>
        this.store.update(turn.id, current.revision, {
          status: 'delivery_unknown',
          error: e.message
        })
      )
      throw e
    }
  }
}
