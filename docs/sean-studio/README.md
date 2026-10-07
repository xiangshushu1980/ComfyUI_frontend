# Entity Canvas Studio v1

Owner: Sean. Independent ComfyUI frontend fork (GPL-3.0-only).

Upstream: Comfy-Org/ComfyUI_frontend v1.52.7, SHA 1a7a6b82514874545dc5e8203d0bd2188c2d9b18. Runtime baseline and node-definition hashes: `manifests/`. The development branch is `sean/entity-canvas-v1`; no publishing remote is configured.

Use Node 24 for `scripts/sean-studio/run.sh start` (http://127.0.0.1:4318). Build/development uses private `.tools/node-v25.9.0-linux-x64` plus pnpm 11.13.1, preserving the upstream engine requirement. `run.sh build` checks types and builds; `run.sh dev` opens the frontend at port 5318 through the same private gateway; `run.sh test` runs domain, action, gateway and extension checks.

The service expects the existing shared ComfyUI at 8188 and native PiWeb at 30141. It never starts or restarts either. Override `COMFY_URL`, `PI_WEB_URL`, `STUDIO_PORT`, `STUDIO_API_URL`, `STUDIO_DATA_DIR` as needed. Defaults store SQLite/media and product PI workspaces in `~/.local/share/entity-canvas-studio/`. Keep the binding capability private. Do not run creative PI in this code checkout.

Agent interaction lives in native PiWeb, per Sean’s 2026-10-07 direction. The canvas has a compact Agent card with working/idle state, recent output excerpt, discussion selector and a link to the exact native session. It does not render chat history, a message composer or native message SSE. Select objects to carry context, then click “打开对应 PiWeb”. `PI_WEB_PUBLIC_URL` can override the browser-visible PiWeb origin without changing the internal API URL. Context and one-use actions remain private business records, never URL tokens.

The bound workspace extension accepts direct PiWeb input, obtains a service receipt for that session, and keeps the creative identity and business tool constraints. Workspace trust remains explicit and exact. Full conversation, model controls and stopping replies happen in PiWeb. The status card polls only while a discussion is selected. Adopt selected proposal candidates in the canvas; scene state keeps a fixed entity revision and never overwrites global identity.

Select an adopted character, save an image input, enter the native Qwen graph, and verify UI/API consistency. “生成这一版” authorizes one immutable input and opens PiWeb; the next direct user turn receives that authorization. Saving a newer input revokes older unused authorizations. Only that turn may consume the action. Each action returns its original run on replay. Results retain input, source assets, run/node, hashes and snapshots. Explicitly make an output the next input reference; discussion selection does not set generation references. Main appearance confirmation is a separate human action.

Refresh restores project data and view. Native PI history is the chat authority; business SSE uses its own outbox sequence. Restart only observes existing prompt IDs or reconciles an uncertain submission; it never sends a new PI prompt or automatically submits a prepared run. Unknown delivery/submission blocks repeat submission. Check the original native session and execution key; do not delete uncertainty records to retry. Stop PI does not globally interrupt ComfyUI. Queued cancellation deletes only the owned prompt ID.

Current implementation and validation limitations are tracked in `implementation.md`. Development acceptance uses the supplied fictional novel. No generated picture is a source fact, and successful execution does not prove identity/background quality.
