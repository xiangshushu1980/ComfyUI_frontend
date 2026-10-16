# 3D 场景只读画布

Owner: Sean。任务 `remote-4285562b-c597-4fb4-97e9-e4448f2cea78`。

显示逻辑已在 2026-10-17 更新为步骤总览、结果归组与局部环形展开，见 [显示逻辑与微调交接](scene-display-handoff.md)。下文文件投影合同继续有效。

过程语义展示的后续设计：[Agent 执行过程可视化](../design/scene-process-visualization.md)（批次 A 已实现，B/C 尚未实现；沿用现有 Agent + skill）。

既有文件投影上新增的语义索引、文件夹、关系导航及核实范围见 [批次 A 实施记录](scene-process-batch-a.md)。原始文件引用的 present/unprojected 等状态继续保留；presentation 的 verified/partial 是另一层带 scope 的核实，不能混用。语义 revision 也包含核实结果变化。

## 使用与配置

Studio 主画布左上角「3D 场景」打开独立页面 `/src/sean-studio/scene.html`。独立 Vue 入口复用项目 LiteGraph，不执行 ComfyUI 应用初始化，也不绑定或启动产品 Agent。Agent 暂由当前 Codex 会话操作制作 CLI。

服务启动前配置 `STUDIO_3D_SCENES` 为 JSON 数组，每项包含稳定 `id`、显示 `name` 和绝对 `root`。一个配置项对应一个逻辑场景，root 必须是该场景专属制作工作区；该场景的多个修订和镜头可留在同一工作区。多个独立场景须配置多个 root，不把混有多个场景的父目录注册成一个场景。配置由开发者/运维提供，浏览器不能增加任意读取目录。

真实本地示例（路径不随代码发布）：

```bash
export STUDIO_3D_SCENES='[{"id":"courtyard","name":"院落登记处","root":"/home/sean/projects/3d/.production-runs/scene-workflow-refinement/holdout"},{"id":"lunar","name":"月面工作站","root":"/home/sean/projects/3d/.production-runs/scene-workflow-refinement/development"}]'
node server/index.mjs
```

开发模式沿用 `SEAN_STUDIO=1 pnpm dev` 与现有 4318 gateway。生产构建 `pnpm build` 包含原主入口及独立 scene HTML。此配置只配置产物读取，不调整共享 ComfyUI 或现有 Pi 工作流。

切换场景替换整张画布；`?scene=<id>` 支持重开同一场景。「刷新结果」重新读取工作区，保留当前视口与仍存在的选择；更新失败保留旧画布并明确提示可能过期。页面显示读取时间，非实时同步，不自行轮询执行状态。关闭/重开后重新从权威文件重建，无需画布数据库恢复。可拖动空白平移、滚轮缩放、适配宽度、过滤图片、点击节点看完整内容及原图。适配宽度后向下平移浏览更多产物。

## 投影合同

只读 GET `/studio-api/v1/scene-projection` 列出配置场景，`/<id>` 返回投影，`/<id>/file?path=...` 返回允许预览的工作区内文件。该命名空间所有写方法返回 405。业务 store、Task Center 生命周期、制作文件均不被投影接口写入。

固定读取目录：inputs、sources、designs、briefs、breakdowns、plans、bindings、manifests、assets、layouts、profiles、specs、scenes、reviews、checks、identities、metrics、evidence。目录层级映射五阶段；specs/layouts/profiles 归关系布局，scenes 的图片归渲染视图，scenes 的执行/检查 JSON 和 reviews 等归检查。意图/参考目录及 breakdown 归第一阶段。保留所有修订，不通过文件名或时间宣称哪个已被采纳。

每个 JSON/Markdown/文本/PNG/JPEG/WebP 文件投影为稳定相对路径节点，含原始 id/kind、SHA-256、原始内容与显式顶层 result/status；无状态为 unknown。JSON 解析失败为 unreadable。嵌套检查和问题保留原始字段供详情查阅，不把局部 passed 升格为场景通过。Task Center 继续是任务状态权威。

只按 JSON 中显式 `{path, sha256?}` 生成文件来源关系，字段路径保留在边详情。连线表示文件引用，不推断对象空间关系；空间关系在布局/spec 原始内容查看。present 表示所投影文件存在且给定 hash 相符（未给 hash 时仅表示存在），stale 表示 hash 不符，missing 表示工作区内路径确实不存在，outside 表示越出注册 root，unprojected 表示文件存在但未纳入可预览投影且 hash 尚未校验，unverified 表示无法核实。详情可跳转已投影的引用文件/引用方；missing/outside 等保留路径供追溯，不自动访问外部源。指向 Blender 二进制的引用可显示 unprojected，不假报丢失，也不宣称其 hash 已通过。

安全和容量边界：realpath 限制读取不越出 root；扫描跳过软链，预览禁止工作区外软链目标；仅允许固定预览类型，不返回 blend、脚本或 HTML；每文件最多 32 MiB，投影文本最多 2 MiB，最多 1500 节点、目录深度最多 5。超限和读取异常显示提示。扫描不是文件系统原子快照，生成中的部分写入可能暂时 unreadable，待下一次手动刷新恢复。revision 是展示文件 hash 列表摘要，不替代制作修订或审核结论。

## 验证

`node --test server/scene-projection.test.mjs` 覆盖 unknown、失败、损坏 JSON、稳定摘要、失配/丢失来源、越界与软链拒绝、未配置场景拒绝、GET 与写请求 405。

实际浏览器证据与最终检查结果见同目录 `scene-workflow-validation.md`。界面验收基于真实制作文件和浏览交互，不要求最终场景全通过。
