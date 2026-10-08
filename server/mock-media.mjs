// Owner: Sean. Deterministic preview media for workflow simulation; never calls a model.
import { deflateSync } from 'node:zlib'

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let value = n
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  crcTable[n] = value >>> 0
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(name, data) {
  const type = Buffer.from(name)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])))
  return Buffer.concat([length, type, data, checksum])
}

function mockCharacterPng(stage, variant = 0) {
  const threeView = stage === 'threeview'
  const width = threeView ? 1152 : 768
  const height = 512
  const panelWidth = threeView ? width / 3 : width
  const palettes = [
    { bg: [214, 225, 226], cloth: [55, 82, 96], hair: [45, 36, 35] },
    { bg: [226, 216, 207], cloth: [113, 73, 80], hair: [57, 43, 37] },
    { bg: [207, 218, 228], cloth: [70, 78, 112], hair: [35, 34, 47] },
    { bg: [222, 226, 208], cloth: [79, 102, 80], hair: [64, 48, 38] }
  ]
  const palette = palettes[Math.abs(variant) % palettes.length]
  const pixels = Buffer.alloc((width * 4 + 1) * height)
  const put = (x, y, color) => {
    const offset = y * (width * 4 + 1) + 1 + x * 4
    pixels[offset] = color[0]
    pixels[offset + 1] = color[1]
    pixels[offset + 2] = color[2]
    pixels[offset + 3] = 255
  }
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1)
    pixels[row] = 0
    for (let x = 0; x < width; x++) {
      const view = threeView ? Math.floor(x / panelWidth) : 0
      const localX = (x - view * panelWidth) / panelWidth
      const nx = threeView && view === 1 ? 0.53 : 0.5
      const ny = y / height
      const shade = Math.round((1 - ny) * 11)
      let color = palette.bg.map((component) => component + shade)
      const centerX = localX - nx
      if (threeView && x % panelWidth < 2 && x > 0) color = [165, 177, 181]
      else if (
        ny > 0.12 &&
        ny < 0.385 &&
        centerX ** 2 / 0.014 + (ny - 0.255) ** 2 / 0.014 < 1
      ) {
        color = [202, 158, 128]
        const hairline = ny < 0.235 || Math.abs(centerX) > 0.09
        if (hairline) color = palette.hair
      } else if (ny >= 0.36 && ny < 0.47 && Math.abs(centerX) < 0.055) {
        color = [202, 158, 128]
      } else if (ny >= 0.43 && ny < 0.78) {
        const torsoWidth = 0.15 + Math.min(0.12, (ny - 0.43) * 0.48)
        if (Math.abs(centerX) < torsoWidth) color = palette.cloth
        const armWidth = 0.29 - (ny - 0.43) * 0.1
        if (Math.abs(centerX) >= torsoWidth && Math.abs(centerX) < armWidth)
          color = [202, 158, 128]
      } else if (ny >= 0.76 && ny < 0.98) {
        const legCenter = centerX < 0 ? nx - 0.085 : nx + 0.085
        const legWidth = threeView && view === 1 ? 0.055 : 0.075
        if (Math.abs(localX - legCenter) < legWidth) color = [48, 58, 68]
      }
      put(x, y, color)
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0
  return Buffer.concat([
    pngSignature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function mockVoiceWav(seed = 42) {
  const sampleRate = 22050
  const sampleCount = Math.round(sampleRate * 1.8)
  const data = Buffer.alloc(sampleCount * 2)
  const notes = [220, 277, 330, 277, 247]
  const noteSamples = Math.floor(sampleRate * 0.36)
  for (let i = 0; i < sampleCount; i++) {
    const note = notes[Math.floor(i / noteSamples) % notes.length]
    const envelope =
      Math.min(1, (i % noteSamples) / 500) *
      Math.min(1, (sampleCount - i) / 1000)
    const phase = (2 * Math.PI * note * i) / sampleRate
    const sample = Math.sin(phase) * 0.22 + Math.sin(phase * 2) * 0.05
    data.writeInt16LE(Math.round(sample * envelope * 32767), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  // A tiny deterministic variation keeps each mock sample content-addressed.
  data[0] = Math.abs(seed) % 128
  return Buffer.concat([header, data])
}

export function createMockMedia(stage, variant = 0) {
  if (stage === 'voice')
    return {
      bytes: mockVoiceWav(variant),
      extension: '.wav',
      mime: 'audio/wav'
    }
  return {
    bytes: mockCharacterPng(stage, variant),
    extension: '.png',
    mime: 'image/png',
    width: stage === 'threeview' ? 1152 : 768,
    height: 512
  }
}
