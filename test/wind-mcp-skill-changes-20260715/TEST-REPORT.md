# wind-mcp-skill 变更验证报告

- 测试日期：2026-07-15 至 2026-07-16
- 测试环境：Windows / PowerShell / Node.js v22.22.1
- 被测对象：`skills/wind-mcp-skill`
- 后端验证：使用当前已配置的 Wind API Key 调用真实 Wind MCP 后端
- 最终结果：**33 个自动化测试全部通过**；另完成 3 个 EDB 日期字段真实后端对照用例

## 测试文件

| 文件 | 用途 | 结果 |
| --- | --- | --- |
| `real-backend.test.mjs` | 真实后端成功、NER 失败、市值口径、多标的、参数错误与熔断 | 10/10 通过 |
| `ner-observations.test.mjs` | 真实观察 `RUT`、`罗素2000`、`BDTI.HI` | 3/3 通过 |
| `static-regression.test.mjs` | 错误码、分层合约、日期/lang/question 归一化、`@file` 参数和错误信封回归 | 20/20 通过 |
| `edb-date-mapping-real-20260716/run.mjs` | EDB 统一日期字段、后端原生字段及 observation 对照 | 3 个对照用例完成 |

## 真实后端验证结果

### 1. `search_stocks` 统一路由

`stock_data.search_stocks` 对三个市场均真实调用成功：

| 市场 | 问句 | 后端结果 |
| --- | --- | --- |
| A 股 | `筛选A股中的银行股` | 成功，返回 A 股银行列表 |
| 港股 | `筛选港股中的科技股` | 成功，返回港股科技股列表 |
| 美股 | `筛选美股中的半导体股` | 成功，返回美股半导体列表 |

结论：A 股、港股和美股选股使用同一工具的合并契约与真实后端行为一致。

### 2. 股票价格指标统一工具

`stock_data.get_stock_price_indicators` 真实调用：

- `600519.SH`：成功返回贵州茅台、最新成交价和涨跌幅。
- `AAPL.O`：成功返回苹果、最新成交价和涨跌幅。

结论：不需要因 A 股/美股拆分工具说明或调用示例。

### 3. 总市值双口径

同一标的 `600026.SH`（中远海能）真实返回：

| Wind 字段 | 明确口径 | 返回值 |
| --- | --- | ---: |
| `总市值1` | 不含限售股 / 流通口径 | `8.03489e+10` |
| `总市值2` | 含限售股口径 | `8.66093e+10` |

两个字段在后端返回中保留了 `总市值1` / `总市值2` 的字段名，数值不同。

结论：删除裸词“总市值”的默认归一化、要求先明确口径是必要的。

### 4. 指数别名归一化

`DJI` 通过 `index_data.get_index_kline` 调用成功，后端返回的标准代码为 `DJI.GI`。

结论：本地 `DJI -> DJI.GI` 别名归一化有效。

### 5. NER 失败与熔断

使用确定不存在的标的 `__CODEX_NER_NOT_FOUND_20260715__` 调用真实后端，返回：

- `code = MARKET_TARGET_NOT_FOUND`
- `details.original_input` 保留原输入
- `details.normalized_input` 保留归一化后输入
- `details.attempted_inputs` 记录已尝试值
- `retry.allowed = false`
- `circuit_breaker.tripped = true`
- `circuit_breaker.action = abort_remaining_calls`
- `correction.requires_user_input = true`
- 询问用户准确全称或 Wind 标准代码

结论：NER 失败的结构化诊断和剩余批次熔断已在真实后端错误上生效。

### 6. NER 黑盒现象复现

| 输入 | 真实结果 |
| --- | --- |
| `RUT` | `MARKET_TARGET_NOT_FOUND`，熔断并要求用户确认 |
| `罗素2000` | 成功，后端解析为 `RTY.GI` |
| `BDTI.HI` | `MARKET_TARGET_NOT_FOUND`，熔断并要求用户确认 |

首轮“罗素2000”观察曾出现一次 30 秒后端超时，错误体正确返回 `NETWORK_ERROR` 及“允许原样重试一次”；按该策略复测后成功。

结论：报告中所述 `RUT` 失败、中文名成功的 NER 差异仍真实存在；本次修改不伪造候选代码，而是在失败时确定性熔断并询问用户。

### 7. 多标的 `windcode` 的重要边界

真实调用：

```json
{
  "windcode": "600519.SH,000001.SZ",
  "indexes": "中文简称,最新成交价"
}
```

