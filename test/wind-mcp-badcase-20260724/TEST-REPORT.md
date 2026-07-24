# Wind MCP Bad Case 回归测试报告

## 1. 测试概览

| 项目 | 结果 |
| --- | ---: |
| 测试日期 | 2026-07-24 |
| 原始附件 | `pasted-text.txt` |
| 去重后本地契约用例 | 24 |
| 本地结果符合预期 | 24 |
| 本地结果不符合预期 | 0 |
| 真实冒烟计划 | 8 |
| 真实冒烟执行 | 7 |
| 真实调用成功 | 6 |
| 真实调用失败 | 1 |
| 熔断后未执行 | 1 |

**总体结论：部分通过。** 当前 Skill 已能拦截附件中多数错误路由、错误日期格式、非法周期、错误参数类型和错误自然语言字段；修正后的六类代表调用真实成功。金融文档空格查询缺陷已修复，仍有四类本地校验缺口，以及一个裸美股指数 ticker 的真实 NER 失败。

## 2. Bad Case 分类

附件中的重复调用去重后，主要分为以下类型：

1. 行业板块排名直接进入 `analytics_data`；
2. 日期字段混用 `begin_date/end_date`、`begin/end`、`beginDate/endDate`；
3. 日期值混用 `yyyy-MM-dd` 和 `yyyyMMdd`；
4. 指数工具错误挂到 `stock_data`；
5. 指数代码传给股票 K 线工具；
6. 使用不存在的 `get_stock_performance`；
7. `period` 传入 `W` 等非契约值；
8. `indexes` 使用数组或后端英文名；
9. `search_stocks` 使用 `query/market/fields/exchange` 等错误参数；
10. EDB 使用 `retrieve`、`beginDate/endDate` 等后端参数；
11. 金融新闻使用 `query` 且关键词包含空格；
12. `params` 被二次 JSON 编码成字符串；
13. `总市值`口径含糊；
14. `DJI/SPX/IXIC/RUT/HKHSI` 等裸 ticker 或别名导致 NER 风险。

## 3. 本地契约测试结果

### 3.1 汇总

| 实际分类 | 数量 | 含义 |
| --- | ---: | --- |
| `accepted` | 10 | 当前 CLI 接受，符合兼容或规范预期 |
| `validation_error` | 8 | 当前 CLI 在调用后端前成功拦截 |
| `route_error` | 2 | `server_type + tool_name` 不存在 |
| `accepted_gap` | 4 | CLI 接受，但存在语义或词典校验缺口 |
| **合计** | **24** |  |

24 条用例的实际结果均与预期一致。

### 3.2 已成功拦截的问题

| 用例 | Bad Case | 当前结果 |
| --- | --- | --- |
| BC003 | K 线日期使用 `20260707` | `validation_error`，要求 `yyyy-MM-dd` |
| BC005 | `indexes` 使用数组 | `validation_error`，要求字符串 |
| BC007 | `search_stocks` 使用 `trade_date/exchange/return_fields` | `validation_error`，缺少 `question` |
| BC008 | `search_stocks` 使用 `query/market` | `validation_error`，缺少 `question` |
| BC009 | 不存在的 `get_stock_performance` | `route_error` |
| BC010 | `stock_data.get_index_kline` | `route_error` |
| BC011 | `period="W"` | `validation_error`，应使用 `1w` |
| BC012 | EDB 使用 `executionMode="retrieve"` | `validation_error` |
| BC015 | `params` 被二次编码为字符串 | `validation_error` |
| BC016 | `search_stocks` 使用 `query/top_k` | `validation_error` |

### 3.3 兼容但不建议继续生成的参数

- Quote 的 `begin/end` 仍能通过本地校验，但新调用应统一生成 `begin_date/end_date`。
- 金融文档的后端字段 `query` 仍保留兼容能力，但新调用应统一使用 `question`。
- `lang="中文"`、`lang="CNS"` 等旧值仍可被归一化；新调用应使用 `zh-CN/en-US`。

## 4. 已修复缺陷

### BC013：金融新闻关键词包含空格时被错误拒绝

输入：

```json
{
  "server_type": "financial_docs",
  "tool_name": "get_financial_news",
  "params": {
    "query": "VLCC油轮 运价 航运 2026",
    "top_k": 10
  }
}
```

实际错误：

```text
字段 'query' 不得含空格或其它空白字符
```

原问题原因：`call-rules.json` 将 `query` 放入全局 `no_whitespace_keys`。金融新闻检索词包含空格是正常业务输入，不应作为非法格式拒绝。

影响：

- 附件中的 `VLCC油轮 运价 航运 2026`；
- `EEXI CII 环保新规 油轮 运力退出 2026`；
- `油轮制裁 地缘政治 伊朗 俄罗斯 原油运输`；
- 其它使用空格分词的公告和新闻查询。

处理结果：已移除对金融文档 `query` 的全局无空格限制，仅保留“非空字符串”校验，并增加包含空格和全空白输入的回归断言。修复后 BC013 通过，完整 Bad Case 契约测试为 24/24。

## 5. 当前仍未覆盖的校验缺口

