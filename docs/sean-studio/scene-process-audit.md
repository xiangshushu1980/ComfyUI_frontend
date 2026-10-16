# 场景过程可视化：现状审计

Owner: Sean。2026-10-17。对应 [修改设计](../design/scene-process-visualization.md)。

范围：读取现有 skill、合同、工具源代码与院落正式 JSON 产物；没有重新运行制作、查询在线资源、生成图像/模型或查看并重新评价图片。本轮检查是记录/字段/引用核查；已有审核中的视觉结论属于原审核者。没有全量读取 progress、日志或执行档案。

本表是设计时的历史审计；后续批次 A 已补上的展示能力与验证范围见 [实施记录](scene-process-batch-a.md)，不反向改写本次审计的源证据覆盖。

## 基线与依据

- UI 仓库 `/home/sean/projects/entity-canvas-studio`，基线 `24cb6543482cdd93041f5211684296102ae2371f`；工作树开工干净。
- 3D 仓库 `/home/sean/projects/3d`，公开合同基线 `ca26ca9`；现有未跟踪实验资料未改动。
- 执行依据：3D `.agents/skills/blender-scene-design/SKILL.md` 及 `references/handoff-template.md`，asset-preparation、online-assets、generated-assets、scene-layout、scene-review、production skill；`docs/production-system.md`、`docs/asset-library-workflow.md`。
- 工具依据：`production/scene.py`、`scene_review.py`、`library.py`、`runlog.py`；UI `server/scene-projection.mjs`、`src/sean-studio/scenePresentation.ts`、`SceneWorkflowView.vue`。
- 真实工作区：`/home/sean/projects/3d/.production-runs/scene-workflow-refinement/holdout`。下列路径相对此 root。它是本地忽略证据，未随设计提交上传。SHA 是本轮读取时的快照身份，不能把它当作每条历史引用均已通过验证。

## 逐项缺口清单

覆盖标记：**已查**是本轮或上轮明确读取/比较的字段；**部分**仅覆盖列出的样本；**未检查**不能解读为不存在。当前画布行为来自 `24cb654` 显示代码核对及既有浏览基线，不是本轮重做的全量浏览验收。V 编号对应设计第 7 节。下表把“展示缺口”和“源记录缺口”分开；空白功能不能靠重新排布节点补出来。

