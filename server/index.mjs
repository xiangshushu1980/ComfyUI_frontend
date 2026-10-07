// Owner: Sean. Loopback product gateway, independent of the shared ComfyUI store.
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join, resolve, extname } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { Store, hash, requireThat } from './store.mjs'
import { createSource, propose, adopt } from './domain.mjs'
import { Execution } from './execution.mjs'
import { PiBridge } from './pi-bridge.mjs'
import { compileQwen, verifyWorkflow } from './qwen.mjs'
import { nativeGateway, readBody } from './gateway.mjs'
export function createStudioServer({
  dataDir = process.env.STUDIO_DATA_DIR ||
    join(homedir(), '.local/share/entity-canvas-studio'),
  comfyUrl = process.env.COMFY_URL || 'http://127.0.0.1:8188',
  dist = resolve('dist')
} = {}) {
  const store = new Store(join(dataDir, 'studio.sqlite'))
  const execution = new Execution(store, dataDir, comfyUrl)
  const pi = new PiBridge(store, dataDir)
  pi.execution = execution
  const publicObject = (o) => {
    const { capability, receipt, cwd, ...safe } = o
    return safe
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const send = (body, status = 200) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store'
      })
      res.end(JSON.stringify(body))
    }
    try {
      // Browser writes are same-origin; no permissive CORS.
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin)
        requireThat(
          new URL(req.headers.origin).host === req.headers.host,
          'cross-origin write denied',
          403
        )
      let m
      if (url.pathname.startsWith('/internal/pi/') && req.method === 'POST') {
        const b = await readBody(req),
          cap = req.headers.authorization?.replace(/^Bearer /, '')
        let result
        if (url.pathname === '/internal/pi/bind') result = pi.bind(cap, b)
        else if (url.pathname === '/internal/pi/direct-input') result = pi.directInput(cap, b)
        else if (url.pathname === '/internal/pi/direct-end') result = pi.directEnd(cap, b)
        else if (url.pathname === '/internal/pi/receipt')
          result = pi.receipt(cap, b)
        else if (url.pathname === '/internal/pi/request-audit') {
          const binding = pi.authenticate(cap, b.sessionId),
            turn = store.sameProject(b.turnId, binding.projectId, 'pi_turn')
          requireThat(
            turn.receipt === b.receipt,
            'invalid request receipt',
            403
          )
          requireThat(
            Array.isArray(b.toolNames) &&
              b.toolNames.every((t) => t === 'entity_studio'),
            'foreign model tools',
            403
          )
          result = store.transaction(() =>
            store.create(binding.projectId, 'request_audit', {
              turnId: turn.id,
              provider: b.provider,
              modelId: b.modelId,
              modelInput: b.modelInput,
              toolNames: b.toolNames,
              systemPrompt: b.systemPrompt,
              systemHash: hash(b.systemPrompt)
            })
          )
        } else if (url.pathname === '/internal/pi/tool')
          result = pi.tool(cap, b)
        else requireThat(false, 'unknown internal route', 404)
        return send(result)
      }
      const path = url.pathname.replace(/^\/studio-api\/v1/, '')
      if (url.pathname.startsWith('/studio-api/v1')) {
        if (path === '/templates/qwen' && req.method === 'GET')
          return send(compileQwen())
        if (path === '/templates/qwen/verify' && req.method === 'POST') {
          const b = await readBody(req)
          const result = verifyWorkflow(b, compileQwen())
          store.compatSet('qwen-template-ui.v1', result)
          return send(result)
        }
        if ((m = path.match(/^\/discussions\/([^/]+)\/agent-status$/)) && req.method === 'GET') {
          const d = store.get(m[1]), binding = store.list(d.projectId, 'pi_binding').find(b => b.discussionId === d.id)
          if (!binding?.sessionId) return send({ working: false, summary: '', piWebUrl: null })
          const state = await pi.request(`/api/agent/${binding.sessionId}`, { type: 'get_state' })
          const history = await pi.messages(d.id)
          const entries = history.context?.messages || history.context || []
          const messages = Array.isArray(entries) ? entries.map(e => e.message || e) : []
          const latest = [...messages].reverse().find(m => m.role === 'assistant')
          const summary = typeof latest?.content === 'string' ? latest.content : (latest?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
          return send({ working: Boolean(state.data?.isStreaming || state.data?.isPromptRunning), summary: summary.slice(-600), piWebUrl: pi.publicBinding(binding).piWebUrl })
        }
        if ((m = path.match(/^\/discussions\/([^/]+)\/pi-context$/)) && req.method === 'POST') {
          const b = await readBody(req), d = store.get(m[1])
          return send(store.write(path, b, () => {
            for (const c of b.links || []) requireThat(store.sameProject(c.id, d.projectId).revision === c.revision, 'context revision conflict', 409)
            if (b.actionId) requireThat(store.sameProject(b.actionId, d.projectId, 'action').status === 'authorized', 'action unavailable', 403)
            return store.update(d.id, d.revision, { links: b.links || [], pendingActionId: b.actionId || null })
          }))
        }
        if (
          (m = path.match(/^\/discussions\/([^/]+)\/workspace$/)) &&
          req.method === 'POST'
        )
          return send(pi.publicBinding(await pi.prepareWorkspace(m[1])))
        if (
          (m = path.match(/^\/discussions\/([^/]+)\/pi-session$/)) &&
          req.method === 'POST'
        )
          return send(await pi.launch(m[1], await readBody(req)))
        if (
          (m = path.match(/^\/discussions\/([^/]+)\/turns$/)) &&
          req.method === 'POST'
        )
          return send(publicObject(await pi.send(m[1], await readBody(req))))
        if (
          (m = path.match(/^\/discussions\/([^/]+)\/messages$/)) &&
          req.method === 'GET'
        )
          return send(await pi.messages(m[1]))
        if (
          (m = path.match(/^\/discussions\/([^/]+)\/stop$/)) &&
          req.method === 'POST'
        )
          return send(await pi.stop(m[1]))
        if (
          (m = path.match(/^\/discussions\/([^/]+)\/pi-events$/)) &&
          req.method === 'GET'
        ) {
          const binding = pi.binding(m[1]),
            controller = new AbortController()
          req.on('close', () => controller.abort())
          const upstream = await fetch(
            pi.url + `/api/agent/${binding.sessionId}/events`,
            { signal: controller.signal }
          )
          requireThat(upstream.ok, 'native SSE unavailable', 503)
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive'
          })
          for await (const chunk of upstream.body) res.write(chunk)
          res.end()
          return
        }
        if (
          (m = path.match(/^\/entities\/([^/]+)\/image-inputs$/)) &&
          req.method === 'POST'
        ) {
          const b = await readBody(req)
          return send(
            store.write(path, b, () => execution.createInput(m[1], b)),
            201
          )
        }
        if (
          (m = path.match(/^\/image-inputs\/([^/]+)\/(preview|workflow)$/)) &&
          req.method === 'GET'
        )
          return send(execution.preview(m[1]))
        if (
          (m = path.match(/^\/image-inputs\/([^/]+)\/verify$/)) &&
          req.method === 'POST'
        )
          return send(execution.verify(m[1], await readBody(req)))
        if (
          (m = path.match(/^\/image-inputs\/([^/]+)\/actions$/)) &&
          req.method === 'POST'
        ) {
          const b = await readBody(req)
          return send(
            store.write(path, b, () => execution.authorize(m[1], b)),
            201
          )
        }
        if (
          (m = path.match(/^\/(actions|runs)\/([^/]+)$/)) &&
          req.method === 'GET'
        )
          return send(store.get(m[2]))
        if (
          (m = path.match(/^\/entities\/([^/]+)\/appearance$/)) &&
          req.method === 'POST'
        ) {
          const b = await readBody(req)
          return send(
            store.write(path, b, () => {
              const e = store.get(m[1]),
                asset = store.sameProject(b.assetId, e.projectId, 'asset'),
                run = store.sameProject(asset.runId, e.projectId, 'run')
              requireThat(
                run.targetEntityId === e.id && run.status === 'succeeded',
                'asset target mismatch'
              )
              requireThat(
                e.revision === b.expectedRevision,
                'appearance conflict',
                409
              )
              const decision = store.create(
                e.projectId,
                'appearance_selection',
                {
                  entityId: e.id,
                  assetId: asset.id,
                  actor: 'human',
                  inputHash: run.inputHash
                }
              )
              store.update(e.id, e.revision, {
                appearanceAssetId: asset.id,
                appearanceSelectionId: decision.id
              })
              return decision
            })
          )
        }
        if (
          (m = path.match(/^\/assets\/([^/]+)\/(content|thumbnail)$/)) &&
          req.method === 'GET'
        ) {
          const a = store.get(m[1])
          requireThat(
            a.kind === 'asset' && /^media\/[a-f0-9]{64}\.png$/.test(a.path),
            'invalid media'
          )
          res.writeHead(200, {
            'content-type': 'image/png',
            'cache-control': 'private,max-age=86400'
          })
          res.end(await readFile(join(dataDir, a.path)))
          return
        }
        if (
          (m = path.match(/^\/runs\/([^/]+)\/cancel-queued$/)) &&
          req.method === 'POST'
        ) {
          const run = store.get(m[1])
          requireThat(run.kind === 'run', 'run required')
          if (!run.promptId) {
            requireThat(
              ['prepared', 'waiting_resource'].includes(run.status),
              'cannot cancel submission boundary',
              409
            )
            return send(execution.update(run.id, { status: 'cancelled' }))
          }
          const q = await execution.comfy('/queue')
          requireThat(
            !q.queue_running.some((i) => i[1] === run.promptId),
            'running shared generation cannot be globally interrupted',
            409
          )
          requireThat(
            q.queue_pending.some((i) => i[1] === run.promptId),
            'original queue item unavailable',
            409
          )
          await execution.comfy('/queue', { delete: [run.promptId] })
          return send(execution.update(run.id, { status: 'cancelled' }))
        }
        if (path === '/health')
          return send({
            owner: 'Sean',
            status: 'development',
            generationEnabled: true,
            piEnabled: true
          })
        if (path === '/projects' && req.method === 'GET')
          return send(
            store.db
              .prepare('SELECT body FROM projects ORDER BY rowid')
              .all()
              .map((r) => JSON.parse(r.body))
          )
        if (path === '/projects' && req.method === 'POST') {
          const b = await readBody(req)
          return send(
            store.write(path, b, () => store.createProject(b)),
            201
          )
        }
        if ((m = path.match(/^\/projects\/([^/]+)\/snapshot$/))) {
          const snap = store.snapshot(m[1])
          snap.objects = snap.objects.map(publicObject)
          return send(snap)
        }
        if ((m = path.match(/^\/projects\/([^/]+)\/events$/))) {
          if (req.headers.accept?.includes('text/event-stream')) {
            store.project(m[1])
            res.writeHead(200, {
              'content-type': 'text/event-stream',
              'cache-control': 'no-cache',
              connection: 'keep-alive'
            })
            let seq = Number(url.searchParams.get('after') || 0)
            const emit = () => {
              for (const e of store.events(m[1], seq)) {
                seq = e.seq
                res.write(
                  `id: ${seq}\ndata: ${JSON.stringify({ ...e, data: publicObject(e.data) })}\n\n`
                )
              }
            }
            emit()
            const timer = setInterval(emit, 1000)
            req.on('close', () => clearInterval(timer))
            return
          }
          return send(
            store
              .events(m[1], Number(url.searchParams.get('after') || 0))
              .map((e) => ({ ...e, data: publicObject(e.data) }))
          )
        }
        if (
          (m = path.match(
            /^\/projects\/([^/]+)\/(chapters|scenes|sources|discussions|proposals)$/
          )) &&
          req.method === 'POST'
        ) {
          const [, projectId, collection] = m,
            b = await readBody(req)
          return send(
            store.write(path, b, () => {
              if (collection === 'sources')
                return createSource(store, projectId, b)
              if (collection === 'proposals')
                return propose(store, projectId, b)
              if (collection === 'scenes')
                store.sameProject(b.chapterId, projectId, 'chapter')
              const fields =
                collection === 'chapters'
                  ? { name: b.name, brief: b.brief || '', order: b.order || 0 }
                  : collection === 'scenes'
                    ? {
                        name: b.name,
                        brief: b.brief || '',
                        chapterId: b.chapterId
                      }
                    : {
                        name: b.name || '讨论',
                        goal: b.goal || '',
                        links: b.links || [],
                        status: 'idle'
                      }
              if (collection === 'discussions')
                for (const link of fields.links)
                  store.sameProject(link.id, projectId)
              return store.create(
                projectId,
                {
                  chapters: 'chapter',
                  scenes: 'scene',
                  discussions: 'discussion'
                }[collection],
                fields
              )
            }),
            201
          )
        }
        if ((m = path.match(/^\/objects\/([^/]+)$/)) && req.method === 'GET')
          return send(
            publicObject(
              store.get(
                m[1],
                Number(url.searchParams.get('revision')) || undefined
              )
            )
          )
        if (
          (m = path.match(/^\/objects\/([^/]+)$/)) &&
          req.method === 'PATCH'
        ) {
          const b = await readBody(req)
          return send(
            store.write(path, b, () => {
              const o = store.get(m[1])
              requireThat(
                ['entity', 'chapter', 'scene', 'discussion'].includes(o.kind),
                'immutable object',
                403
              )
              const fields = {}
              for (const k of ['name', 'brief', 'description', 'goal'])
                if (b.fields?.[k] !== undefined) fields[k] = b.fields[k]
              return store.update(o.id, b.expectedRevision, fields)
            })
          )
        }
        if (
          (m = path.match(/^\/proposals\/([^/]+)\/(adopt|reject)$/)) &&
          req.method === 'POST'
        ) {
          const b = await readBody(req)
          return send(
            store.write(path, b, () =>
              m[2] === 'adopt'
                ? adopt(store, m[1], b)
                : store.update(m[1], b.expectedRevision, { status: 'rejected' })
            )
          )
        }
        if (
          (m = path.match(/^\/projects\/([^/]+)\/views\/([^/]+)$/)) &&
          req.method === 'PATCH'
        ) {
          const b = await readBody(req)
          return send(
            store.write(path, b, () => {
              store.project(m[1])
              const key = `view:${m[1]}:${m[2]}`,
                old = store.compatGet(key, { revision: 0 })
              requireThat(
                old.revision === b.expectedRevision,
                'view conflict',
                409
              )
              const view = { revision: old.revision + 1, ...b.view }
              store.compatSet(key, view)
              return view
            })
          )
        }
        if (
          (m = path.match(/^\/projects\/([^/]+)\/views\/([^/]+)$/)) &&
          req.method === 'GET'
        ) {
          store.project(m[1])
          return send(store.compatGet(`view:${m[1]}:${m[2]}`, { revision: 0 }))
        }
        requireThat(false, 'endpoint not implemented', 404)
      }
      if (await nativeGateway(req, res, url, store, comfyUrl)) return
      const file = resolve(dist, '.' + decodeURIComponent(url.pathname))
      requireThat(
        file === dist || file.startsWith(dist + '/'),
        'invalid asset path',
        403
      )
      let target = file
      try {
        if (!(await stat(file)).isFile()) target = join(dist, 'index.html')
      } catch {
        target = join(dist, 'index.html')
      }
      const mime = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.woff2': 'font/woff2',
        '.json': 'application/json'
      }
      res.writeHead(200, {
        'content-type': mime[extname(target)] || 'application/octet-stream'
      })
      res.end(await readFile(target))
    } catch (e) {
      if (!res.headersSent) send({ error: e.message }, e.status || 503)
      else res.end()
    }
  })
  server.on('listening', () => execution.recover())
  server.on('close', () => {
    execution.stopped = true
    store.close()
  })
  return { server, store }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { server } = createStudioServer()
  server.listen(Number(process.env.STUDIO_PORT || 4318), '127.0.0.1', () =>
    console.log(
      'Sean Entity Studio http://127.0.0.1:' + (process.env.STUDIO_PORT || 4318)
    )
  )
}