CLI 本地不再拒绝该请求，后端返回成功；但结果只包含第一个标的 `600519.SH`，没有 `000001.SZ`。

结论：

- 移除“全局单标的校验”已生效。
- **不能由此推断每个工具都支持多标的。**
- `get_stock_price_indicators` 的逗号多代码形式在本次实测中发生静默截断，只返回第一个标的。
- 调用方必须根据具体工具真实合约判断多标的能力，不应使用全局假设。

### 8. 参数错误短路与熔断

以错误日期和错误枚举调用 EDB 工具，CLI 在后端调用前返回：

- 对外日期错误返回 `expected_format = yyyy-MM-dd`，后端紧凑格式不再暴露为调用要求
- `executionMode.allowed_values` 完整内联
- `circuit_breaker.tripped = true`
- `correction.change_only` 仅包含错误字段
- `retry.mode = after_correction`

将 `params` 重复序列化为字符串时，只返回一个根因：

```text
params: expected object, actual string
```

未再误报“缺少 question”。

## 静态回归覆盖

已确认：

1. `DAILY_LIMIT_ERROR`、`BALANCE_ERROR`、`RATE_LIMIT_ERROR` 三类错误独立，运行时不再产生 `QUOTA_ERROR`。
2. `search_stocks` 只有一份统一股票筛选契约。
3. 股票指标示例不再按 A 股/美股拆分。
4. `single_target_keys` 及全局单标的调用建议已删除。
5. Skill 和 README 不再将外汇/汇率声明为不支持。
6. 裸词“总市值”不再默认归一化为 `总市值2`。
7. 错误信封 schema 为 7，包含 `details/retry/circuit_breaker/correction/agent_action`。
8. 错误动作不再要求读取 `references/*` 或 `SKILL.md`。
9. 日期字段统一为公开 snake_case，日期值严格使用 ISO 8601 `yyyy-MM-dd`；CLI 在调用边界按 K 线、Quote、EDB 后端契约转换字段和值，EDB 映射为 `beginDate/endDate`。
10. `lang` 仅接受统一外部词表，analytics 调用时转换为后端编码。
11. financial docs 的 `question/query` 可归一化，二者冲突时在调用前拒绝并返回修正信息。
12. 合约按 `server_type` 拆分，并由 `contracts/tool-index.json` 建立渐进式索引。
13. `LAST` 仅允许用于 Quote 工具；成功响应中的 `INVALID` 和不可信声明计数得到规范处理。
14. CLI 支持 `@file` 读取 UTF-8 JSON 参数，兼容 BOM、中文和含空格路径；文件不可读时返回结构化 `PARAMS_FILE_ERROR`。

## EDB 日期映射真实后端对照

2026-07-16 对 `natural_language_get_edb_data` 串行执行 3 个真实后端用例：

| 用例 | 结果 | 判定 |
| --- | --- | --- |
| `begin_date/end_date`（混合日期格式） | `NETWORK_ERROR: fetch failed` | CLI 已接受参数；该轮后端请求受网络波动影响 |
| `beginDate/endDate`（后端原生格式） | 成功 | 后端日期范围能力可用 |
| `observation=10` 对照 | 成功 | 后端服务与 observation 路径可用 |

原始响应及独立报告位于 `test/edb-date-mapping-real-20260716/`。统一字段到 `beginDate/endDate` 的转换由静态 CLI 回归确定性覆盖；本轮真实后端首例因网络错误未形成有效业务对照，记录为非阻塞环境波动。

## 执行命令

```powershell
node --test --test-concurrency=1 test/wind-mcp-skill-changes-20260715/static-regression.test.mjs
node --test --test-concurrency=1 test/wind-mcp-skill-changes-20260715/real-backend.test.mjs
node --test --test-concurrency=1 test/wind-mcp-skill-changes-20260715/ner-observations.test.mjs
node test/edb-date-mapping-real-20260716/run.mjs
npm test
```

## 总结

本次修改的分层文档契约、日期/lang/question 归一化规则、错误信封、参数短路校验、NER 诊断和批量熔断均通过回归。A/港/美选股、A/美股价格指标、双市值口径、指数别名及 EDB 日期映射均已使用真实 Wind 后端验证。

唯一需要特别注意的非阻塞项是：移除全局单标的限制不等于所有工具都支持多标的；本次 `get_stock_price_indicators` 实测对逗号多代码只返回第一个标的，该行为已在测试中保留为边界证据。
