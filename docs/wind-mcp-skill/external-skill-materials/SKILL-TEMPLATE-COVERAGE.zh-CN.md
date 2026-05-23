# 通用 SKILL 中文模板覆盖度对比

本文对比 `SKILL.zh-CN.md.tmpl`、当前 `SKILL.md.tmpl`、`SKILL_NEW.md`、
`superSKILL.zh-CN.md` 和 `gstackSKILL.zh-CN.md.tmpl`，用于判断通用模板是否足够覆盖优秀开源 skill 的常见结构，以及 `SKILL_NEW.md` 作为 Wind MCP
落地版是否接近优秀 skill 的标准。

## 结论

新的纯中文模板已经覆盖优秀 skill 的主流程骨架，并补齐了当前模板缺少的几个关键运行时协议：

- 启动前置 / 环境检查
- 角色与回应姿态
- 模式分流
- AskUserQuestion 交互规则
- 工具与引用资源导航
- 工件模板
- 兜底与交接
- 状态记录
- 完成状态

`SKILL_NEW.md` 已经很好地承接了这些原则中的工具集成部分：它有清晰的 Wind
数据范围、固定路由顺序、硬门禁、工具契约摘要、CLI 调用约束、API Key 交互分支、
错误处理和 wind-alice 最终兜底边界。它不像 `gstack` 那样追求跨会话产品化，因此没有保留启动前置、长期状态记录、遥测或复杂人格化收尾，这个取舍是合理的。

这些模块不要求每个 skill 全部保留。优秀 skill 的共同点不是章节越多越好，而是：

1. 主文件明确“何时触发、做什么、不能做什么”。
2. 高风险步骤有硬门禁。
3. 复杂细节拆到 `references/`、`scripts/`、`assets/`。
4. 工作流有阶段、停止点、验证和完成状态。
5. 与用户交互时给清晰选项，而不是让 agent 自行猜。

## 对比矩阵

