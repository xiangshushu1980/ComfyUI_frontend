# Entity Canvas Studio v0.2

Owner: Sean. Independent ComfyUI frontend fork (GPL-3.0-only).

Current phase: novel/chapter/entity data and manually supplied references/concept-image branches. The Agent plans in PiWeb; the user submits a confirmed branch from the canvas. Three-view and voice are deferred. Default generation mode is mock. [Construction progress and current acceptance boundary](progress-20261012.md) distinguishes current capabilities from older walkthroughs.

Durable collaboration context and deletion behavior: [canvas and discussion records](collaboration-records.md).

Upstream: Comfy-Org/ComfyUI_frontend v1.52.7, SHA 1a7a6b82514874545dc5e8203d0bd2188c2d9b18. Runtime baseline and node-definition hashes: `manifests/`. The development branch is `sean/entity-canvas-v1`; no publishing remote is configured.

Use Node 24 for `scripts/sean-studio/run.sh start` (http://127.0.0.1:4318). Build/development uses private `.tools/node-v25.9.0-linux-x64` plus pnpm 11.13.1, preserving the upstream engine requirement. `run.sh build` checks types and builds; `run.sh dev` opens the frontend at port 5318 through the same private gateway; `run.sh test` runs domain, action, gateway and extension checks.

The service expects the existing shared ComfyUI at 8188 and native PiWeb at 30141. It never starts or restarts either. Override `COMFY_URL`, `PI_WEB_URL`, `STUDIO_PORT`, `STUDIO_API_URL`, `STUDIO_DATA_DIR` as needed. Defaults store SQLite/media and product PI workspaces in `~/.local/share/entity-canvas-studio/`. Keep the binding capability private. Do not run creative PI in this code checkout.

Agent interaction lives in native PiWeb, per Sean’s 2026-10-07 direction. The canvas has a separate Agent Workflow relationship view: the film project, actual Agent Workspace directories, Workflow definitions and each Workflow conversation appear as linked nodes. Workflow nodes show conversation counts, and each conversation node provides a direct PiWeb open action. Select a node to navigate from its property panel; creating another conversation is explicit. Project SSE updates the graph when Studio creates or binds a conversation; manual PiWeb sync reconciles external changes. The relationship nodes are a view projection, not duplicated business records. It does not render chat history, a message composer or native message SSE. `PI_WEB_PUBLIC_URL` can override the browser-visible PiWeb origin without changing the internal API URL. Context and one-use actions remain private business records, never URL tokens.

The bound workspace extension accepts direct PiWeb input, obtains a service receipt for that session, and keeps the creative identity and business tool constraints. Workspace trust remains explicit and exact. Full conversation, model controls and stopping replies happen in PiWeb. Adopt selected proposal candidates in the canvas; scene state keeps a fixed entity revision and never overwrites global identity.

Choose an entity and add its reference images with usage notes. In a focused concept conversation, confirm the image description, reference usage and visual style; the Agent creates/updates its paired description and prompt without generating. The concept workflow node then submits one explicitly confirmed branch. Changing the description invalidates its prompt until refreshed. Results retain immutable input/reference hashes and resource lineage; appearance selection remains a separate human action. Legacy one-use image-input endpoints remain for compatibility, not the current primary interaction.

Refresh restores project data and view. Native PI history is the chat authority; business SSE uses its own outbox sequence. Restart only observes existing prompt IDs or reconciles an uncertain submission; it never sends a new PI prompt or automatically submits a prepared run. Unknown delivery/submission blocks repeat submission. Check the original native session and execution key; do not delete uncertainty records to retry. Stop PI does not globally interrupt ComfyUI. Queued cancellation deletes only the owned prompt ID.

Current implementation and validation limitations are tracked in `implementation.md`. Development acceptance uses the supplied fictional novel. No generated picture is a source fact, and successful execution does not prove identity/background quality.
