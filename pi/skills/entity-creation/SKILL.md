---
name: entity-creation
description: Coordinate a character’s manually supplied references, concept and appearance iteration, confirmed formal appearance, three-view image, and one text-designed voice sample in Entity Canvas Studio.
---

# Character entity creation

Owner: Sean. Runtime interaction draft; validate after a real end-to-end character run.

Use only in the bound `CreateEntity` workflow. Launching this workflow already authorizes up to four generated concept/appearance images total, one three-view image after appearance confirmation, and one text-designed character voice sample after three-view confirmation. Never ask for generation authorization again. The user confirms each image Run configuration in the entity graph before submission and confirms image results in the graph. Never confirm a prompt, reference set, or image result on the user's behalf.

## Image workflow

1. Read the current Workflow context. Inspect the entity description and available image resources. References are added manually by the user; do not search for, invent, or import reference images. Use `view_image` on relevant image assets before recommending them.
2. For each concept proposal, write a concrete prompt and select its own ordered `referenceIds` from the entity's manually-added reference assets. Call `generate_concepts` with `prompt`, optional `count` (default 2), and `referenceIds`. This creates a pending configuration Run in the graph; it does not submit generation. Tell the user the Run is ready for prompt/reference confirmation and wait. Do not claim a render is running until the Run status changes to `running`.
3. Once candidate image resources appear in the entity drill-down graph, inspect them and explain what works or needs adjustment. The user chooses a formal appearance or asks for another iteration. If adjusting, use `prepare_appearance_adjustment` with a new prompt and that iteration's own `referenceIds`; a prior generated candidate may be included as a reference asset. Wait for the user to confirm the new Run configuration in the graph. Count all concept/appearance images against the shared four-image grant.
4. Do not call `generate_threeview` yourself. When the user confirms a candidate as the formal appearance, Studio prepares a three-view Run from that confirmed image. The graph shows the fixed template prompt and the confirmed appearance input. The user confirms this configuration before generation. After its output appears, inspect it and wait for the user to confirm the three-view result in the graph. If it needs revision, discuss the next step with the user; do not resubmit the one-use three-view grant.

## Voice sample

5. If the character's voice qualities or sample wording are unclear, ask in PiWeb and wait. Save the agreed text with `set_voice_design`. This is text-to-speech design only: no reference audio, cloning, emotion variants, props, or scene sounds. Studio starts the one authorized sample only after the three-view result is confirmed.
6. The voice output is a candidate. Tell the user to select its node and listen in Studio. Never select or confirm the voice yourself; wait for the user's explicit choice.

Keep workflow progress in Studio Runs, grants, resources, and selection records, not chat memory. Report exact Run status and output IDs when useful. For a pending Run, opening its session lets the user discuss prompt/reference changes with you; prepare a revised Run instead of modifying an already snapshotted Run. Never resubmit an unknown submission; inspect the existing Run first.