| 能力 | 当前 `SKILL.md.tmpl` | 新 `SKILL.zh-CN.md.tmpl` | `SKILL_NEW.md` | `superSKILL.zh-CN.md` | `gstackSKILL.zh-CN.md.tmpl` | 判断 |
| --- | --- | --- | --- | --- | --- | --- |
| frontmatter 触发说明 | 有 | 有，且说明可选增强字段 | 很强，含范围、Key、排除项、示例 | 有 | 很强，含触发词、工具、上下文查询 | 已覆盖 |
| 适用 / 不适用范围 | 有 | 有，拆为支持、不支持、环境前提 | 很强，按 server_type 和不支持场景列明 | 隐含在目标和硬门禁里 | 有，分模式和阶段体现 | 已覆盖 |
| 硬门禁 | 有 | 有，强调副作用和用户确认 | 很强，覆盖路由、manifest、指标、CLI 工作目录、Key、禁止 Web Search | 很强，`<HARD-GATE>` | 很强，多处 STOP 点 | 已覆盖 |
| 启动前置 / preamble | 无 | 有，可选 | 无；目前不需要复杂启动协议 | 无 | 很强，含更新、配置、状态加载 | 新模板补齐，Wind 可不保留 |
| 模式分流 | 较弱 | 有独立章节 | 很强，按文档、宏观、行情、专项 NL、analytics 固定顺序路由 | 无明显多模式 | 很强，创业 / 构建者模式 | 已覆盖 |
| 分阶段工作流 | 有 | 有 | 很强，路由、选工具、校验、CLI、回答五阶段 | 很强，清单 + 流程图 + 详解 | 很强，阶段 1-6 | 已覆盖 |
| 反模式 / 常见误用 | 无独立章节 | 在重要规则和决策规则中覆盖 | 有，主要体现在禁止 Web Search、禁止 analytics 抢路由、禁止错误兜底 | 很强，有“这太简单了”反模式 | 很强，有反谄媚规则、危险信号 | Wind 版已覆盖关键误用 |
| 角色 / 语气 / 回应姿态 | 无 | 有 | 较弱，但 Wind 工具型 skill 不需要强人格化 | 有协作式语气 | 很强，按模式定义姿态 | Wind 可接受 |
| AskUserQuestion 规则 | 无 | 有简化版 | 有，覆盖 API Key 和 wind-alice 兜底选择；未定义完整 AUQ 格式 | 有用户批准流程，但未抽象工具格式 | 很强，定义格式和停止点 | Wind 已覆盖必要分支 |
| 工具与资源导航 | 有 | 更细，含资源导航表 | 很强，逐一指向 manifest、contracts、indicators、errors、escaping、fallback | 较少 | 很强，含脚本、状态、外部资源 | 已覆盖 |
| 详细工具契约拆分 | 有原则 | 有原则和导航表 | 很强，主文档保留摘要，细节迁移到 `references/tool-contracts.md` | 不明显 | 通过模板变量和长资源实现 | 已覆盖 |
| CLI / 外部工具调用协议 | 无独立项 | 可通过工具资源和硬门禁表达 | 很强，明确 cwd、stdout/stderr、exit code、sandbox、prefix_rule | 不涉及 | 很强，preamble 和脚本协议丰富 | Wind 版强项 |
| 输出契约 | 有 | 有 | 很强，要求返回 Wind 结果、限制和数据来源标注 | 设计文档输出 | 很强，区分模式文档模板 | 已覆盖 |
| 工件模板 | 有 | 有，中文化并扩展 | 无；Wind 查询类 skill 不需要写固定工件 | 有设计文档规则 | 很强，创业 / 构建者两套模板 | Wind 可不保留 |
| 校验 / 自查 | 有 | 有 | 很强，调用前和结束前分开校验 | 很强，规格自查 | 很强，审核循环 | 已覆盖 |
| 失败处理 | 有 | 有，强调不可错误兜底 | 很强，按 error code 和 `agent_action` 分支处理 | 隐含较少 | 有紧急出口和跳过规则 | Wind 版强项 |
| 兜底 / 下游交接 | 有 | 有独立章节 | 很强，限定 analytics 和 wind-alice 的可用条件 | 强制交给 writing-plans | 强交接到评审 / 资源 / 后续 skill | 已覆盖 |
| 状态记录 / 学习 | 无 | 有，可选 | 无；当前 Wind skill 不需要跨会话学习 | 无 | 很强，profile、learnings、analytics | 新模板补齐，Wind 可不保留 |
| 完成状态 | 无 | 有 | 隐含在回答 / 失败处理里，未显式枚举 DONE / BLOCKED / OUT_OF_SCOPE | 隐含在批准后转实现 | 明确 DONE / NEEDS_CONTEXT | `SKILL_NEW.md` 可补 |
| 流程图 | 无 | 未默认保留 | 无；线性路由表已经足够 | 有 dot 流程图 | 无，但阶段非常细 | 可选，不建议强制 |
| 隐私 / WebSearch 门禁 | 无 | 可通过硬门禁表达 | 很强，明确禁止 Web Search 兜底 | 无 | 有搜索前隐私确认 | Wind 已覆盖 |

## 对当前模板的主要差距判断

当前 `SKILL.md.tmpl` 已经适合作为“轻量执行型 skill”的骨架，但如果目标是接近
`superSKILL` 和 `gstackSKILL` 的质量，它缺少以下内容：

1. **运行时协议不足**：没有启动前置、环境探测、状态加载、升级提示等位置。
2. **交互门禁不足**：没有明确 AskUserQuestion 的使用方式、停止点和选项化问题。
3. **模式分流不足**：复杂 skill 往往不是一条流程，而是先判定模式再进入不同路径。
4. **回应姿态不足**：优秀 skill 会规定 agent 的角色、语气、追问方式和反模式。
5. **完成状态不足**：没有统一的 DONE / BLOCKED / NEEDS_CONTEXT 等收束语义。
6. **长期记忆不足**：没有给跨会话学习、用户偏好、项目经验留下可选位置。

## 对 `SKILL_NEW.md` 的判断

`SKILL_NEW.md` 已经不是简单套模板，而是一个针对 Wind MCP 的可执行 skill 设计。
它比通用模板更具体，也更接近工具型优秀 skill 的标准。

### 已经做得好的部分

