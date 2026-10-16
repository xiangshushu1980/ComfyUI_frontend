// Owner: Sean. Read-only interpretation of existing production contracts.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'

export async function sceneProcess(root, files) {
  const byPath = new Map(files.map((f) => [f.id, f]))
  const entities = [],
    relations = [],
    views = [],
    diagnostics = []
  const list = (value) =>
    Array.isArray(value)
      ? value.map((item) => (item && typeof item === 'object' ? item : {}))
      : []
  const checks = new Map()
  const selectionChecks = new Map()
  const outside = (p) => p === '..' || p.startsWith(`..${sep}`)
  async function verify(pin) {
    if (!pin?.path) return 'unverified'
    const key = JSON.stringify([pin.path, pin.sha256])
    if (checks.has(key)) return checks.get(key)
    let state = 'unverified'
    try {
      const lexical = resolve(root, pin.path)
      if (outside(relative(root, lexical))) state = 'outside'
      else {
        const actual = await realpath(lexical)
        if (outside(relative(root, actual))) state = 'outside'
        else {
          const info = await stat(actual)
          if (info.isFile() && info.size <= 512 * 1024 * 1024) {
            let hash = byPath.get(pin.path)?.sha256
            if (!hash && pin.sha256) {
              const digest = createHash('sha256')
              for await (const chunk of createReadStream(actual))
                digest.update(chunk)
              hash = digest.digest('hex')
            }
            state = !pin.sha256
              ? 'unverified'
              : hash === pin.sha256
                ? 'verified'
                : 'stale'
          }
        }
      }
    } catch (e) {
      state = e.code === 'ENOENT' ? 'missing' : 'unverified'
    }
    checks.set(key, state)
    return state
  }
  const basis = (f, field) => ({ path: f.id, sha256: f.sha256, field })
  function entity(f, field, kind, title, data, stage) {
    const id = `process:${f.id}#${field}`
    const item = {
      id,
      title,
      kind,
      stage,
      data,
      status:
        data?.result ||
        {
          selection: 'selected_in_manifest',
          instance: 'declared_in_spec',
          requirement: 'recorded',
          candidates: 'candidate_record'
        }[kind] ||
        'unknown',
      origin: 'contract',
      basis: [basis(f, field)],
      source: f.id
    }
    entities.push(item)
    return id
  }
  async function link(from, to, type, f, field, pin, extra = {}) {
    const verification = pin ? await verify(pin) : 'verified'
    const rel = {
      from,
      to,
      type,
      field,
      origin: 'contract',
      basis: [basis(f, field)],
      pin: pin || null,
      verification,
      ...extra
    }
    relations.push(rel)
    if (rel.verification !== 'verified')
      diagnostics.push({
        ...rel,
        message: `${type}: ${pin?.path || field} · ${rel.verification}`
      })
    return rel
  }
  function folder(id, title, stage, members, source) {
    views.push({ id, title, stage, members: [...new Set(members)], source })
  }
  const requirements = new Map(),
    selections = new Map()
  for (const f of files.filter((f) => f.data?.kind === 'breakdown')) {
    for (const [i, req] of list(f.data.requirements).entries()) {
      if (typeof req.id !== 'string') continue
      const id = entity(f, `requirements.${i}`, 'requirement', req.id, req, 0)
      requirements.set(`${f.id}:${req.id}`, id)
      await link(f.id, id, 'documented_by', f, `requirements.${i}`)
    }
  }
  for (const f of files.filter((f) => f.data?.kind === 'asset_manifest')) {
    for (const [i, asset] of list(f.data.assets).entries()) {
      if (typeof asset.requirement !== 'string') continue
      const field = `assets.${i}`
      const id = entity(
        f,
        field,
        'selection',
        `${asset.requirement} · ${asset.entry}`,
        asset,
        1
      )
      selections.set(`${f.id}:${asset.requirement}`, id)
      const req = requirements.get(
        `${f.data.breakdown?.path}:${asset.requirement}`
      )
      if (req) await link(req, id, 'selected_for', f, field, f.data.breakdown)
      const members = [id, f.id]
      for (const role of ['record', 'review']) {
        const pin = asset[role]
        if (!pin?.path) continue
        await link(
          id,
          pin.path,
          role === 'record' ? 'selected_for' : 'reviewed',
          f,
          `${field}.${role}`,
          pin
        )
        members.push(pin.path)
      }
      const selectionPins = [
        asset.record,
        asset.review,
        f.data.identity
      ].filter(Boolean)
      const selectionStates = await Promise.all(selectionPins.map(verify))
      if (f.data.identity && (await verify(f.data.identity)) !== 'verified')
        diagnostics.push({
          message: `${f.id} # identity: ${await verify(f.data.identity)}`,
          pin: f.data.identity,
          basis: [basis(f, 'identity')]
        })
      selectionChecks.set(
        id,
        selectionStates.every((state) => state === 'verified')
          ? 'verified'
          : 'partial'
      )
      const record = byPath.get(asset.record?.path)
      const review = byPath.get(asset.review?.path)
      if (
        record?.data?.kind !== 'asset' ||
        review?.data?.kind !== 'asset_review' ||
        review.data.asset_sha256 !== asset.record?.sha256
      ) {
        selectionChecks.set(id, 'partial')
        diagnostics.push({
          message: `${f.id} # ${field}: asset record/review identity not verified`,
          basis: [basis(f, field)]
        })
      }
      if (record) {
        members.push(record.id)
        for (const [role, pin] of Object.entries(record.data?.files || {})) {
          if (typeof pin?.path !== 'string') {
            diagnostics.push({
              message: `${record.id} # files.${role}: malformed file pin`,
              basis: [basis(record, `files.${role}`)]
            })
            selectionChecks.set(id, 'partial')
            continue
          }
          await link(
            record.id,
            pin.path,
            'documented_by',
            record,
            `files.${role}`,
            pin,
            { role }
          )
          members.push(pin.path)
        }
        for (const [j, pin] of list(record.data?.previews).entries()) {
          if (typeof pin.path !== 'string') continue
          await link(
            record.id,
            pin.path,
            'produced',
            record,
            `previews.${j}`,
            pin,
            { role: 'prepared_preview' }
          )
          members.push(pin.path)
        }
        if (record.data?.provenance?.path) {
          members.push(record.data.provenance.path)
          await link(
            record.id,
            record.data.provenance.path,
            'documented_by',
            record,
            'provenance',
            record.data.provenance
          )
        }
      }
      if (record) {
        const depStates = await Promise.all(
          [
            ...Object.values(record.data?.files || {}),
            ...list(record.data?.previews),
            record.data?.provenance
          ]
            .filter(Boolean)
            .map(verify)
        )
        if (depStates.some((state) => state !== 'verified'))
          selectionChecks.set(id, 'partial')
      }
      if (
        record &&
        review &&
        list(record.data?.previews).some(
          (pin) =>
            !Array.isArray(review.data?.preview_hashes) ||
            !review.data.preview_hashes.includes(pin.sha256)
        )
      ) {
        selectionChecks.set(id, 'partial')
        diagnostics.push({
          message: `${review.id}: preview hashes do not cover the pinned asset previews`,
          basis: [basis(review, 'preview_hashes')]
        })
      }
      const identity = byPath.get(f.data.identity?.path)
      const card = identity?.data?.assets?.[asset.requirement]
      if (card?.visual_card?.path) {
        const matches =
          card.asset_record_sha256 === asset.record?.sha256 &&
          (await verify(f.data.identity)) === 'verified'
        await link(
          id,
          card.visual_card.path,
          'informed_by',
          identity,
          `assets.${asset.requirement}.visual_card`,
          card.visual_card,
          {
            role: 'visual_card',
            verification: matches ? await verify(card.visual_card) : 'stale'
          }
        )
        if (!matches || (await verify(card.visual_card)) !== 'verified')
          selectionChecks.set(id, 'partial')
        members.push(card.visual_card.path, identity.id)
      }
      folder(
        `object:${id}`,
        `${asset.requirement} · ${f.data.id}`,
        1,
        members,
        f.id
      )
    }
  }
  for (const f of files.filter((f) => f.data?.kind === 'asset_plan')) {
    for (const [i, item] of list(f.data.items).entries()) {
      if (typeof item.requirement !== 'string') continue
      const id = entity(
        f,
        `items.${i}`,
        'candidates',
        `${item.requirement} · 查库候选`,
        item,
        1
      )
      const req = requirements.get(
        `${f.data.breakdown?.path}:${item.requirement}`
      )
      if (req)
        await link(id, req, 'candidate_for', f, `items.${i}`, f.data.breakdown)
      // Only explicit requirement + breakdown identity joins a plan to its selection.
      for (const manifest of files.filter(
        (n) =>
          n.data?.kind === 'asset_manifest' &&
          n.data.breakdown?.path === f.data.breakdown?.path
      )) {
        const selected = selections.get(`${manifest.id}:${item.requirement}`)
        const view = views.find((v) => v.id === `object:${selected}`)
        if (view) view.members.push(id)
      }
    }
  }
  const instances = new Map()
  for (const f of files.filter((f) => f.data?.kind === 'scene_spec')) {
    const manifest = f.data.layout_validation?.manifest
    const members = [f.id]
    for (const [i, instance] of list(f.data.instances).entries()) {
      if (typeof instance.id !== 'string') continue
      const id = entity(
        f,
        `instances.${i}`,
        'instance',
        `${instance.requirement} · ${instance.id}`,
        instance,
        2
      )
      members.push(id)
      instances.set(`${f.id}:${instance.id}`, id)
      const selection = selections.get(
        `${manifest?.path}:${instance.requirement}`
      )
      if (selection)
        await link(
          selection,
          id,
          'used_in',
          f,
          `instances.${i}.requirement`,
          manifest,
          {
            verification:
              (await verify(manifest)) === 'verified' &&
              selectionChecks.get(selection) === 'verified'
                ? 'verified'
                : 'partial',
            scope: 'manifest_record_and_direct_asset_dependencies'
          }
        )
      else
        diagnostics.push({
          message: `${f.id} · ${instance.id}: pinned manifest selection unknown`,
          basis: [basis(f, `instances.${i}`)]
        })
      await link(id, f.id, 'documented_by', f, `instances.${i}`)
    }
    folder(`layout:${f.id}`, f.data.id, 2, members, f.id)
  }
  for (const f of files.filter((f) => f.data?.kind === 'scene_handoff')) {
    const members = [f.id]
    for (const [i, pin] of list(f.data.inputs).entries()) {
      if (typeof pin.path !== 'string') continue
      await link(pin.path, f.id, 'consumed', f, `inputs.${i}`, pin)
      members.push(pin.path)
      const spec = byPath.get(pin.path)
      if (spec?.data?.kind === 'scene_spec')
        for (const instance of list(spec.data.instances))
          members.push(instances.get(`${spec.id}:${instance.id}`))
    }
    for (const [i, pin] of list(f.data.outputs).entries()) {
      if (typeof pin.path !== 'string') continue
      await link(f.id, pin.path, 'produced', f, `outputs.${i}`, pin)
      members.push(pin.path)
    }
    for (const review of files.filter(
      (n) => n.data?.kind === 'scene_review' && n.data.handoff?.path === f.id
    )) {
      members.push(review.id)
      await link(
        f.id,
        review.id,
        'reviewed',
        review,
        'handoff',
        review.data.handoff
      )
      for (const [i, pin] of list(review.data.images).entries())
        await link(pin.path, review.id, 'reviewed', review, `images.${i}`, pin)
    }
    const execution = files.find(
      (n) => n.id === f.id.replace(/handoff.json$/, 'execution.json')
    )
    if (execution) members.push(execution.id)
    folder(`attempt:${f.id}`, f.data.id, 3, members.filter(Boolean), f.id)
  }
  // Failed/partial executions without handoffs remain browseable attempts.
  for (const f of files.filter((f) =>
    /^scenes\/[^/]+\/execution.json$/.test(f.id)
  )) {
    if (!views.some((v) => v.stage === 3 && v.members.includes(f.id))) {
      const dir = f.id.slice(0, f.id.lastIndexOf('/') + 1)
      folder(
        `attempt:${f.id}`,
        dir.split('/')[1],
        3,
        files.filter((n) => n.id.startsWith(dir)).map((n) => n.id),
        f.id
      )
    }
  }
  const decisions = []
  for (const f of files.filter((f) => f.data?.kind === 'asset_identity')) {
    for (const [i, target] of list(f.data.targets).entries()) {
      if (!target.path) continue
      decisions.push({
        ...target,
        basis: [basis(f, `targets.${i}`)],
        origin: 'contract',
        verification: await verify(target)
      })
      await link(f.id, target.path, 'informed_by', f, `targets.${i}`, target, {
        role: target.role,
        decision: target.decision
      })
    }
  }
  for (const f of files.filter((f) => f.data?.source_method)) {
    const generator = f.data.provenance?.generator
    decisions.push({
      path: f.id,
      role: f.data.source_method,
      decision:
        typeof generator === 'string' &&
        /existing output, not run/i.test(generator)
          ? 'existing_output_reused'
          : 'source_record',
      notes: generator || null,
      basis: [basis(f, 'source_method'), basis(f, 'provenance')],
      origin: 'contract'
    })
  }
  return {
    entities,
    views,
    relations,
    decisions,
    diagnostics,
    scope: 'existing_contracts',
    unknowns: [
      'Execution times and revision causes are not inferred.',
      'Review passed does not imply delivery or user acceptance.',
      'World dependency closure has not been verified.'
    ]
  }
}
