# bond_data 工具契约

> 何时读：选择 server_type=bond_data 后读对应段落 | 权威于：工具字段、参数、场景、示例

调用前仍需校验 `references/tool-manifest.json`。

## 工具总表

**`tool_name` 必须逐字取自本表；不在表内的名字一律不存在，禁止自造或拼凑。**

| tool_name | 入参 |
| --- | --- |
| `get_bond_basicinfo` / `get_bond_issuer_info` / `get_bond_market_data` / `get_bond_financial_data` | `question`（+`lang`）；无行情快照工具 |

## 参数签名

| 工具组 | 入参 | 适用范围 |
| --- | --- | --- |
| 专项 NL | `{question, lang?}` | bond_data NL 工具 |

params JSON 的 key 必须逐字复制本文件的字段名。

`bond_data` 没有行情快照工具。债券行情和估值请求走 NL 工具。

## 领域 NL 工具

公共参数：

- `question: string` 写成标的加业务问题。
- `lang?: "English" | "中文"` 默认 `"中文"`。
- 调用前移除自然语言字段值中的空白字符。

| 工具 | 适用场景 | `question` 示例 |
| --- | --- | --- |
| `get_bond_basicinfo` | 债券档案、发行、规模、价格、票面利率、期限、兑付 | `"国债2601基本信息"` |
| `get_bond_issuer_info` | 发债主体名称、注册地、行业、股权结构、企业背景 | `"国债2601发债主体"` |
| `get_bond_market_data` | 报价、估价、溢价、久期、凸性、利差 | `"国债2601久期和凸性"` |
| `get_bond_financial_data` | 发债主体营收、利润、资产、负债 | `"国债2601主体2024年营收"` |

## 调用示例

```bash
node scripts/cli.mjs call bond_data get_bond_basicinfo '{"question":"国债2601基本信息"}'
node scripts/cli.mjs call bond_data get_bond_market_data '{"question":"国债2601久期和凸性"}'
```
