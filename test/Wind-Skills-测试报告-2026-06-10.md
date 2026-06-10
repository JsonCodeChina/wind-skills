# Wind Skills 测试报告

**测试日期**：2026-06-10  
**测试范围**：人设 Skills、`wind-find-finance-skill`、`wind-mcp-skill`、`wind-alice`  
**总体状态**：DONE

## 测试概览

| 模块 | 修改状态 | 测试状态 | 结论 |
| --- | --- | --- | --- |
| 人设 Skills 修改与测试 | DONE | DONE | 人设框架可被发现、安装并参与金融分析 |
| `wind-find-finance-skill` 添加索引 | DONE | DONE | Avatar 索引及人物匹配路由生效 |
| `wind-mcp-skill` API Key 加载顺序修改 | DONE | DONE | 全局、Skill 本地、环境变量按新顺序加载 |
| `wind-alice` API Key 加载顺序修改 | DONE | DONE | 与 MCP 保持一致，项目和全局配置均可用 |
| Skill 描述修改 | DONE | DONE | 触发范围、能力边界和使用场景描述正常 |

---

## 1. 人设 Skills 与 Find Finance

### 1.1 人设 Skills 修改

**状态：DONE**

本次验证人设 Skill：

- `avatar-charlie-munger-thinking`
- 支持逆向思考、激励分析、认知偏误叠加和多学科模型。
- 明确要求使用公开思想形成分析框架，不冒充人物本人、不编造引语。
- 涉及现实市场时，要求先核验时效性金融数据，再输出条件式判断和行动护栏。

### 1.2 人设 Skill 测试

**状态：DONE**

测试问题：

> 查理芒格会对今天的市场怎么看

测试流程：

1. `wind-find-finance-skill` 识别用户明确点名“查理·芒格”。
2. 路由到必需工作流 Skill：`avatar-charlie-munger-thinking`。
3. 检测到 Skill 未安装后，先询问安装范围。
4. 用户确认后安装到当前项目。
5. 调用 Wind 数据核验沪深300、中证1000、创业板指等市场行情。
6. 使用芒格框架区分事实、推断、失败路径和行动护栏。

测试结果：

- 人物名称匹配成功。
- 缺失 Skill 检测成功。
- 项目级安装成功。
- 金融数据与人设分析组合成功。
- 输出未冒充查理·芒格本人。

### 1.3 Find Finance 添加索引

**状态：DONE**

`references/skills-catalog.md` 已增加 Avatar 思维框架索引，包含：

| Skill | 适用方向 | 人物匹配 |
| --- | --- | --- |
| `avatar-charlie-munger-thinking` | 决策、认知偏误 | 查理·芒格 / Charlie Munger |
| `avatar-nassim-taleb-risk` | 风险、不确定性 | 纳西姆·塔勒布 / Nassim Taleb |
| `avatar-naval-ravikant-thinking` | 职业、创业、人生决策 | 纳瓦尔 / Naval Ravikant |
| `avatar-warren-buffett-investing` | 长期投资、个股研究 | 沃伦·巴菲特 / Warren Buffett |

索引规则验证：

- 用户明确点名人物时，对应 Avatar Skill 被识别为必需工作流 Skill。
- 未点名人物的一般分析任务，可将 Avatar Skill 作为可选补充能力。
- 发现器不使用通用分析绕过缺失的必需工作流 Skill。

---

## 2. MCP、Alice 与 Skill 描述

### 2.1 MCP Skill CLI 加载 API Key 顺序修改

**状态：DONE**

`wind-mcp-skill/scripts/cli.mjs` 当前加载顺序：

1. 用户全局配置：`%USERPROFILE%\.wind-aifinmarket\config`
2. Skill 本地配置：`wind-mcp-skill/config.json`
3. 环境变量：`WIND_API_KEY`

测试结果：

- Skill 项目级 Key 配置成功。
- 用户全局 Key 配置成功。
- 全局配置格式校验成功。
- 全局 Key 与项目 Key 一致性校验成功。
- 未在测试报告或日志中暴露真实 Key。

MCP 实际行情测试：

| 测试内容 | 返回结果 | 状态 |
| --- | --- | --- |
| 新易盛最新价 | 783.83 元，-0.24%，数据时间 11:30 | DONE |
| 贵州茅台盘中成交量 | 3,527,396 股，数据时间 14:28:25 | DONE |
| 沪深300行情快照 | 最新点位、涨跌幅、成交额及涨跌家数正常返回 | DONE |
| 中证1000行情快照 | 最新点位、涨跌幅、成交额及涨跌家数正常返回 | DONE |
| 创业板指行情快照 | 最新点位、涨跌幅、成交额及涨跌家数正常返回 | DONE |

异常处理验证：

- API Key 缺失时返回 `AUTH_ERROR`，并给出明确配置动作。
- PowerShell 参数转义错误时返回 `INVALID_PARAMS_JSON`。
- 修正命令传递后，同一工具和业务参数可正常重试。

### 2.2 Alice 加载 API Key 顺序修改

**状态：DONE**

`wind-alice/scripts/request.js` 当前加载顺序：

1. 用户全局配置：`%USERPROFILE%\.wind-aifinmarket\config`
2. Skill 本地配置：`wind-alice/config.json`
3. 环境变量：`WIND_API_KEY`

测试结果：

- Alice 项目级配置读取成功。
- Alice 全局配置读取成功。
- Alice 与 MCP 共用同一 Wind API Key。
- SSE 流式请求正常返回 `agentResult.value`。
- 调用过程可完整等待至任务结束。

Alice 实际测试：

| 测试内容 | 返回结果 | 状态 |
| --- | --- | --- |
| 新易盛最新价 | 783.83 元，-0.24%，数据时间 11:30 | DONE |
| 贵州茅台最终成交量 | 3,924,414 股，数据时间 15:00:01 | DONE |
| 芒格框架分析当日A股 | 完成市场事实核验及结构性防御分析 | DONE |

### 2.3 Skill 描述修改

**状态：DONE**

描述验证范围：

- `wind-mcp-skill`：覆盖A股、港股、美股、基金、指数、债券、公告、新闻和宏观数据，并明确不支持范围。
- `wind-alice`：明确用于 Alice Agent、A2A、SSE 流式和指定专业子 Skill 场景。
- `wind-find-finance-skill`：明确作为金融能力发现与安装路由，不直接取数或替代业务分析。
- `avatar-charlie-munger-thinking`：明确用于思维框架分析，不模仿名人语气或编造观点。

触发测试结果：

- 普通行情查询正确进入 `wind-mcp-skill`。
- 明确要求“用 Alice”时正确进入 `wind-alice`。
- 点名人物分析时正确进入 Avatar Skill 发现与安装流程。
- 金融能力缺失时正确询问安装范围，没有默认安装到全局。

---

## 最终结论

本次两大模块修改和测试均已完成：

1. 人设 Skills 修改、测试及 `wind-find-finance-skill` Avatar 索引添加：**DONE**
2. MCP CLI API Key 加载顺序、Alice 加载顺序、Skill 描述修改及相关测试：**DONE**

当前项目已具备项目级与全局 Wind API Key 配置，MCP 行情查询、Alice 流式查询、人设 Skill 路由及组合分析均验证通过。
