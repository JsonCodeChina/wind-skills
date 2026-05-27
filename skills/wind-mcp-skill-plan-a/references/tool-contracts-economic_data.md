# economic_data 工具契约

> 何时读：选择 server_type=economic_data 后读对应段落 | 权威于：工具字段、参数、场景、示例

调用前仍需校验 `references/tool-manifest.json`。

## 工具总表

**`tool_name` 必须逐字取自本表；不在表内的名字一律不存在，禁止自造或拼凑。**

| tool_name | 入参 |
| --- | --- |
| `get_economic_data` | `metricIdsStr`（+`beginDate` / `endDate` / `freq`…） |

## 参数签名

| 工具组 | 入参 | 适用范围 |
| --- | --- | --- |
| 宏观 EDB | `{metricIdsStr, ...}` | `economic_data.get_economic_data` |

params JSON 的 key 必须逐字复制本文件的字段名。

## 宏观工具

宏观和行业 EDB 指标使用 `economic_data.get_economic_data`。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `metricIdsStr` | 是 | 自然语言指标查询，不是指标 ID |
| `beginDate` / `endDate` | | `yyyyMMdd` |
| `freq` | | `日`=`1`, `工作日`=`2`, `周`=`3`, `月`=`4`, `季`=`5`, `半年`=`6`, `年`=`7`, `年度`=`8` |
| `magnitude` | | `个`, `千`, `万`, `百万`, `千万`, `亿`, `十亿`, `百亿`, `千亿`, `万亿` |
| `currency` | | `USD`, `CNY`, `EUR`, `JPY`, `AUD`, `GBP`, `CHF`, `CAD`, `SGD`, `HKD`, `MYR`, `BYR` |
| `searchType` | | `深度`=`0`, `精确`=`1` |
| `ifUnion` | | `开启`=`1`, `不开启`=`2` |

## 调用示例

```bash
node scripts/cli.mjs call economic_data get_economic_data '{"metricIdsStr":"中国CPI同比","freq":"月","beginDate":"20240101","endDate":"20261231"}'
```
