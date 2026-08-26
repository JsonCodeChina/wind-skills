# Wind 金融数据 MCP 接口文档

直连 7 个 Wind MCP 服务的接口说明：每个服务的地址、工具入参与返回示例。示例为 2026-08-24 直连实测（数值会变）。

## 连接

- 地址：`https://mcp.wind.com.cn/vserver_<domain>/mcp/`（注意结尾的斜杠）
- 认证：请求头 `Authorization: Bearer <API_KEY>`（API Key 在万得开发者中心获取：`https://aifinmarket.wind.com.cn`）
- 其它请求头：`Accept: application/json, text/event-stream`、`Content-Type: application/json`
- 协议：JSON-RPC 2.0（`POST`），直接发 `tools/call` 即可（无需先 `initialize`）；`tools/list` 可列举工具。

| 服务 | 地址 |
| --- | --- |
| 股票 | `https://mcp.wind.com.cn/vserver_stock_data/mcp/` |
| 基金 | `https://mcp.wind.com.cn/vserver_fund_data/mcp/` |
| 指数 | `https://mcp.wind.com.cn/vserver_index_data/mcp/` |
| 债券 | `https://mcp.wind.com.cn/vserver_bond_data/mcp/` |
| 公告/新闻 | `https://mcp.wind.com.cn/vserver_financial_docs/mcp/` |
| 宏观 EDB | `https://mcp.wind.com.cn/vserver_economic_data/mcp/` |
| 分析 | `https://mcp.wind.com.cn/vserver_analytics_data/mcp/` |

### Postman 请求配置

以调用股票服务的 `get_stock_price_indicators` 为例，在 Postman 中新建请求：

- **Method**：`POST`
- **URL**：`https://mcp.wind.com.cn/vserver_stock_data/mcp/`
- **Headers**：

  | Key | Value |
  | --- | --- |
  | `Authorization` | `Bearer <API_KEY>` |
  | `Accept` | `application/json, text/event-stream` |
  | `Content-Type` | `application/json` |

- **Body** → 选 `raw` + `JSON`（直接发 `tools/call`）：

  ```json
  {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_stock_price_indicators","arguments":{"windcode":"600519.SH","indexes":"中文简称,最新成交价,涨跌幅"}}}
  ```

切换其它服务/工具时只改 **URL** 里的 `vserver_<domain>` 和 Body 里的 `name`/`arguments`，Headers 不变。

可直接导入的 Postman Collection（v2.1，把 `apiKey` 变量填成自己的 Key）：

```json
{
  "info": { "name": "Wind MCP", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  "variable": [
    { "key": "apiKey", "value": "<API_KEY>" },
    { "key": "url", "value": "https://mcp.wind.com.cn/vserver_stock_data/mcp/" }
  ],
  "item": [
    {
      "name": "tools/call get_stock_price_indicators",
      "request": {
        "method": "POST",
        "header": [
          { "key": "Authorization", "value": "Bearer {{apiKey}}" },
          { "key": "Accept", "value": "application/json, text/event-stream" },
          { "key": "Content-Type", "value": "application/json" }
        ],
        "url": { "raw": "{{url}}" },
        "body": { "mode": "raw", "raw": "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"get_stock_price_indicators\",\"arguments\":{\"windcode\":\"600519.SH\",\"indexes\":\"中文简称,最新成交价,涨跌幅\"}}}" }
      }
    }
  ]
}
```

等价 curl：

```bash
curl -sS https://mcp.wind.com.cn/vserver_stock_data/mcp/ \
  -H 'Authorization: Bearer <API_KEY>' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
        "name":"get_stock_price_indicators",
        "arguments":{"windcode":"600519.SH","indexes":"中文简称,最新成交价,涨跌幅"}}}'
```

## 返回格式

业务数据在 JSON-RPC 结果的 `result.content[0].text`（JSON 字符串，需二次解析）。

