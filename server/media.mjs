// Owner: Sean. Private content-addressed image ingestion and bounded thumbnail cache.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { hash, requireThat, uuid } from './store.mjs'
const exec = promisify(execFile),
  pending = new Map()
export async function ingestPng(dataDir, bytes) {
  requireThat(
    bytes.length >= 24 &&
      bytes.length <= 8 * 1024 * 1024 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'PNG <=8MB required'
  )
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20)
  requireThat(
    width > 0 && height > 0 && width <= 8192 && height <= 8192,
    'PNG dimensions unsupported'
  )
  const digest = hash(bytes),
    path = `media/${digest}.png`
  await mkdir(join(dataDir, 'media'), { recursive: true })
  const tmp = join(dataDir, 'media', uuid() + '.tmp')
  await writeFile(tmp, bytes)
  await rename(tmp, join(dataDir, path))
  return { hash: digest, path, width, height, mime: 'image/png' }
}
export async function thumbnail(dataDir, asset) {
  const path = join(dataDir, 'thumbnails', asset.hash + '.png')
  try {
    return await readFile(path)
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  if (!pending.has(path))
    pending.set(
      path,
      (async () => {
        await mkdir(join(dataDir, 'thumbnails'), { recursive: true })
        const tmp = path + '.' + uuid() + '.tmp'
        await exec(
          'ffmpeg',
          [
            '-v',
            'error',
            '-i',
            join(dataDir, asset.path),
            '-vf',
            'scale=384:384:force_original_aspect_ratio=decrease',
            '-frames:v',
            '1',
            '-f',
            'image2',
            '-c:v',
            'png',
            tmp
          ],
          { timeout: 15000 }
        )
        await rename(tmp, path)
        return readFile(path)
      })().finally(() => pending.delete(path))
    )
  return pending.get(path)
}
