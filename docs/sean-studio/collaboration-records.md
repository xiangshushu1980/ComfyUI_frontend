# Canvas and Agent discussion records

Owner: Sean. Current project rule, 2026-10-14.

## Sources of truth

- The Studio graph is authoritative for accepted creative facts and workflow state: entity facts, references and their usage notes, concept descriptions, paired prompts, generated images, selections, and Run input snapshots.
- A concept brief's `description` field stores a concise, user-confirmed discussion outcome and the reason for important choices. The `text` field remains the image description; the paired prompt remains the model instruction. Do not duplicate these fields or copy a whole chat transcript into the graph.
- Project-wide decisions that affect multiple entities or future workflows belong in the relevant project documentation or ADR. Link to the canvas branch or evidence when useful. Do not create a document for every brainstorming exchange.
- PiWeb remains the authority for the full conversation. The conversation node in Studio is a navigational binding, not the durable store of accepted concept data.

## Continuity after removing a conversation

Removing a conversation from the Studio relationship graph closes its Workflow session and removes that relationship node; it does not delete the native PiWeb session or chat history. A new CreateEntity conversation for the same entity reads the current graph, including saved branch descriptions, decision notes, prompts, references, and project style. It should continue from those accepted records without requiring the old chat.

If a user explicitly deletes a native PiWeb chat, the canvas data remains the recovery source for accepted facts and current plans. A missing native conversation binding must not be treated as a missing concept branch or trigger a duplicate plan/run.

## Concept deletion and history

- Deleting a concept description removes that description and its paired prompt. Generated image resources and historical Runs remain available.
- Deleting an individual generated image removes only that image resource. The branch plan, sibling images, and Run history remain.
- Completed historical Runs stay out of the primary canvas and can be opened through history. They preserve provenance: the immutable inputs, selected references, prompt/style snapshot, output IDs and execution state.
- Removing a conversation does not delete any graph resource or Run.

## Evidence and limits

The 2026-10-14/15 isolated mock walkthrough verified multiple concept branches and repeated mock Runs; reference add/remove and branch deletion behavior; style and brief edits; prompt invalidation only when the image description changes; result selection; and recovery after removing a Studio Workflow relationship. A new conversation read the saved brief, rationale, prompt, and style from bounded canvas context without relying on the old conversation. Opening a new conversation from a concept brief created a branch-scoped `概念图生成` session, and the Studio conversation inspector opened that session in PiWeb. After the initial Qwen request timed out, selecting DeepSeek V4.1 Flash for that conversation produced a correct read-only recovery response: it summarized the saved description, rationale, paired prompt and global style without changing the graph or generating an image.

Removing a Studio conversation relationship archives its Workflow session but does not delete the native PiWeb conversation. Native PiWeb deletion itself was not tested. The new branch-scoped DeepSeek response arrived after a long wait, so response latency remains a stability concern. The Studio inspector reported 188 console warnings (zero errors); these warnings were not individually attributed. Mock mode only; no shared ComfyUI service or real generation model was used.
