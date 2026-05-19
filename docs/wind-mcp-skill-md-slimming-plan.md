# wind-mcp-skill SKILL.md 减重方案

## 背景

当前 `skills/wind-mcp-skill/SKILL.md` 约 435 行，承担了三类内容：

- Agent 必须遵守的运行约束。
- 详细工具目录、参数表、示例、使用技巧。
- 人类安装、Shell 转义、错误排障、升级说明。

问题是 `SKILL.md` 会被 Agent 作为高优先级上下文加载。内容越重，越容易稀释真正强约束，也会让 Agent 在路由和调用时被大量参考说明干扰。

减重目标不是删掉约束，而是把“强约束留在 `SKILL.md`，长表格和低频说明迁入 `references/` 或 README”。

## 减重目标

建议将 `SKILL.md` 从 435 行压缩到 120-160 行。

目标结构：

```text
SKILL.md
├── frontmatter：短 description + 少量 examples
├── 1. 适用范围与禁用范围
├── 2. 调用入口
├── 3. 路由顺序
├── 4. 参数校验硬约束
├── 5. 错误与 fallback 策略
├── 6. 输出与合规要求
└── 7. 需要时读取的 reference
```

`SKILL.md` 只保留决策规则和必须遵守的红线，不再承载完整工具手册。

## 必须保留的实际约束

以下约束来自当前 `SKILL.md`，减重后仍必须保留在主文件中。

### 数据范围

- 覆盖：A 股、港股、美股、基金/ETF、指数/板块、债券、公告、新闻、宏观/行业经济指标、`analytics_data` 通用结构化取数。
- 不覆盖：欧股、日股、非中概非美股、汇率、期货盘口、加密货币、非金融数据。
- 结果末尾必须标注：“数据来源于万得 Wind 金融数据服务”。

### 调用入口

- 使用 `<skill_dir>/scripts/cli.mjs`，相对路径按本 skill 目录解析。
- `call` 形态：`node scripts/cli.mjs call <server_type> <tool_name> '<params_json>'`。
- Codex 沙箱访问 Wind 后端时必须用 `require_escalated`。
- 需要 `WIND_API_KEY`；缺 Key 时按 CLI 的结构化错误/提示处理。

### 路由顺序

必须保留固定路由顺序：

1. `financial_docs`：公告、年报、新闻、快讯、媒体报道。
2. `economic_data`：GDP、CPI、PPI、PMI、社融、利率、失业率、进出口等宏观指标。
3. 行情类：`stock_data` / `global_stock_data` / `fund_data` / `index_data` 的快照、K 线、分钟线。
4. 专项 NL 工具：财务、档案、股东、事件、技术、风险、持仓、业绩、主体财务等。
5. `analytics_data.get_financial_data`：只作为兜底，不得抢占明确意图。

### 参数校验

- `server_type + tool_name` 必须存在于 `references/tool-manifest.json`。
- 行情快照工具的 `indexes` 必须逐字段在 `references/indicators.md` 中完全匹配。
- 快照 `indexes` 只能传中文字段名，不能猜测、翻译或改写。
- K 线字段是 `begin_date` / `end_date`，均必填，格式 `yyyyMMdd`。
- 分钟级行情字段是 `begin` / `end`，不是 `begin_date` / `end_date`。
- EDB 字段是 `beginDate` / `endDate`，格式 `yyyyMMdd`。
- `aftype` 只接受 `"0"` / `"1"`。
- A 股走 `stock_data`，港股/美股走 `global_stock_data`。
- 单工具调用只支持单标的；多标的对比必须拆成多次调用。

### 错误与 fallback

- JSON、未知 server、未知 tool、Key、权限、限流、余额、网络、后端 5xx，不得改走 `analytics_data`。
- 专项工具字段、工具、口径类错误，先按工具表修正并重试一次。
- 专项工具重试仍失败，且问题属于结构化取数，才可用 `analytics_data`。
- `analytics_data` 首次必须透传用户原始问句；失败后才可忠实拆分或改写。
- `analytics_data` 重试后仍失败，停止继续 fallback，并简要说明错误码、后端原文、已尝试路径。
- `wind-alice` 只能作为所有 wind-mcp-skill 路径失败后的终极选项，且必须先询问用户，不得自动切换。

