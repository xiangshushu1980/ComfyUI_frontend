# Entity Canvas Studio

Owner: Sean. Mem0 pool: entity-canvas-studio.

Development task: remote-31356340-f29d-4fd4-9919-e4abac5bf291 (Coordinator).
Authoritative design: ../comfy-ops/docs/design/sean_entity_canvas_build_plan_v1.md and its linked transport/interaction documents.

Preserve the upstream ComfyUI frontend and GPL-3.0 license. Put new business code in src/sean-studio, server, pi, templates/qwen and manifests; mark new modules Owner: Sean.
Keep private SQLite/media and product PI workspaces outside this checkout. Never read or write the old Reference store. Product PI identity is separate from the Codex development task.
Use only the existing shared ComfyUI at 127.0.0.1:8188. Never start/restart it here. Its only lifecycle entry is ../comfy-ops/scripts/comfy-stack.sh. Check hive-resource occupancy and acquire/heartbeat/release a GPU lease for generation. Do not globally interrupt/free/manage the shared service.
Browser ComfyUI traffic must pass the private allowlisted gateway in development and production. No raw prompt forwarding. One-use generation actions, immutable UI/API snapshots, unknown submissions never auto-resubmit.
Human adoption, generation authorization and main appearance confirmation are separate operations. Scene state must not alter global entity facts. No video/audio/multiview or free graph editing in v1.
Use scoped commits. Do not change upstream files beyond documented seams. No proactive delegation without user authorization.