- 结构化：`{"data":{"columns":[{name,type,unit?}],"rows":[[…]],"unit?":{…}}}`（下文示例把 `columns` 简写为字段名列表）
- 自然语言/筛选：`{"data":{"data":[{columns,rows}, …]}}`（可能多块）
- 宏观 EDB：search 返回 `{"metrics":[{…}]}`；query 返回 `{"metrics":[{meta,date[],value[]}]}`
- 公告/新闻：`{"data":{"items":[{title,date,doc_type,relevance,content,url}],"total":N}}`
- 失败：JSON-RPC `error`，或 `result.isError:true`（`content[0].text` 为错误原文）

## 通用参数

- 自然语言工具传 `question`；公告/新闻传 `query`（+ `top_k`，1–20，默认 5）。
- `windcode`：名称或 Wind 代码（如 `600519.SH`），价格指标支持逗号分隔多标的。
- `indexes`：指标字段名，逗号分隔。日期：`yyyy-MM-dd`。
- K 线 `period`（数字编码）：`1`=1分 `3`=5分 `4`=10分 `5`=15分 `6`=30分 `7`=60分 `8`=120分 `9`=240分 **`10`=日K** `11`=周K `12`=月K `13`=年K `14`=季K `15`=半年K；`aftype` `0`前复权/`1`后复权/`2`不复权；`issusp` `0`/`1`。
- `count`（K 线 / 分钟，整数，默认 `0`）：在开始/结束区间内取数条数——正数从头往后取 N 条、负数从结束日期往前取 N 条、`0` 取全部；不会超出日期区间。

---

## 1. stock_data 股票

| 工具 | 入参 | 说明 |
| --- | --- | --- |
| `get_stock_price_indicators` | `windcode`(必), `indexes` | 时点行情截面 |
| `get_stock_kline` | `windcode`,`begin_date`,`end_date`(必), `period`/`count`/`aftype`/`issusp`/`afdate` | 区间 K 线 |
| `get_stock_quote` | `windcode`(必), `begin`/`end`/`count` | 分钟量价 |
| `search_stocks` | `question` | 条件筛选 |
| `get_stock_basicinfo` | `question` | 公司档案 |
| `get_stock_fundamentals` | `question` | 财务与估值 |
| `get_stock_equity_holders` | `question` | 股本与股东 |
| `get_stock_events` | `question` | 公司行动/分红 |
| `get_stock_technicals` | `question` | 技术指标/形态 |
| `get_risk_metrics` | `question` | 风险指标 |

`get_stock_price_indicators` ← `{"windcode":"600519.SH","indexes":"中文简称,最新成交价,涨跌幅,总市值1,市盈率(TTM),股息率"}`
```json
{"data":{"columns":["中文简称","最新成交价","涨跌幅","总市值1","市盈率(TTM)","股息率","Wind代码"],
"rows":[["贵州茅台","1304.66","2.50","1.63093e+12","20.028","3.99","600519.SH"]],"unit":{"总市值1":"元","最新成交价":"元"}}}
```

`get_stock_kline` ← `{"windcode":"600519.SH","begin_date":"2026-08-18","end_date":"2026-08-22","period":"10"}`（返回 4 行）
```json
{"data":{"columns":["TIME","OPEN","MATCH","HIGH","LOW","TURNOVER","VOLUME","CHANGEHANDRATE","AVPRICE"],
"rows":[["2026-08-18T00:00:00.000+08:00","1291.00","1297.99","1302.90","1285.17","5007014692","3872283","0.3098","1293.04"]],
"unit":{"OPEN 单位：":"元","VOLUME 单位：":"股","TURNOVER 单位：":"元"}}}
```
列义：时间/开/收/高/低/成交额/成交量/换手率/均价。`get_stock_quote` 同结构、粒度为分钟（单日约 238 行）。K 线/分钟可加 `count` 限条数，如取区间末 2 条传 `"count":-2`。

`search_stocks` ← `{"question":"筛选沪深市场市值超2000亿且股息率超3%的股票"}`（返回 32 行）
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","总市值1","交易币种","股息率TTM"],
"rows":[["601857.SH","中国石油",19938.2003,"CNY",4.2077],["601398.SH","工商银行",26875.8559,"CNY",3.9328]]}]}}
```

`get_stock_basicinfo` ← `{"question":"查询贵州茅台(600519.SH)的基本档案"}`（约 29 列，节选）
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","注册资本","公司中文名称","成立日期","统一社会信用代码","员工总数","法定代表人","董事长姓名","审计机构","经营范围","城市","注册资本币种"],
"rows":[["600519.SH","贵州茅台",12.5008,"贵州茅台酒股份有限公司","1999-11-20","9152000071430580XT",34992,"陈华","陈华","天健会计师事务所(特殊普通合伙)","茅台酒及系列酒的生产与销售;…","仁怀市","CNY"]]}]}}
```