1. **触发和边界明确**：frontmatter 直接说明支持 A 股、港股、美股、基金、指数、债券、公告新闻和宏观指标，同时排除欧股、日股、汇率、期货盘口、加密货币等场景。
2. **路由顺序稳定**：文档、宏观、行情、专项 NL、analytics 兜底的顺序清楚，能避免 agent 一上来就用泛化工具。
3. **硬门禁足够强**：Key、manifest、指标表、CLI 工作目录、sandbox 权限、禁止 Web Search 都写在主文件里，属于必须保留的高频约束。
4. **引用迁移合理**：字段表、指标、错误码、shell 转义、wind-alice fallback 都放到 `references/`，主文档只保留导航和摘要，没有把工具契约堆满正文。
5. **失败处理成熟**：区分 Key、权限、额度、限流、网络、JSON 转义、参数校验、无结果、协议错误，并明确哪些错误不能切换路由绕过。
6. **用户交互门禁正确**：`KEY_MISSING` 和 wind-alice 兜底都要求先问用户，避免 agent 直接打开网页或静默切换 skill。
7. **CLI 运行协议清楚**：明确必须在 skill 目录执行，解释 stdout/stderr/exit code 的契约，能覆盖真实调用中出现的 cwd 问题。

### 还可以补强的部分

1. **显式完成状态**：目前完成状态隐含在回答和失败处理里。可以补一个小节，定义 `DONE`、`BLOCKED_KEY`、`BLOCKED_PERMISSION`、`NO_RESULTS`、`OUT_OF_SCOPE`，让 agent 在失败时更稳定收束。
2. **启动前置**：如果未来 `update-check.mjs` 或 CLI 环境探测需要每次运行，可以加“启动前置”小节；当前没有强需求，不必为了模板完整强加。
3. **角色与回应姿态**：Wind 是工具型 skill，不需要 gstack 那种人格化姿态。但可以补一句“扮演金融数据路由与口径校验器”，强化 agent 不要自由发挥金融结论。
4. **AskUserQuestion 格式**：当前只定义了 Key 分支的选项含义，没有定义完整问题格式。考虑补一个轻量规则：问题必须包含当前阻塞原因、推荐选项、两个互斥选项、选择后的动作。
5. **超范围收束**：不支持市场和不支持数据类型已经写了，但可在失败处理或完成状态里明确超范围时不要调用 Web Search，直接返回 `OUT_OF_SCOPE`。

### 不建议补的部分

- 不需要照搬 `gstack` 的遥测、profile、learnings、资源推荐、跨会话收尾。
- 不需要照搬 `superSKILL` 的设计审批流程；Wind skill 是取数执行，不是需求设计。
- 不需要把 `references/tool-contracts.md` 的详细字段表搬回 `SKILL_NEW.md`，否则主文件会变重，反而降低命中后的执行质量。

## 是否应该全部回填到主模板

不应该把所有开源 skill 的细节都回填成必填章节。

应该采用“主模板 + 可删模块”的方式：

- 基础 skill：保留角色、范围、硬门禁、输入、工作流、工具资源、输出、校验、失败处理、重要规则。
- 工具集成 skill：额外保留启动前置、工具契约、错误处理、兜底与交接。
- 交互式咨询 skill：额外保留角色与回应姿态、模式分流、AskUserQuestion、工件模板、完成状态。
- 跨会话产品化 skill：额外保留状态记录、学习记录、升级 / 配置 / 遥测等启动协议。

## 对 Wind MCP Skill 的建议

`wind-mcp-skill` 属于“工具集成 + 数据路由 + 错误恢复”型 skill，不需要照搬
`gstack` 的所有产品化章节，但应该保留这些能力：

- 硬门禁：Key、权限、CLI 工作目录、禁止 Web Search 兜底。
- 模式分流：文档、宏观、行情、专项 NL、analytics 兜底。
- 工具契约：主文档只保留摘要，字段表迁移到 `references/tool-contracts.md`。
- AskUserQuestion：API Key、打开页面、wind-alice 兜底都应该选项化。
- 失败处理：错误码和 `agent_action` 保持一致。
- 完成状态：成功、无结果、Key 阻塞、权限阻塞、超范围要能明确收束。

不建议回填：

- gstack 的遥测、YC 资源、builder profile、跨会话营销式收尾。
- superSKILL 的设计审批全流程，除非 Wind skill 开始承担需求设计而不是数据调用。
- 过长的工具字段表到 `SKILL_NEW.md` 主体；继续放在 reference 更合理。
