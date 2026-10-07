# v0.2 implementation and verification

Owner: Sean. Updated 2026-10-07. Task `remote-31356340-f29d-4fd4-9919-e4abac5bf291`.
Authority: [AI video creation v0.2](../design/sean_ai_video_creation_v0_2.md).

## Current behavior

The root view is `WorkflowStudioView.vue`. Its durable LGraph projects chapters, scenes, entities, pending proposals and resources. Workflow definitions and native agent conversations are not business nodes. Run chips and dashed execution bindings are a separate overlay. Completed/failed runs are hidden by default and remain accessible in history and resource provenance. Chapter focus selects related entities; concept and three-view images expand on the canvas. Layout uses compact category columns; view scale/offset persist privately. This is the initial layout choice, not a large-project performance claim.

`server/workflows.mjs` owns StructureNovel, ExtractEntities, CreateEntity and GenerateThreeView. HTTP, `scripts/sean-studio/workflow.mjs`, manual import/reference/confirmation controls and the bound Pi tool use these operations. Workflow definitions are versioned capabilities; runs hold immutable input revisions, parameters, child runs and output references. Data relations remain independent of execution relations.

Novel import accepts text/Markdown and deterministically recognizes Chinese chapter headings, Chapter headings and Markdown headings. Chapters retain source offsets, paragraph anchors and hashes. This is structural splitting, not an AI rewriting algorithm. Compatible legacy chapters keep their IDs; superseded duplicates remain in history. ExtractEntities reads source text through audited, paginated tools and submits proposals. Individual human confirmation preserves earlier endpoint mappings and creates chapter/entity relations. Scene state continues to use entity_use without overwriting identity.

CreateEntity collects registered image/text references and automatically binds target/context. A human grants at most four concepts and optionally one downstream three-view, with expiry and entity revision checking. Concept calls create parallel business children; shared GPU execution is serialized by queue checks and hive-resource leases. Formal appearance confirmation records the selected asset, updates its resource status, and automatically schedules the already-authorized fixed three-view using that appearance. The agent cannot confirm facts or appearance. The fixed three-view instruction comes from the existing reviewed Qwen multiview template; this does not establish its visual quality.

Generated assets retain source asset IDs, child Run IDs, business Run IDs, graph hashes and parameters. Native snapshots are compiled from real registered-node templates and available read-only. PNG references are content-addressed in the private store; thumbnails are genuine cached images bounded to 384 pixels.

Agent conversation remains in independent Pi Web. Workflow/target scope resumes its own continuous session; automatic context uses live references, not copies of the full novel. Canvas shows a short status/output preview and exact-session link. Pi Web intentionally hides idle transient sessions: the bridge records a guarded read-only initialization turn and checks the exact session's presence in the native catalog before navigation. Failed launch never falls back to the Pi Web root. Initialization cannot generate or adopt anything. Workspace trust remains exact and explicit.

## Verification on 2026-10-07

- 18 automated tests pass (server and PI extension suites): transaction/replay, project/source boundaries, partial confirmation, stale inputs, unknown-submit no repost, scope/budget, parallel concepts → serial three-view binding, migration, exact-session navigation, real PNG ingestion and cached thumbnail dimensions.
- Frontend typecheck, targeted lint and production build passed during implementation; final commit checks record the latest result.
- The real registered frontend imported/exported the new nine-node snapshot. A two-reference eleven-node snapshot also passed the service UI/API verifier. [Captured multi-reference evidence](native-multi-reference-roundtrip.json) uses synthetic image names and establishes wiring only, not image reading/generation.
- Real Pi Web ExtractEntities read the first chapter and created Run `c0ecc3e8-0cab-4535-8033-4f622d2e1e45` and proposal `a568e1f5-d19c-4c3b-b9ee-c81d5a85f2d5`, waiting for individual human confirmation. No facts from the user's story were adopted.
- User explicitly trusted isolated test workspace `b6d01a80-8662-413e-b33e-0a1450733380/agent-workspace/36a3709a-2927-4ea4-8f63-603c35c5e9c9`. Its test entity and grant carry automated_test provenance. Real Pi Web Agent called the shared generation operation and created two-child Concept Run `72ef5762-ac87-4d6d-9db6-594fa83362d0` with automatic entity input binding.
- Actual generation failed in shared ComfyUI VAELoader/model-management synchronization with `torch.AcceleratorError: CUDA error: unknown error`. The other still-pending item was cancelled by its own prompt ID; no global interrupt/restart was performed. Shared queue is empty and this task's lease was released. That initial attempt produced no assets. The user subsequently restored ComfyUI, and the fresh run below supersedes the runtime blockage without changing the failed history.
- An early empty-session link restored the old native conversation; scope/grant checks rejected its generation instruction. The test was stopped, a correction was sent to the old conversation, and catalog-verified initialization plus regression coverage fixed navigation. This incident did not produce images or adopt facts.