`get_stock_fundamentals` ← `{"question":"查询贵州茅台(600519.SH)2024-12-31的ROE、营业收入和净利润"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","2024年ROE","2024年营业收入","2024年净利润"],
"rows":[["600519.SH","贵州茅台",38.4283,1708.9915,893.3473]]}]}}
```

`get_stock_equity_holders` ← `{"question":"查询贵州茅台(600519.SH)的前十大股东及流通A股占比"}`（两块：前十大股东10行 + 股本占比）
```json
{"data":{"data":[
 {"columns":["Wind代码","证券简称","前十大股东名称","前十大股东持股比例","名次"],
  "rows":[["600519.SH","贵州茅台","中国贵州茅台酒厂(集团)有限责任公司",54.5,1]]},
 {"columns":["Wind代码","证券简称","流通A股","总股本","流通A股占总股本比例"],
  "rows":[["600519.SH","贵州茅台",1250081601,1250081601,1]]}]}}
```

`get_stock_events` ← `{"question":"查询贵州茅台(600519.SH)2024年的分红派息"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","2024年净利润","2024年现金分红总额","2024年每股股利_税前","2024年股息率","2024年股利支付率"],
"rows":[["600519.SH","贵州茅台",893.3473,346.7116,27.673,4.8467,40.3149]]}]}}
```

`get_stock_technicals` ← `{"question":"查询贵州茅台(600519.SH)最新的MACD和20日涨跌幅"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","近20交易日涨跌幅","最新DIFF值","最新DEA值","最新MACD值"],
"rows":[["600519.SH","贵州茅台",1.1756,5.1544,13.6044,-16.8999]]}]}}
```

`get_risk_metrics` ← `{"question":"查询宁德时代(300750.SZ)过去1年的Beta和最大回撤"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","过去1年BETA","过去1年最大回撤"],
"rows":[["300750.SZ","宁德时代",0.9098,-24.1826]]}]}}
```

---

## 2. fund_data 基金 / ETF / LOF

| 工具 | 入参 | 说明 |
| --- | --- | --- |
| `get_fund_price_indicators` | `windcode`(必), `indexes` | 场内基金时点行情 |
| `get_fund_kline` | `windcode`,`begin_date`,`end_date`(必), `period`/`count`/`aftype`/`issusp` | 场内基金 K 线 |
| `get_fund_quote` | `windcode`(必), `begin`/`end`/`count` | 场内基金分钟 |
| `search_funds` | `question` | 条件筛选 |
| `get_fund_financials` | `question` | 财务/分红 |
| `get_fund_holdings` | `question` | 持仓 |
| `get_fund_holders` | `question` | 规模与持有人 |
| `get_fund_performance` | `question` | 净值/业绩/评价 |
| `get_fund_company_info` | `question` | 管理人档案 |
| `get_fund_info` | `question` | 产品档案 |

`get_fund_price_indicators` ← `{"windcode":"588200.SH","indexes":"中文简称,最新成交价,涨跌幅,成交额,IOPV,贴水率"}`
```json
{"data":{"columns":["中文简称","最新成交价","涨跌幅","成交额","IOPV","贴水率","Wind代码"],
"rows":[["科创芯片ETF嘉实","1.134","-3.32","3430786891","1.1348","-3.333","588200.SH"]],"unit":{"成交额":"元"}}}
```
`get_fund_kline`/`get_fund_quote` 与股票同结构。场外基金无场内行情，其净值走 `get_fund_performance`。

