// Owner: Sean. Private domain store; facts and outbox commit together.
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
export const hash = (value) =>
  createHash('sha256')
    .update(
      typeof value === 'string' || value instanceof Uint8Array
        ? value
        : JSON.stringify(value)
    )
    .digest('hex')
export const uuid = randomUUID
export function requireThat(ok, message, status = 422) {
  if (!ok) throw Object.assign(new Error(message), { status })
}
export class Store {
  constructor(file) {
    mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS objects(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), kind TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions(object_id TEXT NOT NULL REFERENCES objects(id), revision INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(object_id, revision));
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES projects(id), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations(scope TEXT NOT NULL, request_id TEXT NOT NULL, hash TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(scope, request_id));
      CREATE TABLE IF NOT EXISTS compat(key TEXT PRIMARY KEY, body TEXT NOT NULL);`)
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }
  write(scope, request, fn) {
    requireThat(
      typeof request.requestId === 'string' && request.requestId.length > 0,
      'requestId required'
    )
    return this.transaction(() => {
      const digest = hash(request),
        old = this.db
          .prepare('SELECT * FROM operations WHERE scope=? AND request_id=?')
          .get(scope, request.requestId)
      if (old) {
        requireThat(
          old.hash === digest,
          'requestId reused with different content',
          409
        )
        return JSON.parse(old.result)
      }
      const result = fn()
      this.db
        .prepare('INSERT INTO operations VALUES(?,?,?,?)')
        .run(scope, request.requestId, digest, JSON.stringify(result))
      return result
    })
  }
  project(id) {
    const p = this.db.prepare('SELECT body FROM projects WHERE id=?').get(id)
    requireThat(p, 'project not found', 404)
    return JSON.parse(p.body)
  }
  updateProjectSettings(id, expectedRevision, settings) {
    const current = this.project(id)
    requireThat(
      current.revision === expectedRevision,
      'project settings changed; reload project context',
      409
    )
    const updated = {
      ...current,
      settings: { ...(current.settings || {}), ...settings },
      revision: current.revision + 1
    }
    this.db
      .prepare('UPDATE projects SET body=? WHERE id=?')
      .run(JSON.stringify(updated), id)
    this.event(id, 'project.settings_updated', {
      revision: updated.revision,
      settings: updated.settings
    })
    return updated
  }
  createProject(body) {
    const p = {
      id: uuid(),
      owner: 'Sean',
      name: body.name || 'Untitled',
      settings: body.settings || {},
      revision: 1
    }
    this.db
      .prepare('INSERT INTO projects VALUES(?,?)')
      .run(p.id, JSON.stringify(p))
    this.event(p.id, 'project.created', p)
    return p
  }
  event(projectId, type, data) {
    const body = { type, data, at: new Date().toISOString() }
    const r = this.db
      .prepare('INSERT INTO events(project_id,body) VALUES(?,?)')
      .run(projectId, JSON.stringify(body))
    return { seq: Number(r.lastInsertRowid), ...body }
  }
  get(id, revision) {
    const row = revision
      ? this.db
          .prepare(
            'SELECT body FROM revisions WHERE object_id=? AND revision=?'
          )
          .get(id, revision)
      : this.db.prepare('SELECT body FROM objects WHERE id=?').get(id)
    requireThat(row, 'object/revision not found', 404)
    return JSON.parse(row.body)
  }
  list(projectId, kind) {
    return this.db
      .prepare(
        'SELECT body FROM objects WHERE project_id=? AND (? IS NULL OR kind=?) ORDER BY rowid'
      )
      .all(projectId, kind || null, kind || null)
      .map((r) => JSON.parse(r.body))
  }
  create(projectId, kind, data) {
    this.project(projectId)
    const item = {
      ...data,
      id: uuid(),
      projectId,
      kind,
      revision: 1,
      owner: 'Sean'
    }
    this.db
      .prepare('INSERT INTO objects VALUES(?,?,?,?,?)')
      .run(item.id, projectId, kind, 1, JSON.stringify(item))
    this.db
      .prepare('INSERT INTO revisions VALUES(?,?,?)')
      .run(item.id, 1, JSON.stringify(item))
    this.event(projectId, `${kind}.created`, item)
    return item
  }
  update(id, expectedRevision, fields) {
    const old = this.get(id)
    requireThat(
      old.revision === expectedRevision,
      'revision conflict; draft preserved',
      409
    )
    const item = {
      ...old,
      ...fields,
      id: old.id,
      projectId: old.projectId,
      kind: old.kind,
      owner: 'Sean',
      revision: old.revision + 1
    }
    this.db
      .prepare('UPDATE objects SET revision=?,body=? WHERE id=?')
      .run(item.revision, JSON.stringify(item), id)
    this.db
      .prepare('INSERT INTO revisions VALUES(?,?,?)')
      .run(id, item.revision, JSON.stringify(item))
    this.event(item.projectId, `${item.kind}.updated`, item)
    return item
  }
  sameProject(id, projectId, kind) {
    const o = this.get(id)
    requireThat(
      o.projectId === projectId && (!kind || o.kind === kind),
      'invalid project or object kind'
    )
    return o
  }
  snapshot(id) {
    const project = this.project(id)
    return {
      project,
      objects: this.list(id),
      latestSeq: this.db
        .prepare('SELECT COALESCE(MAX(seq),0) n FROM events WHERE project_id=?')
        .get(id).n
    }
  }
  events(id, after = 0) {
    this.project(id)
    return this.db
      .prepare(
        'SELECT seq,body FROM events WHERE project_id=? AND seq>? ORDER BY seq LIMIT 1000'
      )
      .all(id, after)
      .map((e) => ({ seq: e.seq, ...JSON.parse(e.body) }))
  }
  compatGet(key, fallback) {
    const r = this.db.prepare('SELECT body FROM compat WHERE key=?').get(key)
    return r ? JSON.parse(r.body) : fallback
  }
  compatSet(key, value) {
    this.db
      .prepare('INSERT OR REPLACE INTO compat VALUES(?,?)')
      .run(key, JSON.stringify(value))
  }
  close() {
    this.db.close()
  }
}