### 5.1 `indexes` 词典未做运行时校验

BC006 使用：

```json
{"indexes":"close,pct_chg,ma5,ma20,volume"}
```

CLI 只检查其为字符串，不核对字段是否来自当前领域契约，因此错误的后端英文名仍会进入真实调用。

建议：由契约生成各领域允许的 `indexes` 集合，在 CLI 中逐项验证。

### 5.2 `总市值`口径含糊未被 CLI 拦截

BC017 中的 `总市值`既没有明确为 `总市值1`，也没有明确为 `总市值2`。Skill 文档要求先确认口径，但 CLI 无法强制执行。

建议：将无后缀 `总市值`加入歧义字段黑名单，返回可修正的 `PARAM_VALIDATION_ERROR`。

### 5.3 标的领域错配未被本地识别

以下输入在本地都会通过：

- `stock_data.get_stock_kline(windcode="000001.SH")`；
- `stock_data.get_stock_kline(windcode="HKHSI")`。

CLI 只检查代码格式，无法判断代码实际属于股票还是指数。

建议：优先依赖正确路由；如需本地强校验，应引入轻量代码类型解析或明确的常见指数别名表。

### 5.4 Analytics 兜底顺序无法由参数校验判断

“行业板块涨跌幅排名”进入 Analytics 在专项工具无法直接表达全市场排名时可以成立，但本地参数校验无法证明调用前是否先审查过指数专项路径。

建议：将该类用例纳入路由评测，而不是仅依赖 CLI 参数测试。

## 6. 真实链路冒烟结果

### 6.1 成功用例

| 用例 | 工具 | 场景 | 耗时 |
| --- | --- | --- | ---: |
| RS001 | `index_data.get_index_kline` | 上证指数规范日期和语义周期 | 1.153 秒 |
| RS004 | `stock_data.get_stock_price_indicators` | 明确 `总市值2` 口径 | 0.758 秒 |
| RS005 | `stock_data.search_stocks` | `question + zh-CN` 搜索 VLCC 概念股 | 4.160 秒 |
| RS006 | `financial_docs.get_financial_news` | 无空格的规范 `question` | 2.936 秒 |
| RS007 | `economic_data.natural_language_get_edb_data` | `searchFetch + begin_date/end_date` | 3.996 秒 |
| RS008 | `analytics_data.get_financial_data` | A 股行业板块排名 | 1.418 秒 |

以上结果证明修正后的日期、周期、市值口径、自然语言字段、语言参数和 EDB 参数可以完成真实调用。

### 6.2 失败用例

RS002：

```json
{
  "tool": "index_data.get_index_kline",
  "windcode": "DJI",
  "begin_date": "2026-07-08",
  "end_date": "2026-07-08",
  "period": "1d"
}
```

结果：

```text
MARKET_TARGET_NOT_FOUND
```

说明：裸 ticker `DJI` 虽通过本地格式校验，但后端 NER 未识别。错误信封正确触发剩余批次熔断，因此 RS003 未继续执行。

建议：

- 契约示例使用后端可稳定识别的 Wind 标准指数代码；
- NER 失败后要求用户提供标准代码，不应循环尝试 `SPX/IXIC/RUT`；
- 建立常用全球指数名称与经真实验证的标准代码测试集，但不要在未验证时由 CLI 猜后缀。

### 6.3 未执行用例

RS003（BDTI 周 K 线）因 RS002 的 NER 熔断未执行。其公共参数已通过本地校验，`period="1w"` 会映射为后端数字周期，但本轮没有形成真实后端成功证据。

## 7. 修复优先级

### P0

1. 已完成：移除金融文档 `query` 的无空格限制。
2. 已完成：增加金融文档多关键词空格查询和全空白输入回归测试。

### P1

3. 对 `indexes` 实施当前领域词典校验。
4. 对含糊的 `总市值`返回明确的口径错误。
5. 补充常用全球指数标准代码和 NER 回归用例。

### P2

6. 建立标的领域错配检测，至少覆盖常见指数代码误入股票工具。
7. 为 Analytics 兜底增加独立的路由评测集。

## 8. 测试产物

- `badcases.json`：24 条去重本地契约用例；
- `run-local-contract-tests.mjs`：本地测试执行器；
- `local-contract-results.json`：本地详细结果；
- `real-smoke-cases.json`：8 条修正后真实冒烟用例；
- `real-smoke-results.json`：真实调用详细结果；
- `real-smoke.log`：真实调用摘要日志。

## 9. 最终结论

当前 Skill 对附件中大多数结构性 Bad Case 已具备防护能力：

- 错误路由能够被拦截；
- 日期和周期公共格式能够被强制；
- 错误参数类型和二次编码能够被识别；
- 修正后的六类代表调用已真实成功；
- NER 失败能够返回正确错误码并触发熔断。

本轮金融新闻空格查询缺陷已经修复；仍不能判定为完全通过，因为 `indexes` 词典、市值口径和标的领域主要依赖 Skill 文档约束，尚未全部下沉到 CLI 运行时校验，同时裸 ticker `DJI` 的真实 NER 调用仍失败。
