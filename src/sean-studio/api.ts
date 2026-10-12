// Owner: Sean.
export async function studioApi(
  path: string,
  body?: unknown,
  method?: string,
  signal?: AbortSignal
) {
  const response = await fetch('/studio-api/v1' + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || response.statusText)
  return data
}
export const requestId = () => crypto.randomUUID()
