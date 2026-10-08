# v0.2 implementation and verification

Owner: Sean. Updated 2026-10-07. Task `remote-31356340-f29d-4fd4-9919-e4abac5bf291`.
Authority: [AI video creation v0.2](../design/sean_ai_video_creation_v0_2.md).

## Current behavior

The root view is `WorkflowStudioView.vue`. Its durable LGraph projects chapters, scenes, entities, pending proposals and resources. Workflow definitions and native agent conversations are not business nodes. Run chips and dashed execution bindings are a separate overlay. Completed/failed runs are hidden by default and remain accessible in history and resource provenance. Chapter focus selects related entities; concept and three-view images expand on the canvas. Layout uses compact category columns; view scale/offset persist privately. This is the initial layout choice, not a large-project performance claim.

`server/workflows.mjs` owns StructureNovel, ExtractEntities, CreateEntity and GenerateThreeView. HTTP, `scripts/sean-studio/workflow.mjs`, manual import/reference/confirmation controls and the bound Pi tool use these operations. Workflow definitions are versioned capabilities; runs hold immutable input revisions, parameters, child runs and output references. Data relations remain independent of execution relations.

Novel import accepts text/Markdown and deterministically recognizes Chinese chapter headings, Chapter headings and Markdown headings. Chapters retain source offsets, paragraph anchors and hashes. This is structural splitting, not an AI rewriting algorithm. Compatible legacy chapters keep their IDs; superseded duplicates remain in history. ExtractEntities reads source text through audited, paginated tools and submits proposals. Individual human confirmation preserves earlier endpoint mappings and creates chapter/entity relations. Scene state continues to use entity_use without overwriting identity.

The canvas novel-import form and the `StructureNovel` Agent operation both call `Workflows.structure`, so they create/read the same project source and chapter records. The form sends the full novel text to that project operation directly. PiWeb Workflow context is a separate conversation: it receives source/chapter references and retrieves actual text with audited `read_chapter` or `read_source` calls; the full novel is not copied into every prompt.

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

## Workflow sidebar revision (2026-10-07)

Owner: Sean. User feedback moved the persistent right Agent panel into the selected left Workflow's expandable details. Each of the four entries has its own status and explicit Continue PiWeb button. Details retain goal, target entity selector, short output preview, workflow/session identity, candidate count, bounded authorization, automatic three-view control and actionable errors. The main canvas now occupies the remaining width in a two-column layout. Selecting an entry prepares/resumes its scope; launching PiWeb is a separate explicit action.

Workflow scope is `(project, definition, target)`, with a distinct discussion/native session for each business entry. Re-entering the same scope resumes its session; another entity receives another session. The automatically generated ThreeView inside CreateEntity deliberately retains the CreateEntity session, while the standalone GenerateThreeView entry has its own session. Sharing the model/tool implementation does not mean sharing conversation history.

Navigation reserves a blank tab synchronously within the user's click, captures the API-returned scoped session, verifies the binding's discussion/session before navigating, and disables overlapping navigation. It no longer waits for asynchronous requests before opening a popup or re-resolves a mutable current-session selector. Failures close the reserved tab and show the reason inline. A known unverified workspace is detected before opening a tab and presents its exact `?cwd=` trust link in the Studio view; after trust, the next Continue action refreshes the binding before launching. The app never automatically extends workspace trust, falls back to the PiWeb root, or silently uses another conversation. Native status polling skips unbound/unverified sessions.

Verification: 19 automated tests pass, including four distinct Workflow discussions, same-scope resume, different-entity isolation and encoded exact workspace URLs. Typecheck, targeted lint and production build pass. Browser routing regression used four mocked native launch responses to verify four distinct scoped popup destinations, one expanded detail and no right panel. Separately, the trusted CreateEntity entry actually restored native session `01a1162e-2e8f-741c-a1c7-a5acd6c115b1`; the untrusted StructureNovel entry showed its real trust/guard failure and exact workspace link. No new image generation, authorization or workspace trust was performed in these UI tests. Full live model startup for the other untrusted scopes remains conditional on the user's exact workspace trust.

### Chapter canvas revision (2026-10-07, Owner: Sean)

Removed the unbounded chapter button list from the sidebar. The business canvas now retains the novel source as a root and arranges chapters, sections, scenes, entities and resources as a spanning forest. Existing flat chapter IDs/text/anchors remain unchanged: explicit parent references take precedence, otherwise Chinese volume/chapter/section titles or original Markdown heading levels determine display ancestry in source order. Shared entities have one node and preserve their cross-reference edges. Clicking a chapter focuses its descendants and related entities; return-all restores the projection.

Canvas sizing uses the host rectangle without competing CSS scaling. The background grid is drawn in the same transformed coordinate system as nodes. Node headings are shortened, body text clipped, port labels removed, and image/text regions separated. Fit computes the current projection bounds rather than retained LiteGraph selection and reserves space for an open inspector. A separate `master-v02-tree` viewport avoids applying old flat-layout offsets.

