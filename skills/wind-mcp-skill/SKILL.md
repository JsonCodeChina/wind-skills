---
name: wind-mcp-skill
description: >-
  访问万得 Wind 金融数据。覆盖 A 股 / 港股股票行情（最新价 / K 线 / 分钟）与财务基本面（财报 / 股本 / 事件 / 技术指标 / 风险）、ETF / 公募基金行情与全维数据（档案 / 财务 / 持仓 / 业绩 / 持有人 / 管理公司）、上市公司公告与财经新闻、宏观经济与行业指标。需要 WIND_API_KEY（登录 aimarket.wind.com.cn/#/user/overview 开发者中心获取）。**不包含**：美股 / 欧股 / 日股、汇率 / 期货盘口、加密货币、非金融数据。
author: Wind AIMarket
homepage: https://aimarket.wind.com.cn
auto_invoke: true
security:
  child_process: true
  eval: false
  filesystem_read: true
  filesystem_write: true
  network: true
examples:
  - "贵州茅台今天最新价"
  - "腾讯控股 00700.HK 最新价和成交量"
  - "宁德时代近 30 日 K 线"
  - "贵州茅台今日分钟级走势"
  - "科创50ETF 588200.SH 最新折溢价率"
  - "易方达蓝筹精选 005827.OF 的最新规模和经理"
  - "宁德时代 2024 年 ROE 和净利润增速"
  - "贵州茅台 vs 五粮液 2024 年营收对比"
  - "贵州茅台 2024 年年度报告内容"
  - "美联储 2026 年利率政策最新新闻"
  - "中国近 10 年新能源汽车产销量"
  - "贵州茅台前十大股东"
---

# Wind 万得金融数据

访问万得 Wind 金融数据：股票（行情与财务基本面）、基金（行情与全维数据）、上市公司公告与新闻、宏观经济指标。

> ⚠️ **3 条核心规则**（违反必失败）：
> 1. 命令必须在**本文件所在目录**下执行
> 2. fund_data / stock_data 分**行情类**（`*_price_indicators` / `*_kline` / `*_quote` → 结构化 `{windcode, ...}`）和 **NL 类**（财务 / 档案 / 持仓 / 事件等 → `{question}` 自然语言）—— 选错入参必报错
> 3. K 线必须显式传 `begin_date`（默认昨天，否则只回 2 条）；quote 字段名是 `begin / end` 短名（跟 K 线不一样）

> 📅 **数据时效**：行情快照 + 分钟级 = 当日准实时；K 线 = 收盘历史；财务 / 档案 = 最近一期定期报告。**WIND_API_KEY 有日调用额度**，密集开发请多 Key 轮换。

## 何时使用

**✅ 触发场景：**

| 场景 | server_type |
|---|---|
| **A 股 / 港股股票行情**（最新价、K 线、分钟级）| `stock_data` |
| 股票档案 / 财务基本面 / 股本结构 / 公司事件 / 技术指标 / 风险 | `stock_data` |
| **基金 ETF / LOF 行情**（最新价、K 线、分钟级）| `fund_data` |
| 基金任何维度（档案 / 财务 / 持仓 / 业绩 / 持有人 / 管理公司） | `fund_data` |
| 上市公司公告、财经新闻 | `financial_docs` |
| 宏观经济、行业经济指标（EDB） | `economic_data` |
| 不确定归属或跨域综合查询（fallback） | `analytics_data` |

**❌ 不触发场景：** 美股 / 欧股 / 非中概股；汇率 / 期货盘口 / 加密货币；非金融数据。

## 工作流程

> 🚨 命令必须在本文件（SKILL.md）所在目录下执行。

```bash
# 1. 看可用工具（24h 缓存于 ~/.cache/wind-aimarket/tools/）
node scripts/cli.mjs list-tools <server_type>

# 2. 调用工具
node scripts/cli.mjs call <server_type> <tool_name> '<params_json>'
```

### 没 Key 时

报"WIND_API_KEY 未配置"时：

1. **先问用户**是否同意打开浏览器，同意后跑 `node scripts/cli.mjs open-portal`（自动打开 `aimarket.wind.com.cn/#/user/overview` 拿 Key）
2. 三选一配置：
   - **A. 环境变量** `export WIND_API_KEY=ak_xxx`（临时）
   - **B. skill 内** `config.json`（参考 `config.json.example`，仅本 skill 有效）
   - **C. 全局** `~/.wind-aimarket/config`（**推荐**，所有 wind skill 共享）

## windcode 代码格式

