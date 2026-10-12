# Qwen Image 2.1 prompting for entity creation

Owner: Sean. Applies to Entity Canvas Studio concept prompts and character-view sheets.

## What runs today

Studio sends authored prompt text and selected image inputs to ComfyUI's `TextEncodeQwenImage21`. It does **not** run Qwen's separate Qwen3.5-VL 9B Prompt Enhancer (PE). The official PE instructions below are writing guidance, not a claim that PE rewrites or checks a Studio prompt at runtime. Keep actual image inputs wired through the workflow's ordered `referenceIds`; text tags never replace those inputs.

## Official guidance to carry into authored prompts

- Describe the intended finished image clearly: subject and purpose, medium/style, composition, important form/material/color details, background, and lighting. Preserve user-fixed facts, counts, colors, and placement.
- Resolve only what the user delegated. If missing canon would change the result, ask rather than inventing it.
- Use concrete, affirmative language. Identify which image supplies each feature, and distinguish that feature from unrelated content in the same image.
- For multiple images, explicitly bind each one in input order with `<image1>`, `<image2>`, etc., and state each image's role separately. Qwen's PE Edit rule uses these tags; they are not H3's `Image 1` convention.
- For one image, identify it naturally as the confirmed appearance/reference; do not add multi-image tags.
- Specify exact panel/view counts and their order. Unless requested, do not add text or labels to an image sheet.
- Keep prompts coherent and readable. Avoid a generic negative-tag dump that conflicts with positive instructions.

Qwen's PE T2I guide describes the finished image in a detailed prompt and emits `rewritten_prompt` plus `wh_ratio`. The PE Edit guide requires the explicit tags above for multi-image input and asks for each image's role. Studio uses its own fixed ComfyUI latent/resolution settings; do not paste PE output fields such as `wh_ratio` or `ratio_follow` into the prompt text.

## Concept image prompt structure

Write a concise, coherent English paragraph:

1. Target subject, purpose, medium/style, composition.
2. Each selected reference in the same order as `referenceIds`: `<imageN>`, the exact feature to borrow, and unrelated details/background to leave behind.
3. Entity-specific facts and material/color detail supported by the entity record or user confirmation.
4. Background, lighting, framing, and only relevant exclusions.

Example for the brass-gear concept with the pink portrait first and headpiece detail second:

> Create one stylized 3D product render of a single palm-sized antique brass gear, centered slightly above the middle and shown at a three-quarter angle, on a clean neutral seamless studio background. Keep its circular silhouette and teeth intact and precise, with warm metallic luster and a light, even aged patina in the tooth valleys and hub recesses. `<image1>` supplies only the miniature woman's portrait painted on the gear's flat face; preserve the recognizable woman, her golden wavy hair, and the soft dreamy pastel treatment as a small aged enamel-like ornament, but do not copy the reference's background or portrait composition. `<image2>` supplies only the small star/flower-shaped metal ornament for the center hub; use it as an embossed metallic inlay and do not reproduce the headpiece or its other parts. Place one corner of aged, slightly crinkled oil paper beside the gear. Use soft diffused product-photography lighting, gentle highlights, a soft contact shadow, shallow depth of field, and crisp PBR material detail. Show no actual people or scene, no extra objects beyond the oil paper, no labels, and no watermark.

This is a corrected prompt draft for the current concept, not a new Run or a rewrite of the immutable historical Run snapshot.

## Reviewed character sheet layouts from the former Reference workspace

The archived Qwen Image 2.1 tests found the staged references and sheet compositions retained recognizable broad identity and requested view counts. They also documented that small accessories can drift between samples; do not promise exact retention from a prompt alone.

### Three-view turnaround: front, side, back

Use the confirmed formal appearance as the only visual reference. Create exactly three separate full-height figures of the same subject, at identical scale, ordered left to right: front, strict clean side profile, back. Use the same neutral stance; show the complete head, hands, and feet in every view. Preserve identity, facial features, hair, clothing, materials, colors, asymmetry, accessories, and rendering style. Use a clean 3:2 landscape sheet, neutral warm off-white background, soft even studio lighting, clear spacing, and no labels, extra views, poses, characters, props, borders, or redesign. The active Studio template is [`templates/qwen/threeview.v1.json`](../../../../templates/qwen/threeview.v1.json).

### Four-panel sheet: face portrait plus front/back/side

This is a distinct single-sheet layout and is **not** the active one-use `generate_threeview` operation. It has one large straight-on head-and-shoulders portrait in the left column plus exactly three full-body views at right, ordered front, back, clean side profile. All four panels show the same subject; the body views use the same scale and neutral stance, with feet visible. The former project tested this face + front/back/side composition for panel count and broad identity consistency. Use [`templates/qwen/fourview-reference.v1.json`](../../../../templates/qwen/fourview-reference.v1.json) only if a future workflow explicitly supports it.

The old catalog also has a seven-study character design sheet with four expressions and three body views. That is a different design-sheet task, not a four-view turnaround.

## Sources

- Qwen Image 2.1 official repository / PE overview: <https://github.com/QwenLM/Qwen-Image-2.1>
- Qwen PE T2I system prompt: <https://github.com/QwenLM/Qwen-Image-2.1/blob/main/prompt_rewrite/prompts/system_prompt_t2i.txt>
- Qwen PE Edit system prompt and image tags: <https://github.com/QwenLM/Qwen-Image-2.1/blob/main/prompt_rewrite/prompts/system_prompt_edit.txt>
- ComfyUI `TextEncodeQwenImage21` node documentation: <https://github.com/Comfy-Org/docs/blob/main/built-in-nodes/TextEncodeQwenImage21.mdx>
- Prior project staged-reference experiment: `/home/sean/projects/comfy-ops/experiments/qwen_image_2_1_staged_character_reference_20261002/`
- Prior project multiview templates: `/home/sean/projects/comfy-ops/reference-workspace/catalog/qwen-multiview.v3-simple.json` and `qwen-multiview.v3-simple-face.json`
