# 只读 3D 画布验证记录

Owner: Sean。2026-10-16，任务 `remote-4285562b-c597-4fb4-97e9-e4448f2cea78`。

## 控制权与基线

用户本会话明确授权从方案进入开发。一场景一画布，中间结果只读，Agent 由当前 Codex 会话操作，不接独立 Agent 启动。

3D 项目 main 为 `ca26ca9`，原有未追踪实验资料未改动。实际实现位于 entity-canvas-studio 的 `sean/entity-canvas-v1`，开工 HEAD `c32cebb`，工作树干净。原主线任务 `remote-31356340-f29d-4fd4-9919-e4abac5bf291` 仍 running，controller 为旧会话，未接管或回写它。本任务从 queued 正常 claim，controller 为 `01a14551-7816-7851-931c-40bf6261201f`，generation 1。

## 实际工作区与浏览器

配置两个真实场景工作区：3D `.production-runs/scene-workflow-refinement/holdout`（院落）与 `development`（月面工作站）。投影目录包含 inputs/specs 后，院落读出 169 个产物，月面工作站 60 个产物。院落初次扫描 36 张图片，覆盖参考、资产预览、渲染视图。所有修订均保留，无“最新即已采纳”推断。

通过 playwright-cli 命名会话 `scene-readonly` 实际检查：

- 独立 HTML 入口打开，标题正确，正常加载时控制台 0 errors；页面不请求产品 Pi 会话或 ComfyUI 初始化接口。
- 点击文本节点打开原始内容、相对路径、SHA 和显式引用详情。
- 点击图片节点在侧栏显示完整比例原图。
- 从 courtyard 切换 lunar，URL 改为 `?scene=lunar`，节点数变为 60，关闭旧场景详情。
- 拦截 lunar 刷新请求并返回 503，页面显示“当前展示可能过期”，仍保留旧 60 个产物；解除拦截。该检查产生的一条 503 console error 是故意注入。
- 实际查看画布与图片详情截图后，将原先逐引用输入槽改为背景连线，避免大量引用标签覆盖产物内容；增加节点标题宽度计算，保留完整标题。pointerup 使用捕获监听，保证 LiteGraph 平移处理不吞掉节点点击。

本地截图（忽略目录，不入提交）：`.playwright-cli/page-2026-10-16T15-31-53-282Z.png`（五阶段画布）、`.playwright-cli/page-2026-10-16T15-32-13-595Z.png`（图片详情）。本地开发预览临时服务只读现有文件，不使用产品私有 SQLite、旧 Reference 存储或共享 ComfyUI；不调用生成模型或操作 Blender 可见场景。

## 自动检查与限制

新增 `server/scene-projection.test.mjs` 的来源/边界检查通过，含外部路径与存在但未投影的二进制分支。Vue 类型检查、该 Vue/TS 的 ESLint、Vue Stylelint、生产 Vite 构建通过；构建包含 `dist/src/sean-studio/scene.html`。构建有上游已有的样式、动态导入和外部 CSS 告警。Knip 配置显式登记独立 scene-main.ts 入口，避免 HTML 多入口未被识别而误报未使用。

完整 `node --test server/*.test.mjs`：33 项，28 通过、5 失败。5 项全位于 `execution.test.mjs`，原因均为 fixture 未确认项目全局视觉风格。将未修改 HEAD 的 server/templates/manifests/docs/sean-studio 导出至临时目录，单独运行该文件，复现相同 5 项失败及相同错误 `confirm the project-wide visual style before generating`。本次未修改生成逻辑和这些旧测试。新增投影测试通过，不将全套回归报告为全绿。

界面展示原始检查结论，不独立评价造型或几何；unknown、失败、缺失与 hash 失配不升级为通过。未执行最终场景验收。文件扫描非原子快照，受文档所列大小、层级和节点数上限限制。真实配置及完整二进制工作区留本机，源码提交不包含它们。