| 项目 / 覆盖                                        | 已有证据及字段定位（工作区相对路径）                                                                                                                                                    | 当前画布行为 / 展示缺口                                                  | 源记录缺口或未检查范围                                                               | 能否可靠推导                                                                                                       | 验收项     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------- |
| G01 场景参考；已查                                 | `inputs/concept-generation.json: kind/input_images/output/role`；`identities/courtyard-identity-r002.json: targets[id=courtyard-concept-r001].role/decision/rejection_reason`           | 文件/图片在目标组可见；代表图未读取判定，可能无标识展示拒绝概念          | 未核查所有场景输入图的存续与角色                                                     | 可直接显示该图 rejected 及原理由；不能把它作为已采用几何依据                                                       | V1、V8     |
| G02 生成的真实输入；部分                           | 上述 metadata 的 `input_images: []`；同 identity target 的 `execution.inputs` 指向 metadata JSON                                                                                        | 只解析通用 path 引用，未区分条件图与事后文档                             | 未独立核查原生成调用收据；不能宣布 metadata 真被工具消费                             | 可以显示两种原始声明及语义诊断；不能推导图像条件输入                                                               | V1         |
| G03 查库候选；已查样本                             | `plans/courtyard-r004.json: items[requirement=REQ-table].candidates/rejected/reasons/action`                                                                                            | 合成资产方案文件组，完整字段在 JSON 详情；未形成候选→需求→选择的业务链   | 未检查每条候选外观的人工判定与其他 plan 完整性                                       | 可提取 tags/dimensions 等机器拒绝原因；不能推导人工视觉否决                                                        | V2、V3     |
| G04 线上资源获取；部分                             | `sources/polyhaven/Lantern_01/1k/provenance.json: provider/page/license/file`；manifest 的 REQ-lamp record                                                                              | 源文本可见但与当前使用资产的关系未语义关联                               | 具体线上搜索词、完整搜索返回列表未检查；此 provenance 不提供完整检索过程             | 可显示 Poly Haven/CC0/具体源 pin 声明；不能推导所有搜索过程或缺失候选                                              | V2         |
| G05 生成源复用；已查记录，参考未核实               | `assets/field-beacon-generated-r001/run.json: source_method/source/provenance.generator/reference_sheet/reference_views/generation_seed`；generator 明确 existing output/not run in W02 | 与其他资产并列，未明确“早期结果复用”；也未排除它是院落实际使用资产的误读 | 外部实验参考图、生成调用与完整来源闭包未核查                                         | 可显示该来源声明与本轮复用，不宣称本轮新生成；外部参考不可自动越 root 预览                                         | V1、V2     |
| G06 手工/程序化制作；未检查                        | skill 允许此路线；尚未抽样核查本工作区相应源码、source_method/provenance、执行与预览证据                                                                                                | 通用来源文件或资产组可容纳，但无专门路线语义                             | 未检查是否发生、是否有过程记录、是否有可对应的制作前后效果                           | 不可推导存在或未发生；只能列“本项未检查”                                                                           | V2、V5     |
| G07 实际选用与场景实例；已查关系字段，闭包部分     | `manifests/courtyard-ready-r002.json: assets[requirement].record/review/rationale`；`specs/courtyard-scene-r009.json: instances[id=table].requirement`；identity.assets 五需求          | 按目录/文件名合组，未提供 requirement→exact record→instance 的可点击关联 | 全五资产 prepared/review/card 依赖闭包未在本轮重新校验                               | 关系字段可确定 r009 使用清单对应五需求，field-beacon 不在该清单；尚不能宣称全依赖完整有效                          | V3、V7     |
| G08 准备后模型效果；部分                           | asset record 的 `previews/files.prepared/provenance`，如 `assets/field-beacon-generated-r001/record.json`                                                                               | front/back/top 可见并归组；没有按原源/准备版本区分来源角色               | 未重新打开所有模型、查看所有卡或验证视觉质量                                         | 可展示已有预览及来源字段；不能重新宣称审核质量或形状正确                                                           | V2、V3     |
| G09 模型处理前后效果；未完成覆盖检查               | generated-assets skill 要求派生副本和必要 before/after；样本 source/run 与 prepared/previews 路径存在                                                                                   | 未提供模型处理前后对比视图                                               | 未检查是否有原始源预览、明确处理动作/字段、同角度 before/after；不等于这些记录不存在 | 不能把 source 与 prepared 路径不同推导成几何修复；源图与准备卡也不自动视为可比前后图                               | V5         |
| G10 摆放与渲染；已查 r009 直接输入                 | `scenes/courtyard-scene-r009/handoff.json: inputs/outputs/requirements`；`execution.json: result/visual_review`                                                                         | spec、图片、检查分分类展示，没有一次场景尝试的统一入口和跨关系导航       | 该次全部输出、二进制与模型传递闭包尚未重验                                           | 可按 handoff 关联该次 PNG/.blend 与输入；读到 rendered 不等于视觉通过                                              | V3、V4     |
| G11 失败尝试；工具覆盖已查、真实样本未检查         | `production/scene.py` 失败分支写 `execution.json: result=failed,error`；runlog 可记录 exit_code/outcome；未审计 holdout 全部失败尝试                                                    | 失败 JSON 在通用文件组详情中可见，但无稳定 attempt 聚合/部分输出语义     | 未检查真实失败尝试的数量、缺开始/结束、错误、部分 PNG 是否被保留                     | 可设计按显式 failed 展示；不能报告“所有失败均已保留/已覆盖”或由缺 handoff 断言失败                                 | V4、V9     |
| G12 问题与审核；已查两个样本                       | `reviews/courtyard-review-r001.json: handoff→r004,result=revise,notes`；r002 的 handoff→r009、result=passed                                                                             | review 与图分组、原文可查；未把问题与被评图直接连接                      | notes 尚无结构化逐问题 ID；本轮未重做视觉判断                                        | 可可靠连接审核针对的 handoff/图与原结论；提炼具体问题需保留字段依据，不能自动捏造修改动作                          | V3、V4、V5 |
| G13 修订与落盘；已查 spec 差异，因果缺口           | r004/r009 的 `instances[id=crate].location`、camera、lights；已查 specs 无 change_summary，r009 handoff 默认 Initial iteration                                                          | 文件名去修订号合组；没有修改动作、前图/后图与字段差异视图                | 缺明确 previous/responds_to 结构化关联；中间尝试与原作者完整修改原因未检查           | 可 derived 比较 crate y: 0.3→-0.15、camera 改变、其他四实例相关字段和 lights 不变；不能由此断言 r009 直接响应 r001 | V5、V9     |
| G14 同世界范围；已查 spec 字段，传递依赖未完整核实 | r009/top-r010 spec 仅 `id,intent,camera,frames,resolution` 不同；其余显式字段相同；r009 handoff 直接 input pins 匹配                                                                    | 图片作为不同组展示；没有比较范围/未核实依赖说明                          | 两次执行的 prepared/原源/地面/场景构建器版本/默认值等闭包未完整核实                  | 只支持 compared_fields_match；不能宣称几何、world 或 full_scene 全部已验证一致                                     | V6         |
| G15 最终交付与用户采用；未检查明确交付证据         | r002 审核 passed 已查；工作区根存在 handoff.md，但本轮未读取/审计最终选版正文及用户采用凭据                                                                                             | 没有正式 selected_delivery 语义，代表版本按组内排序选出                  | 最终交付版本与 actor/证据未检查；不等于没有交付记录                                  | 不能从 passed、r009 数字、mtime 或大图推导最终交付/用户接受                                                        | V7         |
| G16 生命周期/纠正；拟定合同、无旧数据覆盖证明      | runlog 实现有 attempt id/started/completed/exit_code；新 process 记录尚未实现                                                                                                           | 尚无动作生命周期索引、幂等/纠正链和多动作并列状态                        | 旧动作 event/attempt 身份与实际覆盖未检查；新合同缺口本轮已在设计 5.2 收紧           | 只有真实事件才能归并；缺记录显示未知，修改/spec 发布与 render/review 分别解释                                      | V4、V9     |

已做的有限核对：r009 handoff 的直接 inputs（manifest/spec/layout/五 profiles）在上轮检查时 SHA 均匹配；这不是两个场景的全部传递依赖验证，也不是所有图像/资产审核已复验。r004/r009 实例对比的具体值：crate.location 从 `[-1.3,0.3,-7.9e-08]` 到 `[-1.3,-0.15,-7.9e-08]`，其余四实例的 location/rotation_z/scale/requirement 未变，camera 变、lights 未变；这是字段比较，不补写历史因果。

本轮补充阅读 `production/blender/scene.py`：地面由 `spec.get('ground_size',200)` 创建，world_strength 有代码默认值；这些不在既有 render-report 中完整列出。当前源码可解释当前行为，但没有历史执行的构建源/默认值 pin，就不能据此证明旧两版世界状态完全一致。

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