## 应迁出的内容

### 迁出到 `references/tool-catalog.md`

当前 `## 3. 工具表` 是 `SKILL.md` 最大的体积来源，应迁出为工具目录。

建议内容：

- 8 个 server_type 的工具清单。
- 行情类 3 组工具签名。
- 各 NL 工具的用途、入参、示例问题。
- `financial_docs`、`economic_data`、`analytics_data` 的字段表。

`SKILL.md` 只保留一句：

```md
具体工具用途和字段表见 `references/tool-catalog.md`；调用前必须按对应工具表校验参数。
```

### 迁出到 `references/cli-usage.md`

当前 Shell 转义说明很长，且只在手写命令出错时需要。建议迁出。

建议内容：

- Bash / Git Bash / WSL / PowerShell / cmd.exe 的 JSON 写法。
- PowerShell 5.x UTF-8 读取说明。
- `open-portal` / `setup-key` 用法。
- 常见 `INVALID_PARAMS_JSON` 排查。

`SKILL.md` 只保留：

```md
若 CLI 返回 `INVALID_PARAMS_JSON`，读取 `references/cli-usage.md` 的 shell 转义说明后修正命令。
```

### 迁出到 `references/error-handling.md`

当前 `## 7. 出错怎么办` 和 `wind-alice` 兜底规则较长。建议拆成两个层级：

- `SKILL.md` 保留 fallback 红线和决策顺序。
- `references/error-handling.md` 放错误处理流程、wind-alice 安装话术；错误码权威字典放 `references/error-codes.json`。

CLI 输出 JSON 化后，该文档应以 `error.code`、`error.retryable`、`error.fallback_allowed`、`error.agent_action`、`notices` 为主，不再教 Agent 解析 `stderr`。

## 当前脚本已落地的变更

`scripts/cli.mjs` 已完成第一阶段输出整理，`SKILL.md` 后续应按这些事实同步：

- 主输出统一为 stdout JSON envelope：`ok` / `command` / `data` 或 `error` / `notices` / `meta`。
- 默认不再从 stderr 读取错误、帮助或更新提示。
- `call` 成功时只返回一份原始 MCP `data.result`，不再同时返回 `data.parsed`，避免重复占用上下文。
- 错误返回包含 `error.code`、`error.category`、`error.retryable`、`error.fallback_allowed`、`error.agent_action`、`error.hint`、可选 `error.context`。
- `error.agent_action` 是 Agent 的主要下一步动作字段；`error.hint` 是解释字段，优先级低于 `agent_action`。
- 错误码字典已新增为 `references/error-codes.json`；`SKILL.md` 应引用该文件，而不是在主文档中复制完整错误码表。
- 更新检查结果进入 `notices`，例如 `update_available` / `update_check_failed` / `update_check_unknown`；notice 不是主调用错误。
- `USAGE` 中保留了覆盖主要数据域的典型示例，可作为命令形态参考，但参数有效性仍以工具表和 references 为准。

## SKILL.md 应修改什么

建议按以下清单同步 `skills/wind-mcp-skill/SKILL.md`：

1. 删除“CLI 错误在 stderr 中读取 `处理建议:`”这类旧描述。
2. 将“出错怎么办”改为读取 stdout JSON：
   - `ok:true`：读取 `data.result`；业务 JSON 通常在 `data.result.content[0].text` 中。
   - `ok:false`：按 `error.code`、`error.retryable`、`error.fallback_allowed`、`error.agent_action` 决策；`error.hint` 仅作补充解释。
   - `notices`：只作为附加提醒，不改变主调用成功/失败判断。
