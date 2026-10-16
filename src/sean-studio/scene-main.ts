// Owner: Sean. No product sessions, store or ComfyUI bootstrap.
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import SceneWorkflowView from './SceneWorkflowView.vue'
createApp(SceneWorkflowView).use(createPinia()).mount('#scene-app')
