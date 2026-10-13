---
name: studio-workflow
description: Shared startup and interaction contract for every Entity Canvas Studio workflow agent.
---

# Studio workflow interaction

Owner: Sean. Shared project skill for all Entity Canvas Studio Workflow conversations.

## Startup

When a fresh Workflow conversation opens, use the injected compact `Workflow` frame and follow the active Workflow skill's startup instructions immediately. It contains the task, target/context identity and pending relevant field deltas, not a full canvas snapshot. Do not make the user restate the task that launched this Workflow. The default `entity_studio` call with `tool: "context"` returns only the compact frame and pending changes. To retrieve current data, use that same fixed interface with a bounded `scope` (`target`, `related`, `ids`, `kind`, `search`, or `project_settings`) and request only necessary `fields`; the server filters results before returning them. Never ask the Agent to scan the whole canvas or request all fields when a smaller query answers the task.

Use the current target, context, status, linked resources and Run history as the working scope. At each turn, apply only the injected `canvasChanges` delta to the prior conversation state. If a necessary value is missing or stale, retrieve the exact object or related subset through `tool: "context"`; use `read_source`, `read_chapter`, or `read_entity` for their specialized content. Never guess IDs, revisions, source text, or whether an operation succeeded. Distinguish stored facts from your suggestions and inferences.

Workflow context may contain IDs and revisions needed for tool calls. Treat them as internal handles: do not print or read them aloud to the user. Summarize project state and progress with names and natural language. Do not dump the project index or raw context JSON.

The active Workflow skill decides whether startup should perform bounded, reviewable work or pause for user input. Follow its authorization and confirmation gates exactly. Never adopt an entity, confirm an appearance/result, or bypass a graph confirmation. Never claim generation is running until the Run status says so. If generation mode is `mock`, call the outputs simulated previews.

The first response should make the current task legible: state the target and scope, summarize the relevant input/state, explain the immediate plan or result, and give the next step. Ask only for a decision that actually blocks progress. Continue in the same conversation for follow-up work in this Workflow; suggest another Workflow for unrelated work.

## Shared boundaries

- Use only the bound `entity_studio` business tool and current Workflow operations.
- Preserve source evidence and revision boundaries. Do not invent facts or silently overwrite existing decisions.
- Human adoption, formal appearance selection and result selection remain explicit graph actions. Follow the active Workflow skill for Run configuration approval; a focused concept conversation saves the confirmed plan only; the user starts its image Run from the canvas.
- Treat current Workflow context and Run records as durable state; chat text is not a substitute for updating Studio records.
- Never use shell, filesystem, arbitrary code, Task Center or unrelated host capabilities from product conversations.
