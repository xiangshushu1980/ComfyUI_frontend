# 场景过程可视化：现状审计

Owner: Sean。2026-10-17。对应 [修改设计](../design/scene-process-visualization.md)。

范围：读取现有 skill、合同、工具源代码与院落正式 JSON 产物；没有重新运行制作、查询在线资源、生成图像/模型或查看并重新评价图片。本轮检查是记录/字段/引用核查；已有审核中的视觉结论属于原审核者。没有全量读取 progress、日志或执行档案。

## 基线与依据

- UI 仓库 `/home/sean/projects/entity-canvas-studio`，基线 `24cb6543482cdd93041f5211684296102ae2371f`；工作树开工干净。
- 3D 仓库 `/home/sean/projects/3d`，公开合同基线 `ca26ca9`；现有未跟踪实验资料未改动。
- 执行依据：3D `.agents/skills/blender-scene-design/SKILL.md` 及 `references/handoff-template.md`，asset-preparation、online-assets、generated-assets、scene-layout、scene-review、production skill；`docs/production-system.md`、`docs/asset-library-workflow.md`。
- 工具依据：`production/scene.py`、`scene_review.py`、`library.py`、`runlog.py`；UI `server/scene-projection.mjs`、`src/sean-studio/scenePresentation.ts`、`SceneWorkflowView.vue`。
- 真实工作区：`/home/sean/projects/3d/.production-runs/scene-workflow-refinement/holdout`。下列路径相对此 root。它是本地忽略证据，未随设计提交上传。SHA 是本轮读取时的快照身份，不能把它当作每条历史引用均已通过验证。

## 关键观察

| 问题                   | 已观察事实                                                                                                                                                                                | 展示与设计结论                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 整体场景有没有参考图   | inputs 有 courtyard-concept-r001.png 与生成来源；identity target 标 `generated_concept`、`decision: rejected`，理由为仅供构图且不能证明几何/真实库模型身份                                | 要显示图及拒绝理由；不能当作当前已采用设计封面                                                               |
| 物体有没有参考/创建    | field-beacon run 保留 reference_sheet/views、seed/settings 和 generated source；generator 字符串明确“existing output, not run in W02”                                                     | 有历史生成来源记录，但不是本轮新创建；参考图在外部实验目录且未在本轮核验，不自动越 root 展示                 |
| 有没有找到现成资源     | plan.items 含 candidates/rejected/reasons；Lantern_01 的源记录是 Poly Haven、CC0、有 page/file pin；清单选择了实际库版本                                                                  | 显示查库与获取来源；plan 的 rejected 多为 tags/dimensions mismatch，不能冒充人工外观否决或完整线上搜索结果   |
| 哪些模型真用于场景     | courtyard-ready-r002 的 assets 为桌/椅/灯/箱/桶五条 requirement；identity.assets 也是这五条；field-beacon 不在该 manifest                                                                 | 库中存在的生成物不能全部连成“院落使用资产”；通过 spec instance → pinned manifest → record 解析               |
| 有没有模型实际效果     | asset records 有 front/back/top 卡、准备文件、inspection/verification/review 引用；真实场景 handoff 包含 PNG/.blend                                                                       | 当前已有大量可展示效果，主缺口是组织和角色，不需要为了填节点重新生成                                         |
| 有没有修正             | courtyard-review-r001 为 revise，针对 courtyard-scene-r004，notes 要求箱子朝访客侧移动并补细节视角；r002 为 passed，针对 r009                                                             | revise 与后续效果必须可见；但不能只凭修订号宣称完整父子链                                                    |
| 修改了什么             | 对 r004/r009 spec 按实例 id 比较，crate.location 从 [-1.3,0.3,-7.9e-08] 到 [-1.3,-0.15,-7.9e-08]；其他四个实例的 location/rotation_z/scale/requirement 未变化；camera 变化、lights 未变化 | 可作为 derived 字段对比展示；这不是记录作者当时写下的原因，也不证明中间没有其他尝试                          |
| 为什么修正关联不清     | 检查的 specs 均没有 change_summary；r009 handoff 的 change_summary 是工具缺字段时的默认 Initial iteration；缺明确 previous/responds_to                                                    | 现有 skill 要求修改说明，但实际旧产物未完整留下结构化连接；补充轻量记录，不修改旧 handoff                    |
| 顶视与透视是否同场景   | r009 与 top-r010 的 instances、layout_validation 完全相同，camera 不同                                                                                                                    | 有字段依据可建立同世界视图关系；不再只按文件名/图片近似归组                                                  |
| 渲染与审核为何矛盾     | execution/handoff.visual_review 为 not_checked；另有独立 scene_review passed                                                                                                              | 这是独立不可变审核，不应覆盖 handoff；投影关联适用且 pins 有效的审核，多个审核并列保留，同时保留执行原始状态 |
| 来源记录能否当实际输入 | concept-generation 的 input_images 是空数组；identity target.execution.inputs 含 concept-generation.json 文档 pin，记录语义不等同于图像条件输入                                           | 实际输入、事后文档与人工参考必须拆关系；保留原字段并提示语义边界，不能制造“图像条件生成”链                   |