行情类工具的 `windcode` 统一约定：

| 类型 | 格式 | 示例 |
|---|---|---|
| A 股 | `xxxxxx.SH/SZ/BJ` | `600519.SH` |
| 港股 | `xxxxx.HK` | `00700.HK` |
| 场外基金 | `xxxxxx.OF` | `005827.OF` |
| ETF / LOF | `xxxxxx.SH/SZ` | `588200.SH` |
| 中文名 | 直接写 | `贵州茅台` |

⚠️ **单工具调用只支持单代码**——传逗号分隔的多代码后端只识别第 1 个，其它静默忽略。多标的对比请并行多次调用。

## 工具表

### server_type=fund_data

**行情类（结构化代码参数）：**

#### `get_fund_price_indicators` — 场内基金（ETF / LOF）行情快照

| 字段 | 必填 | 类型 | 默认 | 说明 |
|---|---|---|---|---|
| `windcode` | ✅ | string | | 见 windcode 约定 |
| `indexes` | ✅ | string (enum) | | 行情字段，逗号分隔。常用：`NAME,MATCH,PRECLOSE,OPEN,HIGH,LOW,VOLUME,TURNOVER,CHANGE,CHANGERANGE,IOPV,PREMIUMDISCOUNTRATE,FUNDSIZE`。694 项全集见 `list-tools` |

#### `get_fund_kline` — 场内基金 K 线

| 字段 | 必填 | 类型 | 默认 | 说明 |
|---|---|---|---|---|
| `windcode` | ✅ | string | | |
| `begin_date` | ⚠️ 建议必填 | string | 昨天 | `yyyyMMdd`，**不显式传只回 2 条** |
| `end_date` | | string | 今天 | `yyyyMMdd` |
| `period` | | string | `"10"` | `1`=1分 / `3`=5分 / `4`=10分 / `5`=15分 / `6`=30分 / `7`=60分 / `8`=120分 / `9`=240分 / `10`=日K / `11`=周K / `12`=月K / `13`=年K / `14`=季K / `15`=半年K |
| `aftype` | | string | `"0"` | `0`=前复权 / `1`=后复权（**只这两值**） |
| `issusp` | | string | `"1"` | `0`=不含停牌 / `1`=含 |
| `afdate` | | string | | 复权基准日 `yyyyMMdd`，通常不传 |

#### `get_fund_quote` — 场内基金分钟级行情

| 字段 | 必填 | 类型 | 默认 | 说明 |
|---|---|---|---|---|
| `windcode` | ✅ | string | | |
| `begin` | | string | `LAST` | ⚠️ **字段名 `begin` 不是 `begin_date`**！`yyyyMMdd` 或 `LAST` |
| `end` | | string | `LAST` | ⚠️ **字段名 `end` 不是 `end_date`** |

**NL 类（入参 `{question, lang?, version?}`）：**

| 工具 | 说明 | question 示例 |
|---|---|---|
| `get_fund_info` | 基金档案（代码 / 简称 / 投资风格 / 业绩基准 / 费率 / 现任经理）| `"易方达蓝筹精选 005827.OF 基金档案"` |
| `get_fund_financials` | 基金财务（利润 / 净值 / 收入 / 费用 / 分红）| `"005827.OF 2024 年净利润和分红"` |
| `get_fund_holdings` | 持仓 + 资产配置（重仓股 / 申万 Wind 中信行业）| `"005827.OF 最新一期重仓股"` |
| `get_fund_performance` | 业绩 + 排名 + ETF / 二级交易数据 | `"005827.OF 近 1 年业绩排名"` |
| `get_fund_shareholders` | 持有人结构（个人 / 机构 / 申购赎回 / 规模变动）| `"005827.OF 持有人结构 个人 vs 机构"` |
| `get_fund_company_info` | 基金管理公司档案 + 经理团队 | `"易方达基金管理公司档案"` |

### server_type=stock_data

> 💡 **`price_indicators` vs `technicals` 鉴别**（字段有重叠如 MACD/KDJ）：单时点最新值 → `price_indicators`；过去 N 日时间序列 → `technicals`（NL）。

**行情类（结构化代码参数）：**

#### `get_stock_price_indicators` — 股票行情快照

