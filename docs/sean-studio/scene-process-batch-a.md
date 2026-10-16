# 3D 过程画布：批次 A 实现与验证

Owner: Sean。2026-10-17。任务 `remote-4285562b-c597-4fb4-97e9-e4448f2cea78`。
设计依据：[过程可视化](../design/scene-process-visualization.md)；历史字段核查：[现状审计](scene-process-audit.md)。本批从 `1308ef9` 实现，只读既有院落产物。

## 已实现

`server/scene-process.mjs` 从已有合同生成可选 `presentation`，保留原始 nodes/edges。需求以 breakdown 路径与 requirement 为作用域；清单选用以 manifest 路径与 requirement 为作用域；实例以 spec 路径与实例字段为作用域。不会通过修订数字、mtime 或去掉版本号来建立选用、使用或修订因果。

语义关系包含 candidate_for、selected_for、used_in、consumed、produced、reviewed、informed_by、documented_by；每条保留 origin、文件/字段/hash basis、原始 pin 与 verification。空间关系保留在 spec 实例原文。新索引不写入制作工作区，不派发动作，不启动 Agent，不改现有 skill 执行次序。

对象文件夹绑定具体 manifest 选择，集中显示候选、选用理由、精确 record/review、来源/prepared 文件身份和预览卡。布局文件夹绑定具体 spec；尝试文件夹绑定具体 handoff，集中显示输入、实例、PNG/.blend 身份、执行记录与独立审核。没有 handoff 的 execution 仍按其确切目录显示失败/部分产物，不从缺文件推断失败。

双击文件夹进入后隐藏父节点；单击查看属性；关联条目单击只看属性、双击进入目标视图。选中对象与直接关系高亮，其他节点淡化。图片双击放大，不增加导航历史。侧键只保存和恢复分类/文件夹与视口，返回时清空选择。拖动只保存本机布局，每个文件夹有独立位置键；已有总览/分类位置键保持兼容。

生成概念的 rejected 与原理由保留，拒绝图不会作为无标记的总览封面。field-beacon 的 run 明确声明 existing output/not run，投影为 existing_output_reused，并显示“早期结果复用（来源声明）”；它不在院落 manifest 的选用或 r009 的使用关系中。其他来源声明不会自动变成本轮执行证明。

## 完整性范围

对 manifest 引用、record 的 source/prepared/inspection/verification/previews/provenance，以及 handoff 输入/输出、review handoff/images 和 identity card 核对 pin。允许在注册 root 内流式核对最大 512 MiB 的二进制身份；二进制仍不提供浏览器下载/预览。工作区外引用不读取。文件预览原有类型、大小与路径边界保持有效。

`used_in.verification` 联合核查 spec 的 manifest pin、清单 record/review/identity 与 record 的直接依赖，并检查资产 review 的 record/preview 身份。失配或缺失显示 partial 和诊断，关系不消失；scope 为 `manifest_record_and_direct_asset_dependencies`。这不是几何/world/full_scene 闭包核实，不验证历史构建器、默认值或所有传递模型依赖。卡片依据缺失时保留未知，不补造卡片。

同一动作的执行状态、文件核实和独立审核仍分开。handoff.visual_review=not_checked 不隐藏后续独立 scene_review.passed；passed 不代表最终交付或用户验收。尚无依据的修订因果、执行时间和最终选版不推导。每次刷新重建语义索引；revision 包含语义核实结果，扫描仍非原子快照。

## 实测

真实 root：`/home/sean/projects/3d/.production-runs/scene-workflow-refinement/holdout`。本批只读取，没有重新制作、生成或视觉复审院落。

- CLI：169 原始文件、111 语义对象、30 文件夹、369 关系；真实样本无语义诊断。REQ-table → manifest courtyard-ready-r002 的 record/review/visual_card → spec courtyard-scene-r009 的 table → handoff frame-0001.png → courtyard-review-r002，精确 pins 核对通过。
- Luna 子 Agent 用 CLI 独立复核上述链、拒绝概念和早期复用；临时 root 模拟 missing、stale、outside。发现“record 失配但 used_in 仍 verified”的反例后修正，复验降为 partial。报告 `/tmp/scene-process-cli-verification.json`，不随仓库发布。
- 浏览器通过 playwright-cli 操作真实页面：从需求双击关系进入对象，再到 r009 布局、尝试、PNG、r002 审核；反向从 PNG 经 handoff/spec/table 返回 r002 选择。文件属性和图片/审核切换没有增加视图历史。
- Chromium CDP 原生 back/forward 鼠标事件：从尝试退回布局，再前进到尝试，恢复相同 scale/offset，两次均无选择恢复。
- 真实鼠标拖动模型卡：位置变化并写入本机位置键；未导航、未选中；检查后还原测试产生的 localStorage 偏好。双击对象文件夹核查父节点不在可见 graph 中。
- 截图位于忽略目录 `.playwright-cli/scene-process-review-a.png`、`scene-process-object-highlight-a.png`，已打开检查。截图来自本轮真实院落浏览；不作为模型质量复审。
- `node --test server/scene-process.test.mjs server/scene-projection.test.mjs`：3 项通过，覆盖独立审核、依赖缺失、失配、越界与来源角色；已有 projection 安全/只读回归通过。Vue 类型检查、ESLint、Stylelint 与 Node 25 生产构建通过。构建仍有上游静态资源/分包警告，浏览器无错误，有既有 transparent 调色板警告。

CLI 验证使用约 10 次命令完成首轮，报告约 2.5 KiB；没有取得子 Agent token 或计费数据，也没有等价高成本对照组，因此不能宣称额度节省比例。

## 后续边界

批次 B 的生命周期记录器、幂等/纠正与新修改过程未实现。批次 C 的复杂连通分量布局和更广记录覆盖未实现。当前对象/尝试的局部布局沿用已有布局工具；同一需求在不同 manifest 中保留不同文件夹，不以最新版本代替历史版本。最终交付、完整同世界核实和用户验收继续以原权威记录为准。
