// Owner: Sean. Verify real image ingestion and reduced cached thumbnails.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ingestPng, thumbnail } from './media.mjs'
test('uploaded PNG is content addressed; concurrent thumbnails decode to bounded dimensions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sean-media-'))
  try {
    await promisify(execFile)('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=navy:s=1024x512',
      '-frames:v',
      '1',
      join(dir, 'fixture.png')
    ])
    const bytes = await readFile(join(dir, 'fixture.png'))
    const asset = await ingestPng(dir, bytes)
    assert.equal(asset.width, 1024)
    assert.deepEqual(await readFile(join(dir, asset.path)), bytes)
    const [a, b] = await Promise.all([
      thumbnail(dir, asset),
      thumbnail(dir, asset)
    ])
    assert.deepEqual(a, b)
    assert.equal(a.readUInt32BE(16), 384)
    assert.equal(a.readUInt32BE(20), 192)
    assert.deepEqual(await thumbnail(dir, asset), a)
    await assert.rejects(ingestPng(dir, Buffer.from('invalid')), /PNG/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