3. 明确字段优先级：
   - `ok`
   - `error.code`
   - `error.retryable` / `error.fallback_allowed`
   - `error.agent_action`
   - `error.hint`
   - `error.context`
   - `notices`
4. 增加引用：错误码定义见 `references/error-codes.json`。
5. 明确成功返回不截断但不重复：新闻、公告、宏观等可能很长，CLI 默认只返回一份原始 `data.result`；Agent 不得假设 `content[0].text` 一定是 rows/columns 表格结构。
6. 保留 Codex 沙箱联网要求：真实调用 Wind 后端仍需要 `require_escalated`。
7. 保留 PowerShell/JSON 转义说明，但可迁出到 `references/cli-usage.md`；主文件只保留 `INVALID_PARAMS_JSON` 时去读该 reference。
8. 更新 fallback 规则：只有 `error.fallback_allowed=true` 且符合 SKILL.md 路由约束时，才可考虑 `analytics_data`；Key、权限、限流、余额、网络、5xx、未知工具等仍不得 fallback。

### 迁出到 README

以下内容面向人类用户，建议只放 README：

- 安装命令。
- API Key 获取背景。
- 升级命令。
- 目录结构。
- “这是什么”类介绍。

`SKILL.md` 不应重复 README 的完整说明。

## Frontmatter 减重

当前 description 信息密度过高，建议改为短描述：

```yaml
description: >-
  访问 Wind 金融数据。用于 A 股/港股/美股、基金、指数、债券、公告新闻、宏观指标和 Wind 通用结构化取数。需要 WIND_API_KEY；不覆盖欧股/日股、汇率、期货盘口、加密货币和非金融数据。
```

examples 建议从 15 条缩到 6-8 条，每类只保留代表样例：

```yaml
examples:
  - "贵州茅台今天最新价"
  - "苹果公司 AAPL.O 最近 30 日 K 线"
  - "沪深300 指数 PE / PB 历史分位"
  - "易方达蓝筹精选 005827.OF 的最新规模和经理"
  - "贵州茅台 2024 年年度报告内容"
  - "中国近 10 年新能源汽车产销量"
```

## 建议的新 SKILL.md 骨架

```md
---
name: wind-mcp-skill
description: >-
  访问 Wind 金融数据。用于 A 股/港股/美股、基金、指数、债券、公告新闻、宏观指标和 Wind 通用结构化取数。需要 WIND_API_KEY；不覆盖欧股/日股、汇率、期货盘口、加密货币和非金融数据。
author: Wind AIFinMarket
homepage: https://aifinmarket.wind.com.cn
auto_invoke: true
security:
  child_process: true
  eval: false
  filesystem_read: true
  filesystem_write: true
  network: true
examples:
  - "贵州茅台今天最新价"
  - "苹果公司 AAPL.O 最近 30 日 K 线"
  - "沪深300 指数 PE / PB 历史分位"
  - "贵州茅台 2024 年年度报告内容"
---

# Wind 金融数据

## 适用范围

覆盖 A 股、港股、美股、基金/ETF、指数/板块、债券、公告、新闻、宏观指标和 Wind 通用结构化取数。
不覆盖欧股、日股、汇率、期货盘口、加密货币和非金融数据。

## 调用入口

使用 `<skill_dir>/scripts/cli.mjs`：

```bash
node scripts/cli.mjs call <server_type> <tool_name> '<params_json>'
```

Codex 沙箱访问 Wind 后端时必须用 `require_escalated`。若 JSON 转义失败，读取 `references/cli-usage.md`。

## 路由顺序

1. 公告/新闻：`financial_docs`
2. 宏观指标：`economic_data`
3. 行情/K线/分钟：`stock_data` / `global_stock_data` / `fund_data` / `index_data`
4. 财务/档案/股东/事件/技术/风险/持仓等：对应专项 NL 工具
5. 其它专项无法覆盖的结构化取数：`analytics_data.get_financial_data`

`analytics_data` 只允许兜底，不得抢占明确意图。

## 参数硬约束

- `server_type + tool_name` 必须在 `references/tool-manifest.json`。
- 具体字段表见 `references/tool-catalog.md`。
- 快照 `indexes` 必须从 `references/indicators.md` 逐字段复制中文字段名。
- K 线使用 `begin_date/end_date`；分钟线使用 `begin/end`；EDB 使用 `beginDate/endDate`。
- A 股走 `stock_data`；港股/美股走 `global_stock_data`。
- 单工具单标的；多标的拆成多次调用。

## 错误处理

读取 CLI JSON 输出：

- `ok:true`：使用 `data`。
- `ok:false`：按 `error.code`、`error.retryable`、`error.fallback_allowed`、`error.agent_action` 处理；`error.hint` 只作补充解释。
- `notices` 非空：按 `type` 判断是否转告用户。

JSON、未知 server/tool、Key、权限、限流、余额、网络、后端 5xx，不得改走 `analytics_data`。
专项工具口径错误可修正后重试一次；仍失败且属于结构化取数时，才可使用 `analytics_data`。

## 合规

回答末尾必须标注：数据来源于万得 Wind 金融数据服务。
```

