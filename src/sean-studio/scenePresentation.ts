// Owner: Sean. Display grouping only; never selects an adopted production revision.
import { hasCanvasTextPreview } from './canvasNodeName'
export type SceneArtifact = {
  id: string
  title: string
  stage: number
  kind: string
  sha256: string
  status: string
  error: string | null
  data: unknown
  text: string | null
  image: boolean
}
export type SceneResultGroup = {
  id: string
  title: string
  stage: number
  files: SceneArtifact[]
  preview: SceneArtifact
}
const revisionKey = (path: string) => path.replace(/-r\d+/g, '-revision')
const version = (path: string) =>
  Math.max(0, ...Array.from(path.matchAll(/-r(\d+)/g), (m) => Number(m[1])))
export const SCENE_STEP_NAMES = [
  '场景目标',
  '资产准备',
  '场景布局',
  '渲染结果',
  '检查与问题'
]
export const SCENE_STEP_DESCRIPTIONS = [
  '要做什么，参考什么',
  '模型、选择记录与方案',
  '物体怎样摆放',
  '从不同角度查看',
  '确认了什么，还有什么问题'
]
export function groupSceneResults(nodes: SceneArtifact[]): SceneResultGroup[] {
  const groups = new Map<string, SceneArtifact[]>()
  for (const file of nodes) {
    const parts = file.id.split('/')
    let key: string
    if (parts[0] === 'assets') key = `asset:${revisionKey(parts[1])}`
    else if (parts[0] === 'scenes')
      key = `render:${revisionKey(parts[1])}:${file.image ? 'images' : 'records'}`
    else key = `${parts[0]}:${revisionKey(parts.slice(1).join('/'))}`
    key = `${file.stage}:${key}`
    const files = groups.get(key) || []
    files.push(file)
    groups.set(key, files)
  }
  return [...groups]
    .map(([id, files]) => {
      files.sort(
        (a, b) => version(b.id) - version(a.id) || a.id.localeCompare(b.id)
      )
      const preview =
        files.find((f) => f.image) ||
        files.find((f) => hasCanvasTextPreview(f)) ||
        files[0]
      const stem = (
        files[0].id.split('/')[
          files[0].id.startsWith('assets/') || files[0].id.startsWith('scenes/')
            ? 1
            : files[0].id.split('/').length - 1
        ] || ''
      )
        .replace(/-r\d+/g, '')
        .replace(/\.[^.]+$/, '')
      const labels: Record<string, string> = {
        sources: '场景说明',
        inputs: '参考与意图',
        breakdowns: '场景需求',
        plans: '资产方案',
        bindings: '资产选择',
        manifests: '资产清单',
        layouts: '关系布局',
        specs: '镜头与布局',
        profiles: '尺寸与支撑',
        reviews: '审核记录',
        identities: '外观检查',
        metrics: '测量记录',
        checks: '检查记录',
        evidence: '证据'
      }
      const prefix = files[0].id.split('/')[0]
      const title =
        prefix === 'assets'
          ? stem
          : prefix === 'scenes'
            ? `${files.some((f) => f.image) ? '渲染视图' : '执行与检查'} · ${stem}`
            : `${labels[prefix] || '制作记录'} · ${stem}`
      return { id, title, stage: files[0].stage, files, preview }
    })
    .sort(
      (a, b) =>
        a.stage - b.stage ||
        Number(b.preview.image) - Number(a.preview.image) ||
        a.title.localeCompare(b.title)
    )
}

// Rings use the largest card diagonal to keep unequal image cards apart.
function radialPositions(
  sizes: { width: number; height: number }[]
): [number, number][] {
  const spacing = Math.max(
    280,
    ...sizes.map((s) => Math.hypot(s.width, s.height) + 70)
  )
  const positions: [number, number][] = []
  let offset = 0,
    ring = 1
  while (offset < sizes.length) {
    const count = Math.min(6 * ring, sizes.length - offset)
    const radius = spacing * ring
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / count
      positions.push([Math.cos(angle) * radius, Math.sin(angle) * radius])
    }
    offset += count
    ring++
  }
  return positions
}

// Prefer a line for a short branch or a connected chain, and a fan for richer branches.
export function relatedPositions(
  items: { item: { id: string }; width: number; height: number }[],
  edges: { from: string; to: string }[],
  groups: Map<string, SceneResultGroup>
): [number, number][] {
  const owners = new Map<string, string>()
  for (const item of items)
    for (const file of groups.get(item.item.id)?.files || [])
      owners.set(file.id, item.item.id)
  const neighbors = new Map(
    items.map((item) => [item.item.id, new Set<string>()])
  )
  for (const edge of edges) {
    const a = owners.get(edge.from),
      b = owners.get(edge.to)
    if (a && b && a !== b) {
      neighbors.get(a)!.add(b)
      neighbors.get(b)!.add(a)
    }
  }
  const endpoint = items.find((item) => neighbors.get(item.item.id)!.size === 1)
  const order: string[] = []
  if (endpoint && [...neighbors.values()].every((n) => n.size <= 2)) {
    let next: string | undefined = endpoint.item.id
    while (next && !order.includes(next)) {
      order.push(next)
      next = [...neighbors.get(next)!].find((id) => !order.includes(id))
    }
  }
  if (items.length <= 3 || order.length === items.length) {
    const sequence =
      order.length === items.length ? order : items.map((i) => i.item.id)
    let x = 0
    const positions = new Map<string, [number, number]>()
    for (const id of sequence) {
      const item = items.find((i) => i.item.id === id)!
      x += item.width / 2
      positions.set(id, [x, 0])
      x += item.width / 2 + 100
    }
    return items.map((item) => positions.get(item.item.id)!)
  }
  return radialPositions(items)
}
