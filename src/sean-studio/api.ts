// Owner: Sean.
export async function studioApi(path: string, body?: unknown, method?: string) {
  const response = await fetch('/studio-api/v1' + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || response.statusText)
  return data
}
export const requestId = () => crypto.randomUUID()
