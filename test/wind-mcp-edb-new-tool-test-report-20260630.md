# wind-mcp-skill EDB 新工具更新与测试报告

> 生成日期: 2026-06-30  
> 测试对象: `skills/wind-mcp-skill` 的 `economic_data.natural_language_get_edb_data`  
> 测试环境: Windows PowerShell + `rtk`, Node `v22.22.1`  
> 测试结论: 通过，发现并修复 2 个本地处理问题

## 1. 测试范围

本次测试围绕 Wind EDB 宏观经济数据新工具:

- 新工具名: `natural_language_get_edb_data`
- server_type: `economic_data`
- 支持模式:
  - `search`: 仅搜索指标
  - `fetch`: 按 EDB 指标代码提数
  - `searchFetch`: 搜索并提数
- 核心入参:
  - `executionMode`
  - `question`
  - `beginDate`
  - `endDate`
  - `observation`

## 2. 修改摘要

### 2.1 工具清单更新

`skills/wind-mcp-skill/references/tool-manifest.json`

- 将 `economic_data` 下的工具从旧 `get_economic_data` 更新为 `natural_language_get_edb_data`。

### 2.2 CLI 调用兼容

`skills/wind-mcp-skill/scripts/cli.mjs`

- 新增对 `natural_language_get_edb_data` 的调用示例。
- 保留旧工具名 `get_economic_data` 的兼容映射:
  - `get_economic_data` -> `economic_data.natural_language_get_edb_data`
  - 旧参数 `metricIdsStr` -> 新参数 `question`
  - 自动补齐默认 `executionMode`
- 支持中文执行模式归一化:
  - `仅搜索` -> `search`
  - `仅提数` -> `fetch`
  - `搜索并提数` -> `searchFetch`

### 2.3 参数校验规则外置

新增 `skills/wind-mcp-skill/references/tool-validation-rules.json`。

CLI 不再把 EDB 和 K 线等工具的专属校验硬编码在 `validateToolParams` 中，而是读取规则文件并解释执行。

当前支持的规则类型:

- `required`
- `allowed`
- `enum_fields`
- `paired`
- `mutually_exclusive`
- `ordered_dates`
- `patterns`
- `required_one_of_when`

### 2.4 文档同步

已同步更新:

- `skills/wind-mcp-skill/SKILL.md`
- `skills/wind-mcp-skill/references/tool-contracts.md`
- `skills/wind-mcp-skill/references/error-codes.json`
- `skills/wind-mcp-skill/references/indicators.md`
- `skills/wind-mcp-skill/references/normalization-rules.json`

## 3. 本地静态检查

| 检查项 | 命令 | 结果 |
| --- | --- | --- |
| CLI 语法检查 | `node --check skills/wind-mcp-skill/scripts/cli.mjs` | 通过 |
| manifest JSON 解析 | `ConvertFrom-Json tool-manifest.json` | 通过 |
| validation rules JSON 解析 | `ConvertFrom-Json tool-validation-rules.json` | 通过 |
| normalization rules JSON 解析 | `ConvertFrom-Json normalization-rules.json` | 通过 |
| error codes JSON 解析 | `ConvertFrom-Json error-codes.json` | 通过 |

## 4. 参数校验测试

### 4.1 fetch 缺少时间范围

输入:

```json
{
  "executionMode": "fetch",
  "question": "G0000069"
}
```

结果:

```json
{
  "code": "PARAM_VALIDATION_ERROR",
  "message": "executionMode 为 fetch/searchFetch 时，必须显式提供 beginDate/endDate 或 observation"
}
```

结论: 通过。

### 4.2 beginDate / endDate 成对校验

旧工具名兼容调用:

```json
{
  "metricIdsStr": "中国GDP",
  "beginDate": "20240101"
}
```

结果:

```json
{
  "code": "PARAM_VALIDATION_ERROR",
  "message": "字段 'beginDate' 和 'endDate' 应成对填写"
}
```

结论: 通过。

### 4.3 beginDate + endDate 被误判互斥的问题

最初规则中将:

```json
["observation", "beginDate", "endDate"]
```

作为一组互斥字段，导致合法的 `beginDate + endDate` 被误判。

已修复为:

```json
["observation", "beginDate"]
["observation", "endDate"]
```

复测“中国2025年各月出口金额”后，日期区间提数正常。

结论: 已修复。

## 5. 业务错误处理测试

### 5.1 EDB 搜索无结果