Validation: browser checked the user's existing `test` project (6 imported heading objects) as novel → two chapters → their respective sections, chapter focus/return, and exact canvas/host rectangle alignment (990×580 at x290/y140). Screenshots inspected in `/tmp/sean-test-chapter-tree.png`, `/tmp/sean-test-tree-fit-final.png`, `/tmp/sean-test-focus-final.png`. No user text, chapter IDs or facts were rewritten; no Agent launch or image generation. Existing 19 service tests passed. Full 10,000-chapter performance is not claimed by this layout correction.

### Unified canvas navigation (2026-10-07, Owner: Sean)

The same navigation contract now covers novels, chapters/sections, scenes, entities, resources, proposals and Run detail links. A breadcrumb path names the current location; each segment is clickable, with an explicit return-to-parent action and a project-home shortcut. Containers drill into their descendant/related content. Current and ancestor nodes are excluded from that projection; leaves open their existing inspector and show an explicit empty child state. Current-container details remain available from the toolbar. Entity scope shows all its resources. Contextual detail links keep the visited path; the global entity library uses canonical ownership paths. This replaces the chapter-only focus behavior above.

Routes use `#/canvas/<projectId>/<objectIds...>` and restore on refresh or browser back/forward, including switching projects. Each project/path keeps a validated private viewport preference in browser localStorage; returning restores zoom and pan. No business objects or data relations are rewritten. Display ancestry is still derived from the original chapter IDs and headings. The shared projection/route helpers live in `src/sean-studio/canvasNavigation.ts`.

Rapid drill testing exposed an upstream spatial hit cache that could lag behind the newly drawn graph. Business clicks now use the current drawn node rectangles (including titles), with editor interaction disabled and canvas pan/zoom retained. Pointer travel suppresses accidental drill after dragging.

Validation: 25 service/PI/navigation tests, typecheck and production build; browser actual clicks through test project source → chapter → section (visible counts 7→6→2→0), parent exclusion, breadcrumb return, return-to-parent, browser back/forward, refresh and restored root viewport. Existing isolated image fixture verified entity → three resources → resource inspector, detail refresh, return to entity, and canvas pan without drill. No image generation, Agent launch, human confirmation or workspace trust operation. Studio API4318 and Vite5318 were found stopped and restored for validation; shared ComfyUI lifecycle was untouched. Full 10,000-chapter performance remains unverified.

### Pointer navigation revision (2026-10-08, Owner: Sean)

Supersedes the previous click/navigation presentation: single click inspects without changing the canvas route; double click drills only if there is descendant or related content. The current node remains in its own scoped canvas, with its children/resources and their links; ancestors remain outside the scope. Double-clicking the current node or a leaf inspects it without adding history or entering an empty scope. Canvas, entity library and Run chips share this gesture contract. A short single-click delay prevents the inspector from covering the target before the second click.

Navigation back/forward uses mouse side buttons (3/4) and the browser's history; capture handlers prevent duplicate native navigation or interference from the underlying editor. Breadcrumbs are read-only location labels. Removed return/home navigation controls, clickable breadcrumb segments and the statistics below the breadcrumb. Fit remains a canvas view action. Exact hash routes, refresh restoration and per-location viewport preferences are retained.

Validation: 26 service/PI/navigation tests including current-node retention and leaf drill gating; typecheck and production build. Browser tested actual single click, double click, retained chapter node, blocked empty section, refresh, and native CDP back/forward mouse-button events with exactly one history movement. Existing entity fixture retains the entity plus three resources; double-clicking a resource shows details without entering another scope. `/tmp/sean-navigation-v2-chapter.png` records the reduced toolbar and retained current node. No generation, Agent launch, fact adoption, workspace trust or shared service lifecycle changes.

### Canvas feedback polish (2026-10-08, Owner: Sean)

Node bodies show a bounded text or image preview; gesture instructions live in a hover tooltip. Breadcrumb segments navigate to their corresponding ancestor scope. Attempting to drill into the current node or a leaf briefly draws a CSS-free canvas glow; no external library was added. The LiteGraph background callback runs after its graph-space transform, as do node positions, so the grid remains anchored to (0, 0); subtle origin axes make that shared reference visible. Typecheck passed; production build and browser verification were not run for this revision.

Browser zoom follow-up: explicit `width:100%; height:100%` keeps the canvas element aligned with its host, but CSS-only zoom emulation did not reproduce browser page zoom and the grid could still clip. The canvas now allocates its backing bitmap at `CSS size × devicePixelRatio`, renders both layers at that scale, and calculates the visible graph area in CSS pixels. Manual Chromium DPR checks at 0.5, 0.8, 1, 1.25 and 2 showed equal host/canvas rectangles and a stable visible graph area; backing dimensions followed DPR. At DPR 0.5, 1 and 1.5, all four bitmap corners contained the expected background color. Typecheck passed; production build was not run.

Non-drillable nodes now carry a compact `末级` badge, while the active scope node shows `当前层`; drillable nodes remain unbadged. Invalid-action feedback uses an orange-red warning glow instead of blue.
