/** Shared filename presentation for the AI and scene canvases. */
export function isJsonCanvasNode(value: {
  kind?: string
  type?: string
  mimeType?: string
  mime_type?: string
  name?: string
  title?: string
}) {
  const mime = String(value.mimeType || value.mime_type || value.type || '')
    .toLowerCase()
    .split(';', 1)[0]
    .trim()
  const filenames = [value.name, value.title]
    .filter((name): name is string => Boolean(name))
    .map((name) => name.split(/[\\/]/).pop() || '')
  return (
    mime === 'application/json' ||
    mime.endsWith('+json') ||
    filenames.some((filename) => /\.(?:app\.)?json$/i.test(filename))
  )
}

/** Only plain text documents keep an inline content preview on canvas. */
export function hasCanvasTextPreview(value: {
  name?: string
  title?: string
  type?: string
  mimeType?: string
  mime_type?: string
}) {
  const mime = String(value.mimeType || value.mime_type || value.type || '')
    .toLowerCase()
    .split(';', 1)[0]
    .trim()
  const filenames = [value.name, value.title]
    .filter((name): name is string => Boolean(name))
    .map((name) => name.split(/[\\/]/).pop() || '')
  return (
    mime === 'text' ||
    mime.startsWith('text/') ||
    filenames.some((filename) => /\.(?:txt|md)$/i.test(filename))
  )
}

/** Match Media Browser: show a filename stem, without its extension. */
export function canvasNodeDisplayName(value: string, json = false) {
  const filename = value.split(/[\\/]/).pop() || value
  if (!json) return filename
  return filename.replace(/(?:\.app)?\.json$/i, '')
}
