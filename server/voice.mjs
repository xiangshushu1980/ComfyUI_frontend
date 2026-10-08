// Owner: Sean. Fixed text-designed character voice sample; no cloning or reference audio.
import { readFileSync } from 'node:fs'
import { hash } from './store.mjs'

const templateBytes = readFileSync(
  new URL('../templates/breeze-tts/voice.v1.json', import.meta.url)
)
const template = JSON.parse(templateBytes)

export function voiceSample(language = 'zh') {
  return language === 'en'
    ? 'Hello, it is nice to meet you. Today we set out together and get to know this world.'
    : template.sampleText
}

export function buildVoiceGraph(input, runId) {
  const direction =
    input.language === 'en'
      ? 'Speak natural clear English, with steady emotion. Do not sing or exaggerate.'
      : '普通话自然清晰，正常说话，情绪平稳，不唱歌，不夸张表演。'
  const graph = {
    1: structuredClone(template.model),
    10: {
      class_type: 'BreezeTTS2Speaker',
      inputs: {
        name: 'Character',
        audio: 'none',
        reference_text: '',
        auto_transcribe_if_empty: false,
        instruction: `${direction}\n${input.voiceDescription}`,
        cfg_scale: input.cfgScale
      }
    },
    11: {
      class_type: 'BreezeTTS2MultiSpeaker',
      inputs: {
        ...structuredClone(template.controls),
        breeze_model: ['1', 0],
        speaker_1: ['10', 0],
        text: JSON.stringify([
          { speaker: 'Character', text: input.sampleText }
        ]),
        seed: input.seed
      }
    },
    12: {
      class_type: 'SaveAudio',
      inputs: {
        audio: ['11', 0],
        filename_prefix: `sean_entity_canvas/runs/${runId}/voice`
      }
    }
  }
  return { graph, templateHash: hash(templateBytes), templateId: template.id }
}
