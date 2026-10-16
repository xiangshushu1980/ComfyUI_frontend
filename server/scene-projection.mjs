// Owner: Sean. Read-only filesystem projection; no product store or Agent binding.
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { resolve, relative, extname, sep } from 'node:path'
import { createHash } from 'node:crypto'

const types = {
  '.json': 'application/json',
  '.md': 'text/plain',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}
const stages = ['意图与参考', '资产准备', '关系布局', '渲染视图', '检查与问题']
const directories = [
  'inputs',
  'specs',
  'evidence',
  'sources',
  'designs',
  'briefs',
  'breakdowns',
  'plans',
  'bindings',
  'manifests',
  'assets',
  'layouts',
  'profiles',
  'scenes',
  'reviews',
  'checks',
  'identities',
  'metrics'
]
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status })
}

export class SceneProjection {
  constructor(config = process.env.STUDIO_3D_SCENES || '[]') {
    this.scenes = JSON.parse(config)
    if (!Array.isArray(this.scenes)) fail('STUDIO_3D_SCENES must be an array')
    const ids = new Set()
    for (const s of this.scenes) {
      if (!s.id || !s.root || ids.has(s.id))
        fail('Each scene needs a unique id and root')
      ids.add(s.id)
    }
  }
  list() {
    return this.scenes.map(({ id, name }) => ({ id, name: name || id }))
  }
  scene(id) {
    const scene = this.scenes.find((s) => s.id === id)
    if (!scene) fail('Scene not configured', 404)
    return scene
  }
  async file(id, path) {
    const root = await realpath(this.scene(id).root)
    const target = await realpath(resolve(root, path))
    const rel = relative(root, target)
    if (
      !rel ||
      rel.startsWith(`..${sep}`) ||
      rel === '..' ||
      rel.startsWith(sep)
    )
      fail('Path outside scene', 403)
    const type = types[extname(target).toLowerCase()]
    if (!type) fail('Unsupported preview type', 415)
    const info = await stat(target)
    if (!info.isFile() || info.size > 32 * 1024 * 1024)
      fail('Preview exceeds file limit', 413)
    return { bytes: await readFile(target), type }
  }
  async project(id) {
    const scene = this.scene(id),
      root = await realpath(scene.root)
    const nodes = [],
      warnings = []
    const walk = async (dir, depth = 0) => {
      if (depth > 5) {
        warnings.push(`目录深度超限：${dir}`)
        return
      }
      let entries
      try {
        const actual = await realpath(resolve(root, dir))
        const rel = relative(root, actual)
        if (rel === '..' || rel.startsWith(`..${sep}`)) {
          warnings.push(`跳过工作区外目录：${dir}`)
          return
        }
        entries = await readdir(actual, { withFileTypes: true })
      } catch (e) {
        if (e.code !== 'ENOENT') warnings.push(`${dir}: ${e.message}`)
        return
      }
      for (const entry of entries.sort((a, b) =>
        a.name.localeCompare(b.name)
      )) {
        if (nodes.length >= 1500) {
          warnings.push('展示达到 1500 个产物上限')
          return
        }
        const path = `${dir}/${entry.name}`
        if (entry.isSymbolicLink()) {
          warnings.push(`跳过软链：${path}`)
          continue
        }
        if (entry.isDirectory()) {
          await walk(path, depth + 1)
          continue
        }
        const ext = extname(path).toLowerCase()
        if (!types[ext]) continue
        try {
          const { bytes } = await this.file(id, path)
          if (
            bytes.length > 2 * 1024 * 1024 &&
            ['.json', '.md', '.txt'].includes(ext)
          ) {
            warnings.push(`文本过大：${path}`)
            continue
          }
          let data = null,
            error = null
          if (ext === '.json') {
            try {
              data = JSON.parse(bytes.toString())
            } catch {
              error = 'JSON 损坏，内容未解析'
            }
          }
          const stage = /^(reviews|checks|identities|metrics)\//.test(path)
            ? 4
            : /^scenes\//.test(path)
              ? ext === '.json'
                ? 4
                : 3
              : /^(layouts|profiles|specs)\//.test(path)
                ? 2
                : /^(assets|plans|bindings|manifests)\//.test(path)
                  ? 1
                  : 0
          nodes.push({
            id: path,
            title: data?.id || path.split('/').slice(-2).join('/'),
            stage,
            kind: data?.kind || ext.slice(1),
            sha256: sha(bytes),
            status: error
              ? 'unreadable'
              : typeof data?.result === 'string'
                ? data.result
                : typeof data?.status === 'string'
                  ? data.status
                  : 'unknown',
            error,
            data,
            text: ['.txt', '.md'].includes(ext) ? bytes.toString() : null,
            image: /^\.(png|jpe?g|webp)$/.test(ext)
          })
        } catch (e) {
          warnings.push(`${path}: ${e.message}`)
        }
      }
    }
    for (const dir of directories) await walk(dir)
    const byPath = new Map(nodes.map((n) => [n.id, n])),
      edges = []
    const visit = (node, value, field = '') => {
      if (!value || typeof value !== 'object') return
      if (typeof value.path === 'string') {
        const target = byPath.get(value.path)
        edges.push({
          from: value.path,
          to: node.id,
          field,
          expectedHash: value.sha256 || null,
          status: !target
            ? 'unverified'
            : value.sha256 && value.sha256 !== target.sha256
              ? 'stale'
              : 'present'
        })
      }
      for (const [key, child] of Object.entries(value))
        if (child && typeof child === 'object')
          visit(node, child, field ? `${field}.${key}` : key)
    }
    for (const node of nodes) visit(node, node.data)
    const referenceStates = new Map()
    for (const edge of edges) {
      if (edge.status !== 'unverified') continue
      if (!referenceStates.has(edge.from)) {
        let state = 'unverified'
        const lexical = relative(root, resolve(root, edge.from))
        if (lexical === '..' || lexical.startsWith(`..${sep}`))
          state = 'outside'
        else {
          try {
            const actual = await realpath(resolve(root, edge.from))
            const rel = relative(root, actual)
            state =
              rel === '..' || rel.startsWith(`..${sep}`)
                ? 'outside'
                : 'unprojected'
          } catch (e) {
            state = e.code === 'ENOENT' ? 'missing' : 'unverified'
          }
        }
        referenceStates.set(edge.from, state)
      }
      edge.status = referenceStates.get(edge.from)
    }
    return {
      id,
      name: scene.name || id,
      stages,
      nodes,
      edges,
      warnings: [...new Set(warnings)],
      revision: sha(JSON.stringify(nodes.map((n) => [n.id, n.sha256]))),
      readAt: new Date().toISOString()
    }
  }
}

export async function sceneRoute(projection, req, res, url) {
  const prefix = '/studio-api/v1/scene-projection'
  if (!url.pathname.startsWith(prefix)) return false
  const send = (data, status = 200) => {
    res.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    })
    res.end(JSON.stringify(data))
  }
  if (req.method !== 'GET') {
    send({ error: 'Read-only endpoint' }, 405)
    return true
  }
  try {
    const parts = url.pathname
      .slice(prefix.length)
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent)
    if (!parts.length) send(projection.list())
    else if (parts.length === 1) send(await projection.project(parts[0]))
    else if (parts.length === 2 && parts[1] === 'file') {
      const { bytes, type } = await projection.file(
        parts[0],
        url.searchParams.get('path') || ''
      )
      res.writeHead(200, {
        'content-type': type,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox"
      })
      res.end(bytes)
    } else send({ error: 'Not found' }, 404)
  } catch (e) {
    send({ error: e.message }, e.status || (e.code === 'ENOENT' ? 404 : 500))
  }
  return true
}
