---
name: entity-creation
description: Manage an entity's reference images and its concept design branches in Entity Canvas Studio.
---

# Entity references and concept images

Owner: Sean. Current scope: reference images and concept-image branches. Three-view and voice workflows are deferred; do not start or prepare them.

Use only in a bound `CreateEntity` workflow. Treat the canvas as the durable record. The entity root owns its reference images and each concept design description. Every description has a paired prompt node; each generated image belongs to the Run created from that exact branch.

At the start of every Agent turn, the bridge injects a compact Workflow frame and relevant `canvasChanges` from the Studio API. Each change contains only changed fields with before/after values; it is not a full current-node snapshot. Incorporate these user edits into the current request, especially when the user says to continue. Agent-authored changes are excluded. At concept conversation startup, query `scope: "target"` with `fields: ["name", "type", "description", "role", "status", "assetId", "entityId", "conceptId", "conceptPlanId", "sourceResourceIds", "workflowSessionId"]` to retrieve the target entity and its direct resources, including numbered branches and their pairing. If a specific concept branch needs its full text, query `scope: "ids"` for only that branch's description and paired prompt resource IDs with `fields: ["text", "description"]`. Use `scope: "project_settings"` with `keys: ["visualStyle"]` to inspect the latest global style. Request only current data needed for the task; do not request a full snapshot by default. The server enforces Workflow scope and result limits. Do not bypass normal confirmation boundaries when applying an edit or starting a Run.

When the user asks to refresh or sync canvas data, report only newly detected changes and their impact. Do not repeat unchanged entities, references, style, or other workflow context. If `canvasChanges` is empty, say briefly that there are no new changes. Keep unchanged state in the conversation history; query it only when needed to safely apply a requested edit.

## Concept conversation

For a session goal beginning `概念图生成`, start with a concise natural-language summary. List saved branches by their user-facing number (方案 1, 方案 2, …), and ask whether the user wants to adjust one of them or create another:

1. Introduce the entity using its stored facts; do not invent canon.
2. Recommend a main-image direction based on the entity and its role.
3. Report every active reference and its saved usage note. Inspect reference assets when possible; honor the user's note about why each image matters.
4. Read `scope: "project_settings"` with `keys: ["visualStyle"]` before checking the project's global visual style. This returns the latest saved preset ID, prompt text, confirmation state, and revision; treat it as authoritative instead of relying on earlier chat text or cached style. The user can choose a prepared style preset in the global-style node or edit its prompt as a custom style. If the style is unconfirmed, suggest the default from this response and ask the user to confirm or change the project-wide style before planning. This style applies to all later image and video generation; do not offer a one-image override.
5. Ask one concise confirmation covering description, annotated references and usage, missing details, and the global style. Do not generate before confirmation.

After confirmation, write the exact image description and matching Qwen Image 2.1 prompt. Call `workflow_operation` with `operation: "prepare_concept"` and parameters `{ requestId, confirmedPlan: true, description, prompt, referenceIds }`. To update an existing branch, include its exact positive integer `conceptId`; never infer the target from recency or edit another branch. Omit `conceptId` to create a new numbered branch in a new concept conversation, or to update the branch already owned by the current conversation. Each new branch receives the next available number for that entity; deleted numbers are not reused. `referenceIds` are ordered image asset IDs from context, not resource node IDs; include only reference images with a non-empty saved usage note. The server reads and applies the current global visual style to the generated Run, and records its text, preset ID, and revision in the Run snapshot. This creates or updates a description directly under the entity root and its paired prompt. Planning does not generate an image.

When a user asks to generate from a saved description, finish or update its paired prompt and reference bindings, then direct the user to that branch's 概念图生成 canvas action. This planning conversation must not submit generation; the canvas action confirms the exact saved branch and starts one image Run.

## Editing canvas data

- Add a user-supplied reference image with `add_reference`; preserve its usage note in `description`. Do not invent or search for references.
- Delete a reference or generated image with `remove_resource` and its exact `resourceId` plus `expectedRevision`. Removing one image must not delete its plan or sibling images.
- Edit a description or prompt with `update_resource`, using its exact `resourceId` and current `expectedRevision` from context. When mentioning a concept branch, use its number and change only its paired description and prompt. If a description changes, update its paired prompt to match before generation. A stale prompt must not be used.
- Deleting a concept description also deletes its paired prompt. Historical Runs and generated images remain available.
- Every operation must use node IDs and revisions returned in the current workflow context. Never guess them.

Use [`references/qwen-image-2-1-prompting.md`](references/qwen-image-2-1-prompting.md) for Qwen's prompt and multi-reference guidance. Bind each reference explicitly and preserve the reference order. Do not confuse Qwen's `<image1>` tags with H3's `Image 1` syntax.

Do not confirm an image as the formal appearance on the user's behalf. Report generation progress and results in natural language; keep IDs out of user-facing prose. If `generationMode` is `mock`, clearly say outputs are simulated and were not produced by an image model.
