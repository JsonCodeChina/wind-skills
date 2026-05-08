---
name: "iFinD-Finance-Data"
description: "同花顺金融数据查询，查询股票、基金、宏观经济、行业经济及新闻公告数据，同时支持智能选股、选基、宏观行业经济指标查询、金融公告资讯搜索等服务"
homepage: https://www.51ifind.com
version: 1.0.0
author: iFind
---

# 同花顺金融数据查询 (iFind-finance-data)
- 本技能用于查询股票、基金、宏观经济、行业经济及新闻公告数据
- 核心能力：智能选股选基，金融数据查询，公告资讯搜索，宏观行业指标搜索
- 数据范围覆盖股票、基金、宏观经济、行业经济及新闻公告数据

## 使用方法
本 skill 封装了同花顺金融数据MCP服务的调用接口，支持 Python 和 Node.js 两种调用方式：
- **Node.js方案**：使用 `call-node.js` 脚本（无需额外依赖，使用内置模块）
- **Python方案**：使用 `call.py` 脚本（需安装 `requests` 库）
- **推荐方案**：当用户未指定python，或不确定python环境时，优先使用Node.js方案
- **query**：股票基金数据查询工具的 query 参数一般支持多主体、多指标，但不宜超过 10 个

## 首次使用
- **配置密钥**：config.json 用于存储用户密钥，如不存在有效密钥，需提示用户到"iFinD终端-工具-常用工具-数据MCP"获取密钥，帮助其完成密钥写入，或手动写入

## 数据范围
- **股票数据**：股票搜索、基本信息、财务数据、行情、股东、风险指标、ESG评级、重大事件等
- **基金数据**：基金搜索、基金资料、基金行情、持仓明细、持有人结构、基金公司信息等
- **宏观经济数据**：GDP、CPI、PPI、行业经济指标、大宗商品数据等
- **新闻公告**：财经新闻、上市公司公告、热点事件等

## 使用技巧
- 1.**先搜再查**：针对宏观行业经济指标，当你无法确定用户具体想要的指标，可以先采用 search_edb 进行搜索，然后根据搜索结果指标结合上下文再发起数据查询 get_edb_data
- 2.**查询合并**：股票基金数据查询相关工具支持多主体、多指标，例如{"query":"同花顺、东方财富、大智慧、恒生电子的2025-09-30的净利润增速、ROE、ROA"}，主体数、指标数控制在 5 个以内
- 3.**板块类股票主体**：股票数据查询支持直接以行业板块类股票作为主体，直接查询某行业股票相关数据，但需注意行业范围或时间范围不宜过大，以免触发超长截断，例如{"query":"锂电池行业股票的今日涨跌幅"}

## 核心函数

### call(server_type, tool_name, params)

发起金融数据请求。

**参数：**
- `server_type` (str): 服务类型，取值范围：
  - `"stock"` - 股票服务
  - `"fund"` - 基金服务
  - `"edb"` - 宏观经济/行业经济指标服务
  - `"news"` - 新闻公告服务
- `tool_name` (str): 工具名称，详见下方工具列表
- `params` (dict): 请求参数，不同工具的参数不同

**返回值：**
```python
{
    "ok": True/False,
    "status_code": HTTP状态码,
    "data": ...,      # ok=True时返回
    "error": ...,     # ok=False时返回
    "raw": ...        # 原始响应
}
```

### list_tools(server_type)

列出指定服务类型的所有可用工具。

---

## 股票服务工具 (server_type="stock")

