// Owner: Sean. Filesystem boundary and provenance contract regression checks.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { SceneProjection, sceneRoute } from './scene-projection.mjs'

test('read-only scene projection preserves unknown, broken files and stale references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scene-projection-'))
  try {
    await mkdir(join(root, 'layouts'))
    await mkdir(join(root, 'reviews'))
    await writeFile(join(root, 'scene.blend'), 'binary-placeholder')
    await writeFile(
      join(root, 'layouts/a.json'),
      JSON.stringify({ id: 'a', kind: 'scene_layout' })
    )
    await writeFile(
      join(root, 'reviews/b.json'),
      JSON.stringify({
        result: 'failed',
        source: { path: 'layouts/a.json', sha256: 'wrong' },
        missing: { path: 'missing.json' },
        binary: { path: 'scene.blend' },
        outside: { path: '../external.txt' }
      })
    )
    await writeFile(join(root, 'reviews/broken.json'), '{')
    await symlink('/etc/passwd', join(root, 'reviews/escape.txt'))
    const p = new SceneProjection(JSON.stringify([{ id: 'scene', root }]))
    const data = await p.project('scene')
    assert.equal(data.nodes.find((n) => n.title === 'a').status, 'unknown')
    assert.equal(
      data.nodes.find((n) => n.id === 'reviews/b.json').status,
      'failed'
    )
    assert.equal(
      data.nodes.find((n) => n.id === 'reviews/broken.json').status,
      'unreadable'
    )
    assert.deepEqual(data.edges.map((e) => e.status).sort(), [
      'missing',
      'outside',
      'stale',
      'unprojected'
    ])
    assert.equal((await p.project('scene')).revision, data.revision)
    await assert.rejects(p.file('scene', '../outside.txt'))
    await assert.rejects(p.file('scene', 'reviews/escape.txt'), { status: 403 })
    await assert.rejects(p.project('other'), { status: 404 })
    const server = createServer(async (req, res) => {
      await sceneRoute(p, req, res, new URL(req.url, 'http://localhost'))
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    try {
      const url = `http://127.0.0.1:${server.address().port}/studio-api/v1/scene-projection/scene`
      assert.equal((await fetch(url, { method: 'POST' })).status, 405)
      assert.equal((await fetch(url)).status, 200)
      assert.equal(
        (await fetch(`${url}/file?path=reviews%2Fescape.txt`)).status,
        403
      )
    } finally {
      await new Promise((r) => server.close(r))
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
