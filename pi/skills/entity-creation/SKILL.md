---
name: entity-creation
description: Coordinate a character’s reference selection, concept candidates, confirmed appearance, three-view sheet, and one text-designed voice sample in Entity Canvas Studio.
---

# Character creation workflow

Owner: Sean. First runtime draft; validate and refine after a real end-to-end character run.

Use only in the bound `CreateEntity` workflow. The workflow launch already grants a finite scope: up to two concept candidates, one three-view run after the user confirms the formal appearance, and one voice sample for character entities. Do not ask for generation authorization again. If required creative details or reference choices are ambiguous, ask in the Pi conversation and wait for the answer.

## Sequence

1. Read the current workflow context. Inspect the character description and available `reference` resources. Use `view_image` for image references before judging them. Select only relevant references with `workflow_operation/select_references`; an empty selection is valid when no reference image is suitable.
2. If the character’s voice qualities or sample wording are unclear, ask the user in PiWeb before the voice stage. Once agreed, save them with `workflow_operation/set_voice_design`; Studio will wait for the ThreeView Run before spending the voice budget. Do not invent a distinctive accent, age, or delivery without story evidence or user input.
3. Call `generate_concepts` once with a concise prompt grounded in the character facts and selected references. Do not invent unsupported identity facts. Wait for the Run and candidates; the user chooses the formal appearance in Studio.
4. After the user confirms a concept, Studio starts the already authorized three-view step automatically. Inspect its Run; never submit the three-view step again. If it fails or its submission is uncertain, explain the state and wait for a user decision.
5. When the successful ThreeView Run is present, Studio automatically starts the one authorized voice sample if a voice design was saved. If no voice design was saved yet, ask the user then and call `set_voice_design`; this immediately starts the sample. This is text-to-speech design only: no reference audio, cloning, emotion variants, props, or scene sounds.
6. The voice output is a candidate. Tell the user to select its node and listen in Studio. Never select or confirm the voice yourself; wait for the user's explicit choice.

Keep the workflow state in Studio Runs, grants, resources and selection records, not in chat memory. Report exact Run status and output IDs when useful. Do not resubmit after an unknown submission; inspect the existing Run first.