输入:

```json
{
  "executionMode": "searchFetch",
  "question": "欧元区制造业PMI 月度",
  "beginDate": "20250630",
  "endDate": "20260630"
}
```

后端业务返回:

```json
{
  "code": 1003,
  "message": "没有搜索到指标，欧元区制造业PMI 月度"
}
```

优化前: CLI 以 exit code 0 透传，调用方容易继续盲目扩写搜索。

优化后:

```json
{
  "ok": false,
  "error": {
    "code": "EDB_INDICATOR_NOT_FOUND",
    "agent_action": "保持 economic_data.natural_language_get_edb_data，只将 question 改成更短、更标准、更明确的单个指标名；改写后最多重试一次。若改写后仍未找到，停止自动尝试并提示用户提供更明确的指标名称、来源或口径。"
  }
}
```

结论: 已修复。

## 6. 实际查询测试用例

### 6.1 中国最新 CPI 同比增速

调用:

```json
{
  "executionMode": "searchFetch",
  "question": "中国CPI同比增速",
  "observation": "1"
}
```

结果:

| 指标 | 来源 | 频率 | 日期 | 值 | 单位 |
| --- | --- | --- | --- | ---: | --- |
| 中国:CPI:当月同比 | 国家统计局 | 月 | 20260531 | 1.2 | % |

结论: 通过。

### 6.2 中国最新社会融资规模存量

调用:

```json
{
  "executionMode": "searchFetch",
  "question": "中国社会融资规模存量",
  "observation": "1"
}
```

结果:

| 指标 | 来源 | 频率 | 日期 | 值 | 单位 |
| --- | --- | --- | --- | ---: | --- |
| 中国:社会融资规模存量 | 中国人民银行 | 月 | 20260531 | 458.81 | 万亿元 |

结论: 通过。

### 6.3 中国 2025 年各月出口金额

调用:

```json
{
  "executionMode": "searchFetch",
  "question": "中国出口金额 月度",
  "beginDate": "20250101",
  "endDate": "20251231"
}
```

结果:

| 指标 | 来源 | 频率 | 单位 |
| --- | --- | --- | --- |
| 中国:出口金额:当月值 | 海关总署 | 月 | 亿美元 |

| 月份 | 出口金额 |
| --- | ---: |
| 2025-01 | 3242.77 |
| 2025-02 | 2147.77 |
| 2025-03 | 3130.88 |
| 2025-04 | 3151.22 |
| 2025-05 | 3156.36 |
| 2025-06 | 3246.86 |
| 2025-07 | 3212.28 |
| 2025-08 | 3212.98 |
| 2025-09 | 3281.73 |
| 2025-10 | 3049.24 |
| 2025-11 | 3300.00 |
| 2025-12 | 3573.19 |

结论: 通过。

### 6.4 中国近三年 M2 同比增速

调用:

```json
{
  "executionMode": "searchFetch",
  "question": "中国M2同比增速 月度",
  "beginDate": "20230630",
  "endDate": "20260630"
}
```

结果:

| 指标 | 来源 | 频率 | 单位 | 最新日期 | 最新值 |
| --- | --- | --- | --- | --- | ---: |
| 中国:M2:同比 | 中国人民银行 | 月 | % | 20260531 | 8.6 |

说明: 首次调用遇到 `TEMPORARILY_UNAVAILABLE`，按策略原参数重试一次后成功。

结论: 通过。

### 6.5 中国近一年社会消费品零售总额同比增速

调用:

```json
{
  "executionMode": "searchFetch",
  "question": "中国社会消费品零售总额 当月同比 名义 月度",
  "beginDate": "20250630",
  "endDate": "20260630"
}
```

结果:

| 指标 | 来源 | 频率 | 单位 | 最新日期 | 最新值 |
| --- | --- | --- | --- | --- | ---: |
| 中国:社会消费品零售总额:当月同比(1-2月合并) | 国家统计局 | 月 | % | 20260531 | -0.6 |

说明: 首次自然语言 `中国社会消费品零售总额同比增速 月度` 匹配到“实际累计同比”，区间内无数据；改写为更明确的“当月同比 名义 月度”后成功。

结论: 通过。

### 6.6 美国近三年 CPI 同比增速

调用:

```json
{
  "executionMode": "searchFetch",
  "question": "美国CPI同比增速 月度",
  "beginDate": "20230630",
  "endDate": "20260630"
}
```

结果:

