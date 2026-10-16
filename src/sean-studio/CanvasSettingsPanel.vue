<!-- Owner: Sean. Shared settings panel for Studio and 3D projection canvases. -->
<!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
<template>
  <div
    class="canvas-settings"
    role="region"
    aria-label="画布设置"
    @pointerdown.stop
  >
    <header>
      <strong>画布设置</strong>
      <button aria-label="关闭设置" @click="emit('close')">×</button>
    </header>
    <label>
      节点内边距
      <input
        v-model.number="settings.nodePadding"
        type="range"
        min="4"
        max="20"
        step="1"
        @input="emit('change')"
      />
      <span>{{ settings.nodePadding }} px</span>
    </label>
    <label class="settings-toggle">
      Agent / Workflow 标记
      <input
        v-model="settings.showCapabilityBadges"
        type="checkbox"
        @change="emit('change')"
      />
      <span>{{ settings.showCapabilityBadges ? '显示' : '隐藏' }}</span>
    </label>
    <label>
      连线样式
      <select v-model="settings.linkStyle" @change="emit('change')">
        <option value="spline">曲线</option>
        <option value="linear">直角折线</option>
        <option value="straight">直线</option>
      </select>
    </label>
    <label>
      连线中点
      <select v-model="settings.linkMarker" @change="emit('change')">
        <option value="circle">圆点标记</option>
        <option value="arrow">方向箭头</option>
        <option value="none">隐藏</option>
      </select>
    </label>
    <label>
      连线颜色
      <input
        v-model="settings.linkColor"
        type="color"
        @input="emit('change')"
      />
    </label>
    <label>
      连线宽度
      <input
        v-model.number="settings.linkWidth"
        type="range"
        min="1"
        max="12"
        step="0.5"
        @input="emit('change')"
      />
      <span>{{ settings.linkWidth }} px</span>
    </label>
    <label>
      属性面板透明度
      <input
        v-model.number="settings.panelOpacity"
        type="range"
        min="0.35"
        max="1"
        step="0.05"
        @input="emit('change')"
      />
      <span>{{ Math.round(settings.panelOpacity * 100) }}%</span>
    </label>
    <label>
      属性面板宽度
      <input
        v-model.number="width"
        type="range"
        min="360"
        max="1200"
        step="20"
        @input="emit('widthChange')"
      />
      <span>{{ width }} px</span>
    </label>
  </div>
</template>

<script setup lang="ts">
import type { CanvasSettings } from './canvasSettings'

const settings = defineModel<CanvasSettings>({ required: true })
const width = defineModel<number>('inspectorWidth', { required: true })
const emit = defineEmits<{
  change: []
  widthChange: []
  close: []
}>()
</script>

<style scoped>
.canvas-settings {
  position: absolute;
  z-index: 30;
  top: 60px;
  right: 12px;
  display: grid;
  gap: 12px;
  width: min(300px, calc(100vw - 24px));
  padding: 14px;
  border: 1px solid #435c6c;
  border-radius: 10px;
  background: #162834f5;
  box-shadow: 0 14px 36px #0009;
}
.canvas-settings button,
.canvas-settings select,
.canvas-settings input {
  font: inherit;
  color: #e2eaf0;
  border: 1px solid #2a3d4c;
  border-radius: 7px;
  background: #1b2e3c;
  padding: 9px 11px;
}
.canvas-settings header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.canvas-settings header button {
  padding: 2px 8px;
}
.canvas-settings label {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 5px 12px;
  color: #c3d1da;
  font-size: 12px;
}
.canvas-settings label > input,
.canvas-settings label > select {
  grid-column: 1 / -1;
  width: 100%;
  margin: 0;
}
.canvas-settings label > input[type='color'] {
  height: 34px;
  padding: 3px;
}
.canvas-settings label > input[type='range'] {
  padding: 0;
}
.canvas-settings label.settings-toggle {
  display: flex;
  justify-content: space-between;
}
.canvas-settings label.settings-toggle > input[type='checkbox'] {
  width: auto;
}
</style>
