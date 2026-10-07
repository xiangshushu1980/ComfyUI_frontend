// Owner: Sean. Explicit native compatibility surface. No shared writes.
import { requireThat } from './store.mjs'
export async function nativeGateway(req, res, url, store, comfyUrl) {
  const path = url.pathname.replace(/^\/api(?=\/)/, '')
  const json = (body, code = 200) => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (path === '/extensions') {
    json([])
    return true
  } // Qwen core nodes need no third-party JS.
  if (path === '/global_subgraphs') {
    json([])
    return true
  }
  if (path === '/users') {
    json({ storage: 'server', migrated: true })
    return true
  }
  if (path === '/settings' || path.startsWith('/settings/')) {
    const settings = store.compatGet('settings', {
      'Comfy.UseNewMenu': 'Disabled',
      'Comfy.VueNodes.Enabled': false,
      'Comfy.TutorialCompleted': true
    })
    if (req.method === 'GET') {
      json(
        path === '/settings'
          ? settings
          : (settings[decodeURIComponent(path.slice(10))] ?? null)
      )
      return true
    }
    if (req.method === 'POST') {
      const body = await readBody(req)
      if (path === '/settings') Object.assign(settings, body)
      else settings[decodeURIComponent(path.slice(10))] = body
      store.compatSet('settings', settings)
      json({})
      return true
    }
  }
  if (path === '/userdata' || path.startsWith('/userdata/')) {
    const files = store.compatGet('userdata', {}),
      key = decodeURIComponent(path.slice('/userdata/'.length))
    if (req.method === 'GET') {
      if (path === '/userdata') json([])
      else if (key === 'user.css') {
        res.writeHead(200, { 'content-type': 'text/css' })
        res.end('')
      } else if (key === 'comfy.templates.json') json([])
      else if (Object.hasOwn(files, key)) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(files[key])
      } else json({ error: 'private file not found' }, 404)
      return true
    }
    if (req.method === 'POST') {
      files[key] = await readText(req)
      store.compatSet('userdata', files)
      json({})
      return true
    }
    if (req.method === 'DELETE') {
      delete files[key]
      store.compatSet('userdata', files)
      json({})
      return true
    }
  }
  if (['/queue', '/history'].includes(path) && req.method === 'GET') {
    json(path === '/queue' ? { queue_running: [], queue_pending: [] } : {})
    return true
  }
  if (path === '/i18n') {
    json({})
    return true
  }
  if (path === '/features') {
    json({})
    return true
  }
  if (path === '/config') {
    json({})
    return true
  }
  if (
    path === '/system_stats' ||
    path === '/object_info' ||
    /^\/object_info\/[\w-]+$/.test(path) ||
    path === '/embeddings'
  ) {
    requireThat(req.method === 'GET', 'native writes forbidden', 403)
    const upstream = await fetch(comfyUrl + path, {
      signal: AbortSignal.timeout(15000)
    })
    if (!upstream.ok) {
      json({ error: 'Shared ComfyUI read failed', path, status: upstream.status }, upstream.status)
      return true
    }
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/json'
    })
    res.end(Buffer.from(await upstream.arrayBuffer()))
    return true
  }
  if (
    /^\/(api|internal|extensions|ws|prompt|interrupt|free|manager|upload|view|queue|history|userdata|settings)(\/|$)/.test(
      url.pathname
    )
  ) {
    json(
      { error: 'Native operation unavailable; use a scoped studio action' },
      403
    )
    return true
  }
  return false
}
export async function readText(req) {
  let bytes = 0,
    chunks = []
  for await (const c of req) {
    bytes += c.length
    requireThat(bytes <= 12 * 1024 * 1024, 'request too large', 413)
    chunks.push(c)
  }
  return Buffer.concat(chunks).toString('utf8')
}
export async function readBody(req) {
  const text = await readText(req)
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    requireThat(false, 'invalid JSON', 400)
  }
}