补充核对：本轮对 r009 handoff 的全部 inputs 做当前字节 SHA 校验，manifest/spec/layout/五 profiles 的 pins 均匹配。该观察仅覆盖这些输入；没有在此处重新校验所有资产、渲染二进制、所有历史 review 或几何功能。

## 显示代码的直接缺口

1. SceneProjection 仅按目录赋阶段，递归收集 `{path}` 后统一画文件引用；不能辨别输入、输出、参考、审核与修订。
2. scenePresentation 按目录和去掉 rNNN 的文件名合组；没有通过 manifest/spec 判断采用与实际使用，也不保留每次尝试的业务边界。
3. 代表图来自组内图片，尚不检查 target.role/decision，拒绝概念图可能被当作无标识封面。
4. 当前预览允许图片/文本，不包含 blend；二进制有真实预览卡可用，无需先开发在线 3D 查看器。
5. 固定目录未覆盖拟定 process 记录；现有 runlog JSONL 也不在通用 JSON 文件投影中。runlog 在评测中可用，但普通场景没有义务运行评测计时。
6. 技术文件已收进组，导航/拖动体验已有基线；下一步需要语义投影，单改圆形/直线位置无法补齐过程。

## 检查产物快照

| 相对路径                                          | 本轮 SHA-256                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `inputs/concept-generation.json`                  | `b87eec3636be0feec7e7f4e17bc6a0d04f1589824a967ac7070766801830a188` |
| `identities/courtyard-identity-r002.json`         | `8bc46cb446c1b3c9094f914f9c22ac6a00642351628ddf1698b68f6efa642910` |
| `plans/courtyard-r004.json`                       | `d3711bdff00586b73e2c0913f256002d1424608d2b0fdf89bed2825437c611ed` |
| `sources/polyhaven/Lantern_01/1k/provenance.json` | `3fd6114ca8e2935ce54cf2c821027031589a553cbcda88bcc4d95c1cae8f17a1` |
| `assets/field-beacon-generated-r001/run.json`     | `1c8a3fd9fa244d1c1fc1908b046c7f5fc4774ad714fdaab7c1a655640f92e0c9` |
| `manifests/courtyard-ready-r002.json`             | `3a0852b76ae824c643ff28df0228a32de241995f3bce4b2594015fc3d78213ba` |
| `reviews/courtyard-review-r001.json`              | `37c24bfb93a91ef1d14d9c9555c77376df02b79ef35942aaf74f8612f1d0edf0` |
| `specs/courtyard-scene-r004.json`                 | `845ea40bcaf56a44c6bf96c05f6b24a95d22d6094d2d1a7c480e414162de3d93` |
| `specs/courtyard-scene-r009.json`                 | `616bb9c23efdaa9d2aa639b2b150977679ab8301546a0935835aa76205b85cfd` |
| `specs/courtyard-top-r010.json`                   | `4e27f6d128bd44f6ba616b0dbba73d8c1857d9a1a0fbec4ff682685debcb88fc` |
| `scenes/courtyard-scene-r009/handoff.json`        | `5f1f779251f0876bfacb49e9842577d25c4f46aae5d592352d401287ad4d277d` |
| `reviews/courtyard-review-r002.json`              | `50269845b142229cddf446b0ad3c3add535e153273888359dd08f1e7e9acaf1f` |

## 尚未证明的内容

没有核查所有旧源图是否仍可取得、所有搜索是否留存、所有模型处理是否有 before/after、或每个版本之间的因果关系。没有重新验证生成器输入消费、视觉质量、人体工学和最终场景验收。本设计不以填满所有节点或全阶段 pass 为完成标准。
