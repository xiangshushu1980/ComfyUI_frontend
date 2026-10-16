<!-- Owner: Sean. Shared navigation chrome for Studio canvas surfaces. -->
<template>
  <nav class="canvas-navigation">
    <div class="navigation-location"><slot name="location" /></div>
    <div class="canvas-actions"><slot /></div>
  </nav>
</template>

<style scoped>
.canvas-navigation {
  position: absolute;
  z-index: 12;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  max-width: calc(100vw - 70px);
  padding: 4px;
  border: 1px solid #344b5bcc;
  border-radius: 10px;
  background: rgb(20 34 46 / 90%);
  box-shadow: 0 5px 18px rgb(0 0 0 / 24%);
  backdrop-filter: blur(10px);
}
.navigation-location {
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(42vw, 520px);
}
.canvas-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 5px;
}
.canvas-actions :slotted(button) {
  padding: 6px 9px;
  white-space: nowrap;
}
.canvas-actions :slotted(button),
.canvas-actions :slotted(select) {
  font: inherit;
  color: #e2eaf0;
  border: 1px solid #2a3d4c;
  border-radius: 7px;
  background: #1b2e3c;
}
.canvas-actions :slotted(span) {
  color: #8ca2b4;
  font-size: 12px;
}
.canvas-actions :slotted(label) {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 6px;
  color: #c3d1da;
  font-size: 12px;
  white-space: nowrap;
}
.canvas-actions :slotted(label) input {
  width: auto;
  margin: 0;
}
@media (max-width: 900px) {
  .canvas-navigation {
    top: 8px;
    right: 8px;
    max-width: calc(100vw - 64px);
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .navigation-location {
    max-width: 100%;
  }
  .canvas-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .canvas-actions :slotted(button) {
    padding: 5px 7px;
    font-size: 11px;
  }
}
</style>