| 字段 | 必填 | 类型 | 默认 | 说明 |
|---|---|---|---|---|
| `windcode` | ✅ | string | | A 股 / 港股均支持 |
| `indexes` | ✅ | string (enum) | | 行情字段，逗号分隔。常用：`NAME,MATCH,PRECLOSE,OPEN,HIGH,LOW,VOLUME,TURNOVER,CHANGE,CHANGERANGE,CHANGEHANDRATE,LIANGBI,WEIBI,HIGHLIMIT,LOWLIMIT,CAPITALMARKETVALUE,LISTEDMARKETVALUE,WEEK52HIGH,WEEK52LOW,PE_TTM,PB,DIVIDENDYIELDRATIO`。694 项见 `list-tools` |

#### `get_stock_kline` — 股票 K 线

字段同 `get_fund_kline`（参见上方）。`windcode` 支持 A 股 / 港股。

#### `get_stock_quote` — 股票分钟级行情（A 股 / 港股）

字段同 `get_fund_quote`（参见上方），字段名 `begin / end` 不是 `begin_date / end_date`。

**NL 类（入参 `{question, lang?, version?}`）：**

| 工具 | 说明 | question 示例 |
|---|---|---|
| `get_stock_basicinfo` | 股票档案（公司信息 / 主营 / 行业分类 / IPO 上市板）| `"600519.SH 公司基本档案"` |
| `get_stock_fundamentals` | 财务基本面（盈利能力 / 资产负债 / 利润 / 现金流 / 增长率）| `"贵州茅台 2024 年 ROE 和净利润增速"` |
| `get_stock_equity_holders` | 股本 + 股东（总股本 / 流通 / 前十大 / 实控人 / 限售解禁）| `"贵州茅台前十大股东"` |
| `get_stock_events` | 事件 + 资本运作（IPO / 增发 / 配股 / 并购 / ST / 合规）| `"宁德时代 2024 年增发和并购事件"` |
| `get_stock_technicals` | 技术指标时间序列（涨跌幅 / MACD / KDJ / RSI / BOLL / 融资融券 / 龙虎榜 / 涨跌停）| `"贵州茅台近 60 日 MACD 走势"` |
| `get_risk_metrics` | 风险指标（Beta / Jensen Alpha / 波动率 / Sharpe）| `"贵州茅台过去 1 年 Beta 和波动率"` |

### server_type=financial_docs

#### `get_company_announcements` — 公司公告 / 监管文件 / 招股书 / 业绩公告 / 致股东信

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `query` | ✅ | string | 自然语言，如 `"贵州茅台 2024 年报"` |
| `top_k` | | integer | 返回文档数 |
| `start_date` / `end_date` | | string | ⚠️ 格式 `YYYY-MM-DD`（跟 K 线 `yyyyMMdd` **不一样**）|

#### `get_financial_news` — 财经新闻

字段同上。`query` 示例：`"美联储利率政策"`。

### server_type=economic_data

#### `get_economic_data` — EDB 宏观 / 行业经济指标

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `metricIdsStr` | ✅ | string | **自然语言问句**（不是指标 ID）。如 `"中国 GDP"` / `"美国 CPI 同比"` |
| `beginDate` / `endDate` | | string | `yyyyMMdd` |
| `freq` | | enum | `日`=`1` / `工作日`=`2` / `周`=`3` / `月`=`4` / `季`=`5` / `半年`=`6` / `年`=`7` / `年度`=`8`（接受中文或代码）|
| `magnitude` | | enum | `个`=`1` / `千` / `万` / `百万` / `千万` / `亿` / `十亿` / `百亿` / `千亿` / `万亿`（中文或对应数字）|
| `currency` | | enum | `USD` / `CNY` / `EUR` / `JPY` / `AUD` / `GBP` / `CHF` / `CAD` / `SGD` / `HKD` / `MYR` / `BYR` |
| `searchType` | | enum | `深度`=`0` / `精确`=`1` |
| `ifUnion` | | enum | `开启`=`1` / `不开启`=`2`（混合搜索）|

> ⚠️ 报 `TOOL_RUNTIME_ERROR` 时，换 `analytics_data.get_financial_data` 兜底（同样问句通常能成功）。

### server_type=analytics_data（通用兜底）

#### `get_financial_data` — 自然语言通用 Wind 数据

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `question` | ✅ | string | 覆盖 fund / stock 之外的杂项与跨域综合，如 `"中证 500 最近一周表现"` |
| `lang` | | enum | `zh-CN` / `en` |

## 数据来源标注（必做）

向用户呈现查询结果时，**必须在结果末尾标注**：`数据来源于万得 Wind 金融数据服务`。

## 典型示例