| 工具名称 | 功能说明 | 典型参数 |
|---------|---------|---------|
| `search_stocks` | 智能选股 | `{"query": "自然语言选股条件"}` 如 `"电子行业市值大于100亿"` |
| `get_stock_summary` | 股票信息摘要 | `{"query": "股票简称+查询内容"}` 如 `"茅台财务状况"` |
| `get_stock_info` | 股票基本资料、日频行情与技术指标 | `{"query": "股票简称+指标名称+时间"}` 如 `"格力电器上市时间"`或`"三花智控近5日涨跌幅"` |
| `get_stock_shareholders` | 股本结构与股东数据 | `{"query": "股票简称+指标"}` 如 `"光明乳业流通股占比"` |
| `get_stock_financials` | 财务数据与指标 | `{"query": "股票简称+财务指标+财报日期"}` 如 `"科大讯飞2025年三季度的ROE"` |
| `get_risk_indicators` | 风险定量指标 | `{"query": "股票+时间+指标"}` 如 `"航天电子在2026-03-19的夏普比率"` |
| `get_stock_events` | 上市公司重大事件类指标 | `{"query": "股票+事件相关指标"}` 如 `"摩尔线程IPO首发股本数量"` |
| `get_esg_data` | ESG评级数据 | `{"query": "股票+ESG评级指标"}` 如 `"诚意药业中诚信ESG评级"` |

### 选股查询示例

```python

# 智能选股
call("stock", "search_stocks", {"query": "汽车零部件行业市值大于1000亿的股票"})

```

---

## 基金服务工具 (server_type="fund")

| 工具名称 | 功能说明 | 典型参数 |
|---------|---------|---------|
| `search_funds` | 基金搜索 | `{"query": "模糊基金名称或选基需求"}` 如 `"南方基金新能源ETF"` |
| `get_fund_profile` | 基金基本资料 | `{"query": "基金名称+指标"}` 如 `"工银双盈债券A(010068)的发行日期与发行费率"` |
| `get_fund_market_performance` | 基金行情与业绩 | `{"query": "基金名称+时间范围+指标"}` 如 `"方正富邦策略精选A(010072)在近一月收益率"` |
| `get_fund_ownership` | 基金份额与持有人 | `{"query": "基金名称+日期+指标"}` 如 `"湘财长弘灵活配置混合A(010076)在2025-06-30的申购总份额和赎回总份额"` |
| `get_fund_portfolio` | 基金持仓明细 | `{"query": "基金名称+日期+指标"}` 如 `"工银优质成长混合A(010088)在2025-06-30披露报告中的股票投资占比"` |
| `get_fund_financials` | 基金财务指标 | `{"query": "基金名称+日期+指标"}` 如 `"泰康浩泽混合A(010081)在2025-06-30的利润"` |
| `get_fund_company_info` | 基金公司信息 | `{"query": "基金名称+所属基金公司维度指标"}` 如 `"蜂巢丰瑞的所属基金公司基金经理数量"` |

---

## 宏观经济/行业经济指标服务 (server_type="edb")

- 宏观行业经济指标支持"先搜索再取数"，当你不明确具体指标时，可以先发起搜索请求，再结合用户需求选择具体指标查询

| 工具名称 | 功能说明 | 典型参数 |
|---------|---------|---------|
| `search_edb` | 指标搜索 | `{"query": "行业/产品/指标描述"}` 如 `"光模块产业链相关指标"` |
| `get_edb_data` | 指标数据查询 | `{"query": "指标名称+时间范围"}` 如 `"光伏电池产量202301-202506"` |

### EDB查询示例

```python
# 搜索可能的指标
call("edb", "search_edb", {"query": "新能源汽车产量相关指标"})

# 获取具体数据
call("edb", "get_edb_data", {"query": "新能源汽车产量当月值（202301-202506）"})
```

---

## 新闻公告服务 (server_type="news")

- 新闻公告服务内置语义检索能力，支持输入需要查询的内容，返回相关段落，而非公告全文
- 热点事件查询工具注重时效性，参数限制不宜过多，否则容易无结果，没有结果时可尝试放宽限制，或选择资讯搜索
- query 字段支持同时输入报告元数据要求及查询内容，如{"query":"有研新材2024年年度报告 固态电池技术相关"}

