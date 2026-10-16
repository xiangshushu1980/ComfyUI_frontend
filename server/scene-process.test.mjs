// Owner: Sean. Contract and integrity regressions for the read-only process view.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { sceneProcess } from './scene-process.mjs'
const hash = (s) => createHash('sha256').update(s).digest('hex')

test('exact contract chain preserves review independence and partial asset dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scene-process-'))
  const files = []
  async function put(path, data) {
    const bytes = JSON.stringify(data)
    await writeFile(join(root, path), bytes)
    files.push({ id: path, data, sha256: hash(bytes) })
    return { path, sha256: hash(bytes) }
  }
  try {
    const breakdown = await put('breakdown.json', {
      kind: 'breakdown',
      requirements: [{ id: 'REQ-table' }]
    })
    const record = await put('record.json', {
      kind: 'asset',
      files: { prepared: { path: 'missing.blend', sha256: 'missing' } },
      previews: []
    })
    const review = await put('asset-review.json', {
      kind: 'asset_review',
      asset_sha256: record.sha256,
      result: 'passed'
    })
    const manifest = await put('manifest.json', {
      kind: 'asset_manifest',
      breakdown,
      assets: [
        { requirement: 'REQ-table', entry: 'table-r001', record, review }
      ]
    })
    const spec = await put('spec.json', {
      kind: 'scene_spec',
      instances: [{ id: 'table', requirement: 'REQ-table' }],
      layout_validation: { manifest }
    })
    const image = await put('frame.png', {})
    const handoff = await put('handoff.json', {
      kind: 'scene_handoff',
      inputs: [spec],
      outputs: [image],
      visual_review: 'not_checked'
    })
    await put('scene-review.json', {
      kind: 'scene_review',
      handoff,
      images: [image],
      result: 'passed'
    })
    const p = await sceneProcess(root, files)
    assert.equal(p.entities.filter((e) => e.kind === 'requirement').length, 1)
    assert.equal(
      p.relations.find((r) => r.type === 'used_in').verification,
      'partial'
    )
    assert.ok(
      p.diagnostics.some(
        (d) => d.pin?.path === 'missing.blend' && d.verification === 'missing'
      )
    )
    assert.ok(
      p.relations.some(
        (r) =>
          r.from === 'handoff.json' &&
          r.to === 'frame.png' &&
          r.type === 'produced' &&
          r.verification === 'verified'
      )
    )
    assert.ok(
      p.relations.some(
        (r) =>
          r.to === 'scene-review.json' &&
          r.from === 'handoff.json' &&
          r.verification === 'verified'
      )
    )
    assert.ok(
      p.views.some(
        (v) =>
          v.members.includes('frame.png') &&
          v.members.includes('scene-review.json')
      )
    )
    assert.equal(
      files.find((f) => f.id === 'handoff.json').data.visual_review,
      'not_checked'
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('stale and outside pins are retained; rejected references and reused generation keep their roles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scene-process-'))
  try {
    await writeFile(join(root, 'concept.png'), 'current')
    const files = [
      {
        id: 'identity.json',
        sha256: 'identity',
        data: {
          kind: 'asset_identity',
          targets: [
            {
              path: 'concept.png',
              sha256: 'old',
              role: 'generated_concept',
              decision: 'rejected'
            },
            { path: '../private.png', sha256: 'x', role: 'reference' }
          ]
        }
      },
      {
        id: 'run.json',
        sha256: 'run',
        data: {
          source_method: 'generated',
          provenance: { generator: 'Hunyuan; existing output, not run in W02' }
        }
      }
    ]
    const p = await sceneProcess(root, files)
    assert.equal(p.decisions[0].verification, 'stale')
    assert.equal(p.decisions[0].decision, 'rejected')
    assert.equal(p.decisions[1].verification, 'outside')
    assert.equal(p.decisions[2].decision, 'existing_output_reused')
    assert.equal(p.relations.filter((r) => r.type === 'used_in').length, 0)
    assert.equal(p.diagnostics.length, 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
