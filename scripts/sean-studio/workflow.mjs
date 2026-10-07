#!/usr/bin/env node
// Owner: Sean. CLI is an adapter to the same business operations used by UI/Agent.
import { readFileSync } from 'node:fs'
const [command, id, operation, file] = process.argv.slice(2)
const root = process.env.STUDIO_URL || 'http://127.0.0.1:4318'
const body = file ? JSON.parse(readFileSync(file, 'utf8')) : {}
const routes = {
  definitions: ['/workflow-definitions'],
  context: [`/workflow-sessions/${encodeURIComponent(id)}/context`],
  open: [
    `/projects/${encodeURIComponent(id)}/workflow-sessions`,
    {
      ...body,
      workflowId: operation,
      requestId: body.requestId || crypto.randomUUID()
    }
  ],
  operate: [
    `/workflow-sessions/${encodeURIComponent(id)}/operations/${encodeURIComponent(operation)}`,
    { ...body, requestId: body.requestId || crypto.randomUUID() }
  ]
}
if (!routes[command])
  throw new Error(
    'Usage: workflow.mjs definitions | context <session> | open <project> <workflow> [json-file] | operate <session> <operation> [json-file]'
  )
const [path, data] = routes[command]
const response = await fetch(root + '/studio-api/v1' + path, {
  method: data ? 'POST' : 'GET',
  headers: { 'content-type': 'application/json' },
  body: data ? JSON.stringify(data) : undefined
})
const result = await response.json()
if (!response.ok) throw new Error(result.error || response.statusText)
process.stdout.write(JSON.stringify(result, null, 2) + '\n')
