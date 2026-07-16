# `financial_docs` 工具契约

只用于公告和财经新闻。公共字段规则见 `references/contracts/parameter-conventions.md`。

| tool_name | 意图 | 必填 | 可选 |
| --- | --- | --- | --- |
| `get_company_announcements` | 公告、监管披露、年报、季报、招股书 | `question` | `top_k` |
| `get_financial_news` | 新闻、快讯、媒体报道、政策消息 | `question` | `top_k` |

- 对外统一传 `question`；CLI 转成后端 `query`。
- 旧 `query` 继续兼容；若和 `question` 同时传入，值必须一致。
- 查询文本不得为空；`top_k` 控制返回数量。

```json
{"question":"贵州茅台2024年年度报告","top_k":3}
{"question":"贵州茅台最新新闻","top_k":3}
```
