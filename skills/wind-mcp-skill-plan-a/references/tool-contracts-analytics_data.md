# analytics_data 工具契约

> 何时读：选择 server_type=analytics_data 后读对应段落 | 权威于：工具字段、参数、场景、示例

调用前仍需校验 `references/tool-manifest.json`。

## 工具总表

**`tool_name` 必须逐字取自本表；不在表内的名字一律不存在，禁止自造或拼凑。**

| tool_name | 入参 |
| --- | --- |
| `get_financial_data` | `question`（+`lang`） |

## 参数签名

| 工具组 | 入参 | 适用范围 |
| --- | --- | --- |
| 通用结构化取数 | `{question, lang?}` | `analytics_data.get_financial_data` |

params JSON 的 key 必须逐字复制本文件的字段名。

## 通用取数兜底

只有专项路由无法覆盖的结构化取数任务，才使用 `analytics_data.get_financial_data`。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `question` | 是 | 简洁的自然语言取数问题 |
| `lang` | | `CNS`=中文默认，`ENS`=英文 |

规则：

1. 首次调用必须将用户原始问题去除所有空格后传入，不得改写、概括、翻译或增加用户未给出的筛选条件。
2. 只有首次调用失败、返回空数据或明显不匹配请求后，才可改写或拆分 `question`。
3. 一个 analytics 问题只聚焦一个取数动作；复杂分析先拆成简单取数步骤，再综合结果。
4. 若任务需要先发现范围，再对范围内成员二次取数，必须显式分步执行。无法得到可靠范围或后端没有可用排名口径时，停止并说明限制。

## 调用示例

```bash
node scripts/cli.mjs call analytics_data get_financial_data '{"question":"查询中国A股市场过去一年的平均成交量"}'
```
