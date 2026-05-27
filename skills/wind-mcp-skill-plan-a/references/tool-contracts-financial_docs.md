# financial_docs 工具契约

> 何时读：选择 server_type=financial_docs 后读对应段落 | 权威于：工具字段、参数、场景、示例

调用前仍需校验 `references/tool-manifest.json`。

## 工具总表

**`tool_name` 必须逐字取自本表；不在表内的名字一律不存在，禁止自造或拼凑。**

| tool_name | 入参 |
| --- | --- |
| `get_company_announcements` / `get_financial_news` | `query`（+`top_k`） |

## 参数签名

| 工具组 | 入参 | 适用范围 |
| --- | --- | --- |
| 文档 RAG | `{query, top_k?}` | financial_docs 工具 |

params JSON 的 key 必须逐字复制本文件的字段名。

## 文档工具

用户询问文档内容或新闻时，优先使用 `financial_docs`。

| 工具 | 适用场景 |
| --- | --- |
| `get_company_announcements` | 官方公告、监管披露、年报、半年报、季报、招股书 |
| `get_financial_news` | 第三方财经新闻、市场报道、政策和政经动态 |

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `query` | 是 | 调用时不含空白字符的自然语言查询 |
| `top_k` | | 返回文档数量 |

## 调用示例

```bash
node scripts/cli.mjs call financial_docs get_financial_news '{"query":"美联储利率政策","top_k":5}'
node scripts/cli.mjs call financial_docs get_company_announcements '{"query":"贵州茅台2024年年报","top_k":3}'
```