`search_funds` ← `{"question":"筛选股票型基金中近一年收益率超20%的产品"}`（返回 100 行）
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","近1年回报"],
"rows":[["024662.OF","富国创业板人工智能ETF联接A",50.1845],["012552.OF","天弘中证芯片产业ETF联接A",48.9387]]}]}}
```

`get_fund_financials` ← `{"question":"查询易方达蓝筹精选(005827.OF)最近一个报告期的基金利润和管理费"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","最新报告期利润","最新基金管理费"],
"rows":[["005827.OF","易方达蓝筹精选",27.9703,4.3495]]}]}}
```

`get_fund_holdings` ← `{"question":"查询易方达蓝筹精选(005827.OF)最新的前十大重仓股"}`（返回 10 行）
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","前十名重仓股票名称","前十名重仓股持股市值","前十名重仓股市值占基金资产净值比","名次"],
"rows":[["005827.OF","易方达蓝筹精选","腾讯控股",11.6862,5.7241,1]]}]}}
```

`get_fund_holders` ← `{"question":"查询易方达蓝筹精选(005827.OF)最新规模和机构持有比例"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","最新基金规模","最新机构投资者持有比例","最新机构投资者持有比例时间"],
"rows":[["005827.OF","易方达蓝筹精选",310.2104,0.7715,"Q4 FY2025"]]}]}}
```

`get_fund_performance` ← `{"question":"查询易方达蓝筹精选(005827.OF)近一年收益率和最大回撤"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","近1年回报","近1年最大回撤"],
"rows":[["005827.OF","易方达蓝筹精选",-22.6716,-28.3589]]}]}}
```

`get_fund_company_info` ← `{"question":"查询易方达蓝筹精选(005827.OF)管理人的在管规模和基金经理人数"}`（多块）
```json
{"data":{"data":[{"columns":["基金管理人","管理人在管基金规模"],"rows":[["易方达基金管理有限公司",2.6952]]},
 {"columns":["基金管理人","管理人在任基金经理数"],"rows":[["易方达基金管理有限公司",192]]}]}}
```

`get_fund_info` ← `{"question":"易方达蓝筹精选(005827.OF)的基金经理、成立日期和管理费率"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","现任基金经理姓名","基金成立日","管理费率_支持历史"],
"rows":[["005827.OF","易方达蓝筹精选","张坤,何一铖,杨思亮","2018-09-05",1.2]]}]}}
```

---

## 3. index_data 指数 / 板块

| 工具 | 入参 | 说明 |
| --- | --- | --- |
| `get_index_price_indicators` | `windcode`(必), `indexes` | 时点行情 |
| `get_index_kline` | `windcode`,`begin_date`,`end_date`(必), `period`/`count` | K 线 |
| `get_index_quote` | `windcode`(必), `begin`/`end`/`count` | 分钟点位 |
| `get_index_basicinfo` | `question` | 指数概况 |
| `get_index_fundamentals` | `question` | 加权基本面/估值 |
| `get_index_technicals` | `question` | 技术指标 |

`get_index_price_indicators` ← `{"windcode":"000300.SH","indexes":"中文简称,最新成交价,涨跌幅,成交额"}`
```json
{"data":{"columns":["中文简称","最新成交价","涨跌幅","成交额","Wind代码"],
"rows":[["沪深300","4563.13","-1.21","590425593700","000300.SH"]],"unit":{"成交额":"元"}}}
```
K 线/分钟与股票同结构。

`get_index_basicinfo` ← `{"question":"查询沪深300指数的发布机构、基日和成份股数量"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","发布机构","基期","成份个数"],
"rows":[["399300.SZ","沪深300","中证指数有限公司","2004-12-31",300]]}]}}
```

`get_index_fundamentals` ← `{"question":"查询沪深300指数最新的PE和PB"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","最新PB","最新PE"],"rows":[["399300.SZ","沪深300",1.4467,14.0439]]}]}}
```

`get_index_technicals` ← `{"question":"查询沪深300指数最新的MACD和20日涨跌幅"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","最新MACD指数平滑移动平均","近20交易日涨跌幅"],
"rows":[["399300.SZ","沪深300",-28.2885,-2.9623]]}]}}
```

---

## 4. bond_data 债券

无行情快照/K线/分钟工具，四个工具均传 `question`。