## 迁移步骤

### 第 1 步：先拆 reference，不改语义

新增：

- `references/tool-catalog.md`
- `references/cli-usage.md`
- `references/error-handling.md`
- `references/error-codes.json`（已新增，可直接沿用）

把当前 `SKILL.md` 对应长段落原样迁入 reference，主文件只保留引用和硬约束。

验收：

- 主文件不超过 180 行。
- 当前所有工具表和示例在 reference 中仍可找到。
- `references/tool-manifest.json` 与 `references/indicators.md` 的权威地位不变。

### 第 2 步：同步 CLI JSON envelope

CLI 输出改为 JSON envelope 后，更新 `SKILL.md` 与 `references/error-handling.md`：

- 删除“读取 stderr 的处理建议”。
- 改为读取 stdout JSON 中的 `error`、`notices`，并优先执行 `error.agent_action`。
- `wind-alice` fallback 仍保留为最终选项。

验收：

- `SKILL.md` 不再出现“按 stderr 解析”。
- `SKILL.md` 明确 `agent_action` 高于 `hint`。
- fallback 规则仍明确禁止 Key、网络、权限、限流类错误切换工具。

### 第 3 步：压缩工具说明

工具说明从“完整描述”改为“路由需要的最小差异”。

示例：

```md
`stock_data`：A 股。
`global_stock_data`：港股/美股。
`fund_data`：基金/ETF。
`index_data`：指数/板块。
`bond_data`：债券全走 NL 工具，无行情类快照。
```

详细字段继续放 `references/tool-catalog.md`。

验收：

- Agent 能从主文件完成路由决策。
- 需要构造参数时才读取 reference。

## 风险与控制

| 风险 | 控制 |
|---|---|
| 主文件过短导致 Agent 忘记关键红线 | 保留“参数硬约束”和“错误处理”两节，使用强制措辞。 |
| 工具表迁出后 Agent 不读取 reference | 在调用前参数校验处明确要求读取对应 reference。 |
| reference 与 tool-manifest 不一致 | `tool-manifest.json` 仍作为工具名权威，工具目录只做说明。 |
| CLI JSON 化与 SKILL.md 不同步 | 先落 CLI 输出协议，再同步错误处理章节。 |
| wind-alice 被过早推荐 | 主文件保留“只在所有 wind-mcp-skill 路径失败后询问用户”的硬约束。 |

## 最终验收清单

- `SKILL.md` 不超过 160 行，且没有大段工具表。
- `SKILL.md` 保留所有实际硬约束：范围、路由、参数、fallback、合规。
- 详细工具表、Shell 转义、错误码说明均可在 `references/` 中查到。
- CLI 输出协议与 `SKILL.md` 错误处理说明一致。
- 新用户看 README，Agent 看 `SKILL.md`，参数细节看 `references/`，三者职责清晰。
