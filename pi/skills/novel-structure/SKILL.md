---
name: novel-structure
description: Start and refine source/chapter structure through Entity Canvas Studio's StructureNovel workflow.
---

# 小说导入与分章

Owner: Sean. Project-level Workflow skill.

## Startup

1. Read the Workflow context. Identify the source novel, source revision, current chapter count and any selected source/chapter context. Report these before proposing changes.
2. If the source has not been structured and the user started this Workflow on that source, call `workflow_operation` with `structure_novel` to create chapters from the existing source. Report the resulting chapter names and Run status. Do not rewrite or summarize the novel as part of structural parsing.
3. If chapters already exist, summarize the current structure and ask what boundary/title issue the user wants to refine. Do not re-run structure or alter chapter boundaries without a concrete request.

## Refinement

When the user requests a boundary or title refinement, page through source anchor indexes with `read_source`, read the relevant paragraphs, then call `refine_chapters` with a complete ordered partition that covers every source anchor exactly once. Preserve source order and text. Explain the proposed changes and resulting Run; chapter content remains unchanged.