| 工具 | 说明 |
| --- | --- |
| `get_bond_basicinfo` | 债券静态档案（票面利率/期限/到期日等） |
| `get_bond_issuer_info` | 发债主体档案 |
| `get_bond_market_data` | 区间行情与估值（收益率/久期等） |
| `get_bond_financial_data` | 发债主体财务 |

`get_bond_basicinfo` ← `{"question":"查询24国债01(019742.SH)的票面利率、期限和到期日期"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","票面利率_指定日期","剩余期限_下一行权日","到期日期"],
"rows":[["019732.SH","24国债01",2.37,2.3945,"2029-01-15"]]}]}}
```

`get_bond_issuer_info` ← `{"question":"查询24国债01(019732.SH)发债主体的名称和主体信用评级"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","债务主体名称","债务主体中文简称","主体评级"],
"rows":[["019732.SH","24国债01","中华人民共和国财政部","",""]]}]}}
```

`get_bond_market_data` ← `{"question":"查询24国债01(019732.SH)最新的到期收益率和修正久期"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","最新收盘价收益率","交易币种","最新收盘价修正久期"],
"rows":[["019732.SH","24国债01",1.2011,"CNY",2.3018]]}]}}
```

`get_bond_financial_data` ← `{"question":"查询24万科01发债主体2024年的营业收入和净利润"}`
```json
{"data":{"data":[{"columns":["Wind代码","证券简称","2024年营业收入","2024年净利润","债务主体名称"],
"rows":[["F1000621.00","万科企业股份有限公司",3431.7644,-487.0393,""]]}]}}
```

---

## 5. financial_docs 公告 / 新闻

参数为 `query`（必）+ `top_k`（可，1–20，默认 5）。

| 工具 | 说明 |
| --- | --- |
| `get_company_announcements` | 上市公司公告 |
| `get_financial_news` | 财经新闻 |

`get_financial_news` ← `{"query":"美联储利率政策","top_k":2}`（返回 5 条）
```json
{"data":{"items":[{"title":"美联储公布最新利率决议","date":"2026-07-30","doc_type":"news","relevance":0.9643,
"content":"北京时间7月30日凌晨，美联储召开7月货币政策会议……维持在3.5%…","url":"https://t.wind.com.cn/..."}],"total":5}}
```
`get_company_announcements` 结构相同，`doc_type` 为 `announcement`。

---

## 6. economic_data 宏观 EDB

| 工具 | 入参 | 说明 |
| --- | --- | --- |
| `search_economic_indicator` | `question` | 找指标/确认代码，不取数值 |
| `query_economic_indicator_data` | `question`(必) + `beginDate`+`endDate` 或 `observation`(整数) | 取时间序列；可选 `targetMagnitude`/`targetCurrency`/`targetFrequency` 做数量级/币种/频率换算 |

`search_economic_indicator` ← `{"question":"中国GDP现价当季值相关指标"}`
```json
{"metrics":[{"code":"M5567876","name":"中国:GDP:现价:当季值","unit":"亿元","source":"国家统计局","magnitude":"亿","currency":"人民币","updateDate":"20260720","freq":"季"}]}
```

`query_economic_indicator_data` ← `{"question":"中国GDP现价当季值","observation":4}`
```json
{"metrics":[{"meta":{"code":"M5567876","name":"中国:GDP:现价:当季值","unit":"亿元","freq":"季"},
"date":["20250930","20251231","20260331","20260630"],"value":[354106.2,387911.3,334192.9,361511.1]}]}
```

---

## 7. analytics_data 跨标的聚合

`get_financial_data` ← `question`：跨标的聚合、加权、排名、复合计算（返回计算结果，非实体列表）。

← `{"question":"贵州茅台、五粮液、泸州老窖三只股票最新总市值的合计"}`
```json
{"data":{"data":[{"columns":["最新总市值合计"],"rows":[[2.0343]]}]}}
```

---

*连接方式（`mcp.wind.com.cn` + Bearer API Key）与各工具示例均为 2026-08-24 直连实测，`content[0].text` 已展开、序列/列表已节选。API Key 未写入本文档（占位 `<API_KEY>`）。字段以实际返回为准。*