```bash
# 行情快照
node scripts/cli.mjs call stock_data get_stock_price_indicators '{"windcode":"600519.SH","indexes":"NAME,MATCH,CHANGERANGE,VOLUME,TURNOVER"}'
node scripts/cli.mjs call stock_data get_stock_price_indicators '{"windcode":"00700.HK","indexes":"NAME,MATCH,CHANGERANGE"}'   # 港股
node scripts/cli.mjs call fund_data get_fund_price_indicators '{"windcode":"588200.SH","indexes":"NAME,MATCH,IOPV,PREMIUMDISCOUNTRATE"}'

# K 线（必传 begin_date,默认日 K 前复权）
node scripts/cli.mjs call stock_data get_stock_kline '{"windcode":"600519.SH","begin_date":"20260401","end_date":"20260430"}'
node scripts/cli.mjs call stock_data get_stock_kline '{"windcode":"600519.SH","begin_date":"20260428","end_date":"20260430","period":"6","aftype":"1"}'   # 30 分钟 + 后复权
node scripts/cli.mjs call fund_data get_fund_kline '{"windcode":"588200.SH","begin_date":"20260101","end_date":"20260430","period":"11"}'   # 周 K

# 分钟级（字段名 begin/end）
node scripts/cli.mjs call stock_data get_stock_quote '{"windcode":"600519.SH"}'
node scripts/cli.mjs call stock_data get_stock_quote '{"windcode":"00700.HK"}'

# 多标的对比（windcode 单代码,要并行多次）
node scripts/cli.mjs call stock_data get_stock_price_indicators '{"windcode":"600519.SH","indexes":"NAME,MATCH"}'
node scripts/cli.mjs call stock_data get_stock_price_indicators '{"windcode":"000858.SZ","indexes":"NAME,MATCH"}'

# NL 深度
node scripts/cli.mjs call stock_data get_stock_fundamentals '{"question":"贵州茅台 2024 年 ROE 和净利润增速"}'
node scripts/cli.mjs call fund_data get_fund_holdings '{"question":"005827.OF 最新一期重仓股"}'

# 文档（注意 YYYY-MM-DD）
node scripts/cli.mjs call financial_docs get_company_announcements '{"query":"贵州茅台 2024 年报","top_k":3}'
node scripts/cli.mjs call financial_docs get_financial_news '{"query":"美联储利率政策","top_k":5,"start_date":"2026-01-01"}'

# 宏观
node scripts/cli.mjs call economic_data get_economic_data '{"metricIdsStr":"中国 CPI 同比","freq":"月","beginDate":"20240101","endDate":"20261231"}'

# 通用兜底
node scripts/cli.mjs call analytics_data get_financial_data '{"question":"中证 500 最近一周表现"}'
```

## 错误恢复

| 错误 | 解法 |
|---|---|
| `WIND_API_KEY 未配置` | 先问用户，再跑 `open-portal`，引导配置全局 `~/.wind-aimarket/config` |
| HTTP 401/403 | Key 无效或过期 → 重新生成 |
| HTTP 5xx | 服务端异常 → 稍后重试 |
| 单日请求次数超限 | 当日额度用尽 → 等次日刷新或换 Key |
| `economic_data` 报 `TOOL_RUNTIME_ERROR` | 换 `analytics_data.get_financial_data` 兜底 |
| K 线只回 2 条 | 显式传更早的 `begin_date` |
| `*_quote` 参数报错 | 字段名是 `begin / end`，不是 `begin_date / end_date` |
| `aftype` 报错 | 只接受 `"0"` / `"1"`，无"不复权" |
| 工具不存在 / 未知 server_type | 先 `list-tools <server_type>` 拿真 schema |
| 调用失败但似乎啥都没报 | 检查命令是否在本 SKILL.md 所在目录下执行 |

## 调用前自查

1. 命令在本文件（SKILL.md）所在目录下执行
2. 行情类用 `{windcode, ...}` 结构化；NL 类用 `{question}` 自然语言
3. NL `question` 提取关键实体即可（✅ `"005827.OF 基金档案"` / ❌ `"帮我查一下..."`）
4. 结果末尾标注：`数据来源于万得 Wind 金融数据服务`

## 保持最新

AI 在以下场景**顺嘴提一次**升级提示（一个会话最多 1 次，不要每次都提）：

- **报错时**（尤其遇到"工具不存在 / 未知 server_type / 字段不符"等可能跟版本相关的错误）：
  > 可能本地 skill 版本过期，跑 `npx skills update wind-mcp-skill -y` 拉最新版试试
- **会话首次完成数据查询任务后**：
  > 想拿最新版可跑 `npx skills update wind-mcp-skill -y`
