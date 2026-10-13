---
name: chapter-entity-extraction
description: Extract evidence-backed character, location, prop, and relationship candidates from a selected novel chapter in Entity Canvas Studio's ExtractEntities workflow.
---

# 章节实体提取（首版试用）

Owner: Sean. v1, awaiting validation in a new workflow conversation.

## Goal

Extract evidence-backed entities and relationships from one selected chapter in any novel project; this skill is not tailored to a particular story or screenplay. Extract only information useful for later film production: recurring characters, meaningful locations, important props, and explicit relationships. Keep every claim traceable to the novel. New entity candidates are created automatically by the server and receive the `ai-created` flag. Existing-entity updates and relation candidates remain pending for human review.

This v1 covers one selected chapter at a time. `read_chapter` pagination only retrieves the rest of that same chapter when the tool response is paged. Do not design or attempt advanced long-text chunking, cross-chunk entity merging, or cross-chapter identity resolution yet. If a chapter is too long to analyze reliably as one unit, pause and ask the user to narrow the scope; revisit a larger-text workflow when the screenplay grows.

## Startup

When a fresh `ExtractEntities` conversation opens, immediately identify the selected chapter from the compact Workflow frame, report its name/source, then execute the extraction process below. The user's explicit start of this Workflow authorizes creating new entities from supported entity candidates. Do not wait for another generic “please begin” message. Do not update an existing entity or create a relationship without human confirmation. If there is no unambiguous selected chapter, report what is missing and ask the user to select one.

## Read before extracting

1. Call `catalog` and `context`. Confirm the active workflow is `ExtractEntities` and identify the selected chapter from the compact Workflow frame. The frame includes its UUID, kind and name; it does not include the full canvas.
2. Call `read_chapter` for that chapter. If `nextOffset` is present, continue reading until the chapter is complete. Record the returned `sourceId`, `sourceRevision`, and `anchorIds`.
3. After extracting likely names, use `context` with `scope: "search"`, `projectEntities: true`, `kinds: ["entity"]`, and a name/query term to search existing project entities server-side. Read exact candidates with `read_entity` when needed. Reuse an existing entity only when identity is clear. Similar names, titles, pronouns, and uncertain aliases are not enough to merge people.
4. If the chapter text or evidence needs verification, call `read_source` with the chapter's source ID and a specific anchor ID. Never invent anchor IDs, source revisions, quotations, or facts.

## Extraction rules

- Prefer a few strong candidates over exhaustive low-value mentions. Do not create an entity for every incidental object or place name.
- Entity types are `character`, `location`, and `prop`.
- `description` contains concise, chapter-supported global identity facts. Separate direct facts from interpretation with wording such as “文本明确提到” and “可能/推测”. Omit weak inference.
- A temporary condition, action, possession, emotion, costume, injury, or location in one scene is not a global identity fact. Do not encode scene state as an entity description.
- Propose a relationship only when the chapter directly supports a meaningful, reasonably stable relationship. Do not turn co-presence, a single exchange, or speculation into a relationship.
- If identity or relationship is ambiguous, leave it out or describe the ambiguity in the candidate description; do not silently merge or resolve it.
- Keep candidate keys unique and readable, for example `char-lin`, `loc-old-station`, `prop-brass-key`, `rel-lin-owns-key`.

## Evidence and proposal schema

Every candidate must include at least one source anchor from this chapter. Use the exact IDs and revision returned by `read_chapter`:

```json
{ "sourceId": "...", "revision": 1, "anchorId": "P3" }
```

Before submission, cross-check provenance item by item: the candidate's `sources` must collectively support every factual claim in its `description`, not just the entity's name. If the description labels facts with paragraph IDs such as `(P3、P7)`, those same anchors must appear in `sources`; do not put an anchor ID in prose unless it is attached to that candidate. Include P8 as well if describing the backpack compartment, which is mentioned there. Prefer removing an unnecessary detail over keeping an unsupported claim. Re-read the cited anchors when there is any doubt.

Submit one `workflow_operation` with `operation: "propose_entities"` and parameters containing `requestId`, `chapterId`, and `items`. Keep the proposal focused and at or below 40 items. Entity items use:

```json
{
  "key": "char-lin",
  "kind": "entity",
  "type": "character",
  "name": "林某",
  "description": "...",
  "sources": [{ "sourceId": "...", "revision": 1, "anchorId": "P3" }]
}
```

Relationship items use candidate keys or existing entity IDs for `from` and `to`:

```json
{
  "key": "rel-lin-mother",
  "kind": "relation",
  "from": "char-lin",
  "to": "char-mother",
  "description": "母女关系",
  "sources": [{ "sourceId": "...", "revision": 1, "anchorId": "P3" }]
}
```

All endpoints should resolve to an existing entity or an entity candidate in the same proposal. Include the most direct supporting anchors; multiple anchors are appropriate when a claim depends on more than one passage.

## Finish

After submitting, report the run result and list the entities the tool result confirms were created with the `AI 创建` flag. Call out unresolved identity or relationship questions. Explain that existing-entity updates and relationship candidates still need confirmation.
