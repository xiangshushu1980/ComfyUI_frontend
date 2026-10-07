# Implementation and evidence

Owner: Sean. 2026-10-07. Development task remote-31356340-f29d-4fd4-9919-e4abac5bf291.

## Upstream seams

- `src/router.ts`: root GraphView replaced by StudioView, retaining the upstream app/bootstrap/Pinia/environment.
- `vite.config.mts`: `SEAN_STUDIO=1` sends native routes through the private gateway, with no direct ComfyUI proxy bypass.
- `AGENTS.md`: studio development contract replaces upstream contributor instructions.
- `.gitignore`: private toolchain and development evidence/cache exclusions.

New code is confined to `src/sean-studio/`, `server/`, `pi/`, `templates/qwen/`, `manifests/`, and `scripts/sean-studio/`. Creative projection has its own LGraph/LGraphCanvas; one upstream ComfyApp owns the execution graph. Inactive canvases stop rendering. Native shared WebSocket initialization is disabled; the run observer owns scoped backend events. No free native queue/edit controls are mounted.

## Evidence so far

- Shared runtime read-only observation: ComfyUI 0.37.0, actual frontend 1.52.7, Qwen core nodes registered; queue empty at initial inspection. No shared restart/upgrade.
- Native nine-node graph construction using registered definitions, graphToPrompt export, service-side UI/API verification succeeded. UI workflow saved in templates/qwen/ui.v1.json.
- Private SQLite/outbox, atomic adoption, source anchors, immutable revisions, project boundaries and scene isolation tests pass.
- Once-only actions, expiry, duplicate consumption and uncertain submission no-repost tests pass without GPU/model calls.
- Public gateway rejects raw shared writes; compatibility settings are private; public snapshots/events redact session capabilities and receipts.
- Native PiWeb 0.10.0 / SDK 1.0.0 loaded the exact user-approved product workspace extension. SDK only auto-discovers .js/.ts (not .mjs); installed entry uses .js while canonical module remains .mjs.
- Real PI read-source audit saved original paragraph hashes. Early weak tool catalog generated structurally unusable candidates; retained with schema_invalid status, never adopted. Strict catalog/validation now rejects those fields.
- Actual provider request audit confirms product prompt and only entity_studio declarations; current configured deepseek-flash model declares text/image input. Actual image understanding still requires a successful view_image call and user review.
- Native ten-node graph with one synthetic reference completed the real registered-node import/export and service verifier; see `native-reference-roundtrip.json`. This checks slot wiring, not image generation.
- Eleven automated tests pass, including replacing an input revoking its old unconsumed authorization and actual provider-payload identity/tool filtering. Frontend typecheck and production build pass after native historical snapshot support.

## Pending acceptance

Full native UI/PI two-round Qwen generation, node-event mapping, actual collection/cleanup and image quality have not yet passed end-to-end acceptance. Human adoption and appearance selection remain explicit product operations; no test or model reply substitutes for them. Current application data is a development acceptance project and has no adopted entities or confirmed appearance. Real PI has submitted four valid entity candidates plus their former-colleague relationship; user adoption is pending.

## Known implementation limits under review

Thumbnails currently return original PNG bytes; add a true cached reduced image before treating large asset sets as performance-validated. Native PI SSE reconnect uses history snapshots but still needs adversarial stream/snapshot interleaving checks. Waiting-resource and collecting states expose no invented sampling percentage. Global third-party extensions execute as trusted host code; the tool hook is not a process sandbox. Compatibility promises cover the fixed Qwen node set only.

## Sean’s interaction revision (2026-10-07)

User instruction supersedes the embedded-chat portions of the original transport design: Agent work moves to PiWeb. Canvas retains only a narrow status/output card, explicit context handoff, and exact-session navigation. Removed frontend chat rendering, composer, stop control and message SSE. Server obtains lightweight native state/history summaries and supports receipt issuance for direct PiWeb input; the bound extension ends its audited turn on agent_end. Model/provider settings and shared ComfyUI lifecycle are unchanged. One-use generation authorization is handed to the next direct native turn, rather than sending a model prompt from the canvas.

Legacy server send/history/event endpoints remain for compatibility but are no longer used by the product UI. This change does not imply adoption or generation acceptance.
