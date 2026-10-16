// Owner: Sean. Display-only projection types and folder membership.
import type { SceneArtifact, SceneResultGroup } from './scenePresentation'
type ProcessBasis = { path: string; sha256: string; field: string }
type ProcessRelation = {
  from: string
  to: string
  type: string
  field: string
  verification: string
  basis: ProcessBasis[]
  pin?: { path: string; sha256?: string } | null
  role?: string
  scope?: string
}
export type SceneProcess = {
  entities: {
    id: string
    title: string
    kind: string
    stage: number
    status: string
    data: unknown
    source: string
    basis: ProcessBasis[]
  }[]
  views: {
    id: string
    title: string
    stage: number
    members: string[]
    source: string
  }[]
  relations: ProcessRelation[]
  decisions: {
    path: string
    role: string
    decision: string
    rejection_reason?: string
    notes?: unknown
    basis: ProcessBasis[]
    verification?: string
  }[]
  diagnostics: { message: string; basis: ProcessBasis[] }[]
  unknowns: string[]
}
export function processArtifacts(
  files: SceneArtifact[],
  process?: SceneProcess
): SceneArtifact[] {
  if (!process) return files
  const annotated = files.map((file) => {
    const decisions = process.decisions.filter((d) => d.path === file.id)
    if (!decisions.length) return file
    const rejected = decisions.find((d) => d.decision === 'rejected')
    const suffix = rejected
      ? ' · 已拒绝'
      : decisions[0].decision === 'existing_output_reused'
        ? ' · 早期生成结果复用（来源声明）'
        : ''
    return {
      ...file,
      title: file.title + suffix,
      status: rejected ? 'rejected' : file.status
    }
  })
  return [
    ...annotated,
    ...process.entities.map((item) => ({
      ...item,
      sha256: item.basis[0].sha256,
      error: null,
      text: JSON.stringify(
        { ...(item.data as object), basis: item.basis, origin: 'contract' },
        null,
        2
      ),
      image: false
    }))
  ]
}
export function processGroups(
  files: SceneArtifact[],
  process: SceneProcess,
  fallback: SceneResultGroup[]
): SceneResultGroup[] {
  const all = processArtifacts(files, process)
  const byId = new Map(all.map((f) => [f.id, f]))
  const grouped = new Set<string>()
  const folders = process.views.map((view) => {
    const members = view.members.map((id) => {
      grouped.add(id)
      return (
        byId.get(id) || {
          id,
          title: id,
          stage: view.stage,
          kind: 'unprojected',
          sha256: '',
          status: 'unverified',
          error: '文件不提供预览；请查看关联 pin 核实状态',
          data: null,
          text: null,
          image: false
        }
      )
    })
    const preview = members.find((f) => f.image) || members[0]
    return { ...view, files: members, preview, folder: true }
  })
  const remaining = fallback
    .map((group) => ({
      ...group,
      files: group.files
        .filter((f) => !grouped.has(f.id) || f.id.startsWith('reviews/'))
        .map((f) => byId.get(f.id) || f)
    }))
    .filter((group) => group.files.length)
    .map((group) => ({
      ...group,
      title:
        group.title +
        (group.files.some((f) =>
          process.decisions.some(
            (d) => d.path === f.id && d.decision === 'existing_output_reused'
          )
        )
          ? ' · 早期结果复用（来源声明）'
          : ''),
      preview:
        group.files.find((f) => f.image && f.status !== 'rejected') ||
        group.files[0]
    }))
  const requirements = all
    .filter((f) => f.kind === 'requirement')
    .map((f) => ({
      id: f.id,
      title: f.title,
      stage: f.stage,
      files: [f],
      preview: f
    }))
  return [...folders, ...requirements, ...remaining]
}
