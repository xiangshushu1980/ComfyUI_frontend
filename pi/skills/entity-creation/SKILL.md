---
name: entity-creation
description: Manage an entity's reference images and its concept design branches in Entity Canvas Studio.
---

# Entity references and concept images

Owner: Sean. Current scope: reference images and concept-image branches. Three-view and voice workflows are deferred; do not start or prepare them.

Use only in a bound `CreateEntity` workflow. Treat the canvas as the durable record. The entity root owns its reference images and each concept design description. Every description has a paired prompt node; each generated image belongs to the Run created from that exact branch.

## Concept conversation

For a session goal beginning `概念图生成`, start with a concise natural-language summary, without IDs or internal terms:

1. Introduce the entity using its stored facts; do not invent canon.
2. Recommend a main-image direction based on the entity and its role.
3. Report every active reference and its saved usage note. Inspect reference assets when possible; honor the user's note about why each image matters.
4. Check project visual style. If none is confirmed, suggest a suitable style and ask whether it should apply to the project or only this image.
5. Ask one concise confirmation covering description, chosen references and usage, missing details, and style. Do not generate before confirmation.

After confirmation, write the exact image description and matching Qwen Image 2.1 prompt. Call `workflow_operation` with `operation: "prepare_concept"` and parameters `{ requestId, confirmedPlan: true, description, prompt, referenceIds, visualStyle? }`. `referenceIds` are ordered image asset IDs from context, not resource node IDs. This creates or updates a description directly under the entity root and its paired prompt. Planning does not generate an image.

When a user asks to generate from a saved description, finish or update its paired prompt and reference bindings, then direct the user to that branch's 概念图生成 canvas action. This planning conversation must not submit generation; the canvas action confirms the exact saved branch and starts one image Run.

## Editing canvas data

- Add a user-supplied reference image with `add_reference`; preserve its usage note in `description`. Do not invent or search for references.
- Delete a reference or generated image with `remove_resource` and its exact `resourceId` plus `expectedRevision`. Removing one image must not delete its plan or sibling images.
- Edit a description or prompt with `update_resource`, using its exact `resourceId` and current `expectedRevision` from context. If a description changes, update its paired prompt to match before generation. A stale prompt must not be used.
- Deleting a concept description also deletes its paired prompt. Historical Runs and generated images remain available.
- Every operation must use node IDs and revisions returned in the current workflow context. Never guess them.

Use [`references/qwen-image-2-1-prompting.md`](references/qwen-image-2-1-prompting.md) for Qwen's prompt and multi-reference guidance. Bind each reference explicitly and preserve the reference order. Do not confuse Qwen's `<image1>` tags with H3's `Image 1` syntax.

Do not confirm an image as the formal appearance on the user's behalf. Report generation progress and results in natural language; keep IDs out of user-facing prose. If `generationMode` is `mock`, clearly say outputs are simulated and were not produced by an image model.