| 工具名称 | 功能说明 | 典型参数 |
|---------|---------|---------|
| `search_news` | 新闻资讯语义检索 | `{"query": "内容", "time_start": "开始日期", "time_end": "结束日期", "size": 数量}` |
| `search_notice` | 公告语义检索 | `{"query": "内容", "time_start": "开始日期", "time_end": "结束日期", "size": 数量}` |
| `search_trending_news` | 热点事件资讯查询 | `{"keyword": "关键词", "industry_name": "行业", "time_scope": "时效范围", "size": 数量}` |

### 新闻查询示例

```python
# 财经新闻
call("news", "search_news", {
    "query": "脑机接口技术最新进展",
    "time_start": "2025-01-01",
    "time_end": "2026-01-01",
    "size": 5
})

# 上市公司公告
call("news", "search_notice", {
    "query": "光迅科技2024年度报告 光模块技术",
    "time_start": "2025-01-01",
    "time_end": "2026-01-01",
    "size": 5
})

# 热点事件
call("news", "search_trending_news", {
    "keyword": "智能体",
    "industry_name": "计算机",
    "time_scope": "24小时",
    "size": 5
})
```

---

## 使用示例

本skill提供两种调用方案，请根据您的环境选择（用户未指定且不明确python环境时，优先选择 Node.js 方案）：

### 方案1：Node.js脚本调用方式

```javascript
const { call, listTools } = require('./call-node.js');

async function main() {
    // 查询股票数据
    const result1 = await call("stock", "search_stocks", { query: "电子行业市值排名前20的股票" });
    console.log(JSON.stringify(result1, null, 2));

    // 查询基金数据
    const result2 = await call("fund", "search_funds", { query: "南方基金的新能源ETF" });
    console.log(JSON.stringify(result2, null, 2));

    // 查询宏观经济数据
    const result3 = await call("edb", "get_edb_data", { query: "光伏电池产量当月值（202301-202506）" });
    console.log(JSON.stringify(result3, null, 2));

    // 查询新闻
    const result4 = await call("news", "search_news", {
        query: "人工智能行业动态",
        time_start: "2025-01-01",
        time_end: "2026-01-01",
        size: 5
    });
    console.log(JSON.stringify(result4, null, 2));
}

main().catch(console.error);
```

### 方案2：Python脚本调用方式

```python
from call import call, list_tools

# 查询股票数据
result = call("stock", "search_stocks", {"query": "电子行业市值排名前20的股票"})
print(result)

# 查询基金数据
result = call("fund", "search_funds", {"query": "南方基金的新能源ETF"})
print(result)

# 查询宏观经济数据
result = call("edb", "get_edb_data", {"query": "光伏电池产量当月值（202301-202506）"})
print(result)

# 查询新闻
result = call("news", "search_news", {
    "query": "人工智能行业动态",
    "time_start": "2025-01-01",
    "time_end": "2026-01-01",
    "size": 5
})
print(result)
```

**Node.js方案特点：**
- 无需安装额外依赖库，使用Node.js内置的 `http`/`https` 模块
- 异步函数设计，支持 `async/await` 语法
- 与Python方案使用相同的配置文件 `mcp_config.json`

---

## 注意事项

1. 配置文件 `mcp_config.json` 需要包含有效的 `auth_token`（两个方案共用）
2. 请求地址已经内置在请求脚本 call.py 和 call-node.js 内部，配置文件中的密钥也已经在脚本内引用，直接调用即可，无需你重新阅读、生成URL和密钥
3. 所有函数返回结果需检查 `ok` 字段确认请求是否成功
4. 时间参数格式：`YYYY-MM-DD`
5. `search_edb` 可用于不确定具体指标名称时的模糊搜索
6. 如无Python环境，可使用Node.js方案（`call-node.js`），无需安装任何依赖
7. 单次请求完成后，请帮助用户清除你临时生成的取数脚本
