---
name: "iFinD-Finance-Data"
description: "连接同花顺金融数据服务，可查询股票、基金、宏观与行业指标以及新闻公告，并支持自然语言选股、选基和资讯检索"
homepage: https://www.51ifind.com
version: 1.0.0
author: iFind
---

# 同花顺数据访问指南 (iFind-finance-data)
- 本技能提供股票、基金、宏观与行业指标、新闻公告等数据的统一查询入口
- 主要能力包括自然语言选股选基、金融指标获取、公告资讯检索和经济指标搜索
- 可用数据覆盖证券、基金、经济指标及公开资讯等常见研究场景

## 调用方式
本 skill 对同花顺金融数据 MCP 服务进行了调用封装，可通过 Python 或 Node.js 使用：
- **Node.js方案**：使用 `call-node.js` 脚本（无需额外依赖，使用内置模块）
- **Python方案**：使用 `call.py` 脚本（需安装 `requests` 库）
- **推荐方案**：当用户未指定python，或不确定python环境时，优先使用Node.js方案
- **query**：股票基金数据查询工具的 query 参数一般支持多主体、多指标，但不宜超过 10 个

## 首次使用
- **配置密钥**：config.json 用于存储用户密钥，如不存在有效密钥，需提示用户到"iFinD终端-工具-常用工具-数据MCP"获取密钥，帮助其完成密钥写入，或手动写入

## 可查内容
- **股票数据**：可处理证券筛选、公司资料、财务指标、市场表现、股东结构、风险数据、ESG 与公司事件
- **基金数据**：涵盖产品检索、基础档案、净值与业绩、组合持仓、持有人以及管理人信息
- **宏观经济数据**：支持 GDP、CPI、PPI、产业指标和大宗商品等经济序列
- **新闻公告**：用于检索财经报道、上市公司披露及市场热点

## 查询建议
- 1.**指标先定位**：宏观或行业指标含义不明确时，先调用 `search_edb` 获取候选项，再结合上下文使用 `get_edb_data` 取数
- 2.**适度合并请求**：股票和基金工具允许同时查询多个主体与指标，例如 `{"query":"贵州茅台、五粮液、泸州老窖在2025-09-30的净利润增速、ROE、ROA"}`；建议主体数和指标数各不超过 5 个
- 3.**控制板块范围**：可以把行业或板块作为股票查询主体，但范围和时间跨度不宜过大，以免结果被截断，例如 `{"query":"光伏设备行业股票的今日涨跌幅"}`

## 核心函数

### call(server_type, tool_name, params)

向指定服务发送金融数据查询。

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

返回指定服务类别下当前可调用的工具列表。

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

- 宏观与行业序列适合采用“搜索候选指标，再获取具体数据”的两步流程

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

- 新闻和公告工具按语义匹配相关片段，返回内容不等同于整篇原文
- 热点检索强调时效性；条件过多可能导致空结果，可减少限制或改用普通资讯搜索
- `query` 可以同时描述报告范围和关注内容，例如 `{"query":"宁德时代2025年年度报告 储能业务相关"}`

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

本 skill 提供两种脚本入口，可按运行环境选择；用户未指定且 Python 环境不明确时，优先采用 Node.js 方案：

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