## Outstanding acceptance and limits

The isolated real-image chain passed after the user restored ComfyUI. Pi Web Agent created Concept Run `c4015c08-6bc0-4524-ab69-c33a35d044b1` (two candidates, seeds 4207/4208, 25 steps). The waiting-confirmation state, runs and resources survived a private Studio server restart without new submissions. The canvas confirmation button selected asset `cffb095a-12d1-4358-b0ba-97ff917d661a`, actor `automated_test`; it automatically started ThreeView Run `2696e560-c13b-4d7e-bbef-58c05f30bb85`, binding the selected image and entity revision 2. Its output is `f5e7b45e-94e7-44b0-a360-249195af4a30` (1536×1024). This test decision does not adopt any user story fact or choose a production appearance.

All three PNG hashes match their private stored bytes, scoped ComfyUI output files were cleaned after durable collection, reduced thumbnails decode, and replaying the exact appearance request returns the same selection with exactly one downstream Run. Browser refresh preserves three resources, folds completed Run overlays and restores history/provenance. Real Pi Web `view_image` returned both selected concept and three-view to the configured vision-capable model with read audits; no extra generation or confirmation occurred. Shared queue and resource leases are empty after execution. See [machine-readable real acceptance evidence](real-workflow-acceptance-20261007.json).

Direct visual inspection finds coherent short bob hair, navy workwear, gray left-sleeve patch, dark trousers and black shoes. The three-view contains full-body front/side/back on off-white. The front is slightly three-quarter, so this passes the interaction/technical closed-loop check rather than a strict orthographic drafting standard. Back-view patch visibility and fine identity consistency remain visual limitations. Production appearance and story correctness still require the user's judgment. No shared lifecycle permission is implied by workspace trust.

Reference collection currently registers local PNGs, existing assets, text and source URLs; it does not automatically browse/download external websites. Large-novel indexing, large-canvas performance, persisted user-dragged layout, explicit session pause/resume controls, candidate rejection/correction UI and pre-submit rebinding UI need further work. Pi Web stop/continuous conversation and waiting-confirmation continuation remain available. Native compatibility is limited to the fixed Qwen node set. Product tool filtering is not an OS process sandbox; trusted host extensions still run as host code. Full video/audio and cross-Workflow orchestration remain outside this MVP.

## Running and API

Use the existing private Studio server on 4318 and Vite preview on 5318. ComfyUI at 8188 and Pi Web at 30141 are shared existing services; never start a second ComfyUI instance. Private SQLite/media/workspaces live under `~/.local/share/entity-canvas-studio`.

```sh
node --test server/*.test.mjs
node scripts/sean-studio/workflow.mjs definitions
node scripts/sean-studio/workflow.mjs context <session-id>
node scripts/sean-studio/workflow.mjs open <project-id> CreateEntity <request.json>
node scripts/sean-studio/workflow.mjs operate <session-id> generate_concepts <request.json>
```

HTTP base is `/studio-api/v1`; writes require requestId. Human generation grants and appearance selection are separate explicit endpoints, not agent tools. Unknown submissions reconcile their original execution key and never automatically repost. Cancel only the run's pending prompt; a running shared generation cannot be globally interrupted from Studio.

Upstream seams remain `src/router.ts`, `vite.config.mts`, project AGENTS and ignores. Business code stays under `src/sean-studio`, `server`, `pi`, `templates/qwen`, and `scripts/sean-studio`. Preserve upstream GPL licensing. Only upstream ComfyUI git remote exists; do not publish Sean's branch to upstream.