| 指标 | 来源 | 频率 | 单位 | 最新日期 | 最新值 |
| --- | --- | --- | --- | --- | ---: |
| 美国:CPI:同比 | 国际货币基金组织 | 月 | % | 20260531 | 4.25 |

结论: 通过。

### 6.7 美国近一年非农就业人数

调用:

```json
{
  "executionMode": "searchFetch",
  "question": "美国非农就业人数 月度",
  "beginDate": "20250630",
  "endDate": "20260630"
}
```

结果:

| 指标 | 来源 | 频率 | 单位 | 最新日期 | 最新值 |
| --- | --- | --- | --- | --- | ---: |
| 美国:非农就业人数:季调 | 美国劳工部 | 月 | 千人 | 20260531 | 159001 |

结论: 通过。

### 6.8 美国近一年失业率

调用:

```json
{
  "executionMode": "searchFetch",
  "question": "美国失业率 月度",
  "beginDate": "20250630",
  "endDate": "20260630"
}
```

结果:

| 指标 | 来源 | 频率 | 单位 | 最新日期 | 最新值 |
| --- | --- | --- | --- | --- | ---: |
| 美国:失业率:季调 | 美国劳工部 | 月 | % | 20260531 | 4.3 |

说明: 返回序列中缺少 2025-10。

结论: 通过。

### 6.9 布伦特原油现货价格近一年

调用:

```json
{
  "executionMode": "searchFetch",
  "question": "布伦特原油现货价格",
  "beginDate": "20250630",
  "endDate": "20260630"
}
```

结果:

| 指标 | 来源 | 频率 | 单位 | 最新日期 | 最新值 |
| --- | --- | --- | --- | --- | ---: |
| 全球:现货价:原油(英国布伦特Dtd) | 金联创 | 日 | 美元/桶 | 20260629 | 71.55 |

说明:

- 返回 254 条日频数据。
- 回答时按月汇总展示月均、最低、最高。
- 汇总请求中途遇到一次 `NETWORK_ERROR`，按策略原样重试一次后成功。

结论: 通过。

### 6.10 碳酸锂现货价格电池级近一年

调用:

```json
{
  "executionMode": "searchFetch",
  "question": "碳酸锂现货价格 电池级",
  "beginDate": "20250630",
  "endDate": "20260630"
}
```

结果:

| 指标 | 来源 | 频率 | 单位 | 最新日期 | 最新值 |
| --- | --- | --- | --- | --- | ---: |
| 中国:现货领先价格:碳酸锂 | Wind | 日 | 元/吨 | 20260630 | 150100 |

说明:

- 搜索 `电池级碳酸锂现货价格` 只返回该指标。
- 指标名称未显式标注“电池级”，回答中已说明口径限制。
- 返回 242 条日频数据，回答时按月汇总展示月均、最低、最高。

结论: 通过，需注意指标名称口径。

## 7. 已发现并修复的问题

| 问题 | 表现 | 修复 |
| --- | --- | --- |
| 日期区间被误判互斥 | `beginDate + endDate` 合法组合被拦截 | 将互斥规则拆为 `observation` 与 `beginDate`、`observation` 与 `endDate` 分别互斥 |
| EDB 业务无结果被当作成功 | `code:1003` 时 CLI exit 0，调用方继续盲目搜索 | 新增业务码解析，映射为 `EDB_INDICATOR_NOT_FOUND` |
| 工具专属校验硬编码在 CLI | CLI 难维护，新增工具容易改出分支 | 新增 `tool-validation-rules.json`，CLI 变为通用规则解释器 |

## 8. 未覆盖与风险

- 未对所有 EDB 指标类型做穷举测试。
- 未测试 `fetch` 模式下多个 EDB 指标代码同时提数。
- 未将所有工具的完整 JSON Schema 自动导入校验规则，目前只覆盖本次涉及的 EDB 和既有 K 线关键校验。
- EDB 自然语言搜索结果依赖后端召回质量；当指标名称不够标准时，仍可能需要用户补充来源、地区或口径。

## 9. 结论

本次 `economic_data.natural_language_get_edb_data` 更新完成并通过实测。

CLI 已支持:

- 新工具路由。
- 旧工具名兼容。
- 新参数结构校验。
- 中文执行模式归一化。
- EDB 业务无结果错误识别。
- 工具参数校验规则外置。

实际查询覆盖中国宏观、美国宏观、能源商品、工业品价格等场景，整体可用。
