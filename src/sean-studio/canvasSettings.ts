// Owner: Sean. Shared settings contract and storage keys for every Studio canvas.
export type CanvasSettings = {
  nodePadding: number
  showCapabilityBadges: boolean
  linkStyle: 'spline' | 'linear' | 'straight'
  linkMarker: 'circle' | 'arrow' | 'none'
  linkColor: string
  linkWidth: number
  panelOpacity: number
}

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  nodePadding: 4,
  showCapabilityBadges: true,
  linkStyle: 'spline',
  linkMarker: 'circle',
  linkColor: '#99aa99',
  linkWidth: 3,
  panelOpacity: 0.94
}

export function normalizeCanvasSettings(value: unknown): CanvasSettings {
  const saved = value && typeof value === 'object' ? value : {}
  const item = saved as Partial<CanvasSettings>
  return {
    nodePadding: Number.isFinite(item.nodePadding)
      ? Math.min(20, Math.max(4, item.nodePadding!))
      : DEFAULT_CANVAS_SETTINGS.nodePadding,
    showCapabilityBadges: item.showCapabilityBadges !== false,
    linkStyle: ['spline', 'linear', 'straight'].includes(String(item.linkStyle))
      ? (item.linkStyle as CanvasSettings['linkStyle'])
      : DEFAULT_CANVAS_SETTINGS.linkStyle,
    linkMarker: ['circle', 'arrow', 'none'].includes(String(item.linkMarker))
      ? (item.linkMarker as CanvasSettings['linkMarker'])
      : DEFAULT_CANVAS_SETTINGS.linkMarker,
    linkColor: /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(item.linkColor || '')
      ? item.linkColor!
      : DEFAULT_CANVAS_SETTINGS.linkColor,
    linkWidth: Number.isFinite(item.linkWidth)
      ? Math.min(12, Math.max(1, item.linkWidth!))
      : DEFAULT_CANVAS_SETTINGS.linkWidth,
    panelOpacity: Number.isFinite(item.panelOpacity)
      ? Math.min(1, Math.max(0.35, item.panelOpacity!))
      : DEFAULT_CANVAS_SETTINGS.panelOpacity
  }
}

export const canvasSettingsStorageKey = (projectId: string) =>
  `sean-studio-canvas-settings:${projectId}`
export const inspectorWidthStorageKey = (projectId: string) =>
  `sean-studio-inspector-width:${projectId}`
