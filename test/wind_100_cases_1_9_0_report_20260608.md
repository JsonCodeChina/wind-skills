# Wind MCP 100 个问题调用总结

- 执行时间：2026/6/8 16:57:33
- 输入文件：`测试报错用例100句.md`
- 测试技能：`wind-mcp-skill-1.9.0`
- 技能目录：`C:\Users\jhuan.jerry\Desktop\AIMarketTest\.agents\skills\wind-mcp-skill-1.9.0`
- 总数：100
- 成功：100
- 成功但有限制：0
- 无结果：0
- 失败：0

## 按服务统计

| server_type | 总数 | 成功/有结果 | 失败 |
| --- | ---: | ---: | ---: |
| stock_data | 70 | 70 | 0 |
| index_data | 17 | 17 | 0 |
| fund_data | 10 | 10 | 0 |
| economic_data | 3 | 3 | 0 |

## 失败错误码

无失败调用。

## 关键发现

- 第 31 题裸代码 `603435` 首次未识别；按沪市代码规范补全为 `603435.SH` 后成功。
- 第 50 题裸代码 `NVDA` 首次未识别；补全为 `NVDA.O` 后成功。
- 100 条调用均未出现失败。

## 逐题结果

| # | 问题 | 路由 | 状态 | 返回摘要 |
| ---: | --- | --- | --- | --- |
| 1 | 贵州茅台最新价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=1262.98；Wind代码=600519.SH |
| 2 | 600519.SH 今天涨跌幅多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 涨跌幅=-0.78；Wind代码=600519.SH |
| 3 | 新易盛今天成交额是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 成交额=23349172203；Wind代码=300502.SZ |
| 4 | 300502.SZ 当前成交量是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 成交量=32256061；Wind代码=300502.SZ |
| 5 | 宁德时代今天开盘价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 今日开盘价=395.80；Wind代码=300750.SZ |
| 6 | 比亚迪今天最高价和最低价分别是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 今日最高价=92.02；今日最低价=90.30；Wind代码=002594.SZ |
| 7 | 中际旭创现在多少钱一股？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=1154.99；Wind代码=300308.SZ |
| 8 | 工业富联今日成交额是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 成交额=14013578688；Wind代码=601138.SH |
| 9 | 中国平安最新成交价和涨跌幅是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=53.38；涨跌幅=-0.19；Wind代码=601318.SH |
| 10 | 招商银行今天换手率是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 换手率=0.373；Wind代码=600036.SH |
| 11 | 隆基绿能今天成交量是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 成交量=179366058；Wind代码=601012.SH |
| 12 | 万科A 最新价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=3.14；Wind代码=000002.SZ |
| 13 | 药明康德今天涨了多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 涨跌=-0.56；Wind代码=603259.SH |
| 14 | 立讯精密当前成交额是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 成交额=12545747660；Wind代码=002475.SZ |
| 15 | 东方财富今天成交量和成交额是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 成交量=348444993；成交额=6307021501；Wind代码=300059.SZ |
| 16 | 贵州茅台总市值是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 总市值2=1.57883e+12；Wind代码=600519.SH |
| 17 | 贵州茅台流通市值是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 流通市值=1.57883e+12；Wind代码=600519.SH |
| 18 | 宁德时代市盈率 TTM 是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 市盈率(TTM)=23.024；Wind代码=300750.SZ |
| 19 | 招商银行市净率是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 市净率=0.000；Wind代码=600036.SH |
| 20 | 比亚迪 52 周最高价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 52周最高=120.556；Wind代码=002594.SZ |
| 21 | 比亚迪 52 周最低价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 52周最低=85.88；Wind代码=002594.SZ |
| 22 | 中际旭创量比是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 量比=1.052；Wind代码=300308.SZ |
| 23 | 新易盛 5 分钟涨跌幅是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 5分钟涨跌幅=0.356；Wind代码=300502.SZ |
| 24 | 工业富联近 1 分钟成交额是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 近1分钟成交额=159841592；Wind代码=601138.SH |
| 25 | 东方财富现量是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 现量=600；Wind代码=300059.SZ |
| 26 | 贵州茅台今日成交额是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 成交额=3898027116；Wind代码=600519.SH |
| 27 | 宁德时代昨日收盘价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 前收盘价=403.00；Wind代码=300750.SZ |
| 28 | 中国平安今天最低价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 今日最低价=52.90；Wind代码=601318.SH |
| 29 | 招商银行今日最高价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 今日最高价=38.76；Wind代码=600036.SH |
| 30 | 万科A 今日开盘价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 今日开盘价=3.20；Wind代码=000002.SZ |
| 31 | 603435 最新价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=76.48；Wind代码=603435.SH |
| 32 | 603435.SZ 最新价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=76.48；Wind代码=603435.SH |
| 33 | 300750 最新价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=393.02；Wind代码=300750.SZ |
| 34 | 000001 最新价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=3959.34；Wind代码=000001.SH |
| 35 | 000001.SZ 今天成交额是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 成交额=1203946343；Wind代码=000001.SZ |
| 36 | 601318 当前涨跌幅是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 涨跌幅=-0.19；Wind代码=601318.SH |
| 37 | 600036 今天成交量是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 成交量=76947767；Wind代码=600036.SH |
| 38 | 002594 最新成交价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=91.19；Wind代码=002594.SZ |
| 39 | 688981 最新价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=121.92；Wind代码=688981.SH |
| 40 | 300308 今天成交额是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 成交额=38923878724；Wind代码=300308.SZ |
| 41 | 腾讯控股最新价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=446.400；Wind代码=0700.HK |
| 42 | 00700.HK 今天涨跌幅是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 涨跌幅=-1.50；Wind代码=0700.HK |
| 43 | 阿里巴巴港股今天成交额是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 成交额=9986447583；Wind代码=9988.HK |
| 44 | 9988.HK 最新成交价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=118.800；Wind代码=9988.HK |
| 45 | 小米集团今天成交量是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 成交量=152036878；Wind代码=1810.HK |
| 46 | 美团-W 当前涨跌幅是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 涨跌幅=-4.63；Wind代码=3690.HK |
| 47 | 苹果最新价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=307.340；Wind代码=AAPL.O |
| 48 | AAPL 最新成交价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=307.340；Wind代码=AAPL.O |
| 49 | 英伟达今天涨跌幅是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 涨跌幅=-6.20；Wind代码=NVDA.O |
| 50 | NVDA 当前成交额是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 成交额=45745009079；Wind代码=NVDA.O |
| 51 | 微软最新价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=416.670；Wind代码=MSFT.O |
| 52 | MSFT 52 周最高价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 52周最高=551.048；Wind代码=MSFT.O |
| 53 | 特斯拉今天成交量是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 成交量=63420177；Wind代码=TSLA.O |
| 54 | TSLA 当前涨跌幅是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 涨跌幅=-6.56；Wind代码=TSLA.O |
| 55 | 亚马逊最新成交价是多少？ | `stock_data.get_stock_price_indicators` | SUCCESS | 最新成交价=246.030；Wind代码=AMZN.O |
| 56 | 沪深300 最新点位是多少？ | `index_data.get_index_price_indicators` | SUCCESS | 最新成交价=4713.64；Wind代码=000300.SH |
| 57 | 000300.SH 今天涨跌幅是多少？ | `index_data.get_index_price_indicators` | SUCCESS | 涨跌幅=-2.14；Wind代码=000300.SH |
| 58 | 上证指数今天成交额是多少？ | `index_data.get_index_price_indicators` | SUCCESS | 成交额=1267277235700；Wind代码=000001.SH |
| 59 | 000001.SH 当前成交量是多少？ | `index_data.get_index_price_indicators` | SUCCESS | 成交量=65929355500；Wind代码=000001.SH |
| 60 | 创业板指最新价是多少？ | `index_data.get_index_price_indicators` | SUCCESS | 最新成交价=3811.79；Wind代码=399006.SZ |
| 61 | 399006.SZ 今天涨跌幅是多少？ | `index_data.get_index_price_indicators` | SUCCESS | 涨跌幅=-3.69；Wind代码=399006.SZ |
| 62 | 中证500 最新点位是多少？ | `index_data.get_index_price_indicators` | SUCCESS | 最新成交价=7963.45；Wind代码=000905.SH |
| 63 | 000905.SH 今天成交额是多少？ | `index_data.get_index_price_indicators` | SUCCESS | 成交额=562548949600；Wind代码=000905.SH |
| 64 | 中证1000 当前涨跌幅是多少？ | `index_data.get_index_price_indicators` | SUCCESS | 涨跌幅=-3.11；Wind代码=000852.SH |
| 65 | 000852.SH 最新成交价是多少？ | `index_data.get_index_price_indicators` | SUCCESS | 最新成交价=8081.26；Wind代码=000852.SH |
| 66 | 恒生指数最新点位是多少？ | `index_data.get_index_price_indicators` | SUCCESS | 最新成交价=24657.06；Wind代码=HSI.HI |
| 67 | 道琼斯指数最近一个月走势怎么样？ | `index_data.get_index_kline` | SUCCESS | TIME=2026-05-08T00:00:00.000-05:00；OPEN=49581.09；MATCH=49609.16；HIGH=49830.70；LOW=49486.96；TURNOVER=105423234300；VOLUME=463940500；CHANGEHANDRATE=0.4441；AVPRICE=49626.98；_DATE=20260508；共20行 |
| 68 | 纳斯达克指数今天涨跌幅是多少？ | `index_data.get_index_price_indicators` | SUCCESS | 涨跌幅=-4.18；Wind代码=IXIC.GI |
| 69 | 标普500 最新点位是多少？ | `index_data.get_index_price_indicators` | SUCCESS | 最新成交价=7383.74；Wind代码=SPX.GI |
| 70 | 科创50 今天成交额是多少？ | `index_data.get_index_price_indicators` | SUCCESS | 成交额=711635924；Wind代码=000688.SZ |
| 71 | 588200.SH 最新价是多少？ | `fund_data.get_fund_price_indicators` | SUCCESS | 最新成交价=3.299；Wind代码=588200.SH |
| 72 | 科创芯片 ETF 今天涨跌幅是多少？ | `fund_data.get_fund_price_indicators` | SUCCESS | 涨跌幅=-4.54；Wind代码=588200.SH |
| 73 | 510300.SH 当前成交额是多少？ | `fund_data.get_fund_price_indicators` | SUCCESS | 成交额=4394322754；Wind代码=510300.SH |
| 74 | 沪深300 ETF 最新成交价是多少？ | `fund_data.get_fund_price_indicators` | SUCCESS | 最新成交价=4.739；Wind代码=510300.SH |
| 75 | 159915.SZ 今天成交量是多少？ | `fund_data.get_fund_price_indicators` | SUCCESS | 成交量=1791638820；Wind代码=159915.SZ |
| 76 | 创业板 ETF 当前涨跌幅是多少？ | `fund_data.get_fund_price_indicators` | SUCCESS | 涨跌幅=-3.77；Wind代码=159915.SZ |
| 77 | 易方达蓝筹精选最新净值是多少？ | `fund_data.get_fund_price_indicators` | SUCCESS | 最新净值=1.5738；Wind代码=005827.OF |
| 78 | 005827.OF 最新一期规模是多少？ | `fund_data.get_fund_price_indicators` | SUCCESS | 基金规模=2.6793e+10；Wind代码=005827.OF |
| 79 | 余额宝七日年化收益率是多少？ | `fund_data.get_fund_price_indicators` | SUCCESS | 七日年化收益率=0.8450；Wind代码=000198.OF |
| 80 | 货币基金 000198.OF 最新净值是多少？ | `fund_data.get_fund_price_indicators` | SUCCESS | 最新净值=1.0000；Wind代码=000198.OF |
| 81 | 贵州茅台最近 30 天 K 线。 | `stock_data.get_stock_kline` | SUCCESS | TIME=2026-05-11T00:00:00.000+08:00；OPEN=1372.89；MATCH=1361.33；HIGH=1372.89；LOW=1361.00；TURNOVER=7790721392；VOLUME=5713510；CHANGEHANDRATE=0.4563；AVPRICE=1363.56；_DATE=20260511；共21行 |
| 82 | 600519.SH 2026 年 5 月日 K 线。 | `stock_data.get_stock_kline` | SUCCESS | TIME=2026-05-06T00:00:00.000+08:00；OPEN=1365.10；MATCH=1375.00；HIGH=1379.00；LOW=1360.05；TURNOVER=6550750940；VOLUME=4780604；CHANGEHANDRATE=0.3818；AVPRICE=1370.28；_DATE=20260506；共18行 |
| 83 | 新易盛最近 20 个交易日走势。 | `stock_data.get_stock_kline` | SUCCESS | TIME=2026-05-12T00:00:00.000+08:00；OPEN=575.00；MATCH=592.52；HIGH=599.75；LOW=570.91；TURNOVER=30891207516；VOLUME=52497316；CHANGEHANDRATE=5.9293；AVPRICE=588.43；_DATE=20260512；共20行 |
| 84 | 300502.SZ 近一个月日线。 | `stock_data.get_stock_kline` | SUCCESS | TIME=2026-05-08T00:00:00.000+08:00；OPEN=553.00；MATCH=551.67；HIGH=560.99；LOW=546.47；TURNOVER=16488159417；VOLUME=29800495；CHANGEHANDRATE=3.3658；AVPRICE=553.28；_DATE=20260508；共22行 |
| 85 | 宁德时代最近一周 5 分钟线。 | `stock_data.get_stock_kline` | SUCCESS | TIME=2026-06-01T09:35:00.000+08:00；OPEN=432.10；MATCH=438.15；HIGH=438.19；LOW=427.68；TURNOVER=3666607992；VOLUME=8430046；CHANGEHANDRATE=0.1980；AVPRICE=434.95；_DATE=20260601；共288行 |
| 86 | 比亚迪 2026 年以来周 K 线。 | `stock_data.get_stock_kline` | SUCCESS | TIME=2026-01-09T00:00:00.000+08:00；OPEN=98.40；MATCH=97.01；HIGH=100.50；LOW=96.33；TURNOVER=20771464389；VOLUME=211625421；CHANGEHANDRATE=6.0686；AVPRICE=98.15；_DATE=20260109；共22行 |
| 87 | 沪深300 最近 60 天 K 线。 | `index_data.get_index_kline` | SUCCESS | TIME=2026-04-09T00:00:00.000+08:00；OPEN=4562.67；MATCH=4566.22；HIGH=4579.20；LOW=4552.42；TURNOVER=500445676600；VOLUME=18493978300；CHANGEHANDRATE=0.5599；AVPRICE=4565.13；_DATE=20260409；共40行 |
| 88 | 上证指数 2026 年 5 月走势。 | `index_data.get_index_kline` | SUCCESS | TIME=2026-05-06T00:00:00.000+08:00；OPEN=4135.45；MATCH=4160.17；HIGH=4166.15；LOW=4129.91；TURNOVER=1465903193400；VOLUME=70117748000；CHANGEHANDRATE=1.4723；AVPRICE=4147.92；_DATE=20260506；共18行 |
| 89 | 00700.HK 最近 10 天日 K 线。 | `stock_data.get_stock_kline` | SUCCESS | TIME=2026-05-29T00:00:00.000+08:00；OPEN=428.200；MATCH=427.200；HIGH=438.400；LOW=423.600；TURNOVER=20597452291；VOLUME=48005475；CHANGEHANDRATE=0.526；AVPRICE=429.065；_DATE=20260529；共7行 |
| 90 | AAPL 最近一个月 K 线。 | `stock_data.get_stock_kline` | SUCCESS | TIME=2026-05-08T00:00:00.000-04:00；OPEN=289.743；MATCH=293.050；HIGH=294.489；LOW=289.733；TURNOVER=15445343480；VOLUME=52692761；CHANGEHANDRATE=0.359；AVPRICE=292.851；_DATE=20260508；共20行 |
| 91 | 贵州茅台 2025 年净利润是多少？ | `stock_data.get_stock_fundamentals` | SUCCESS | {"data":[{"columns":[{"name":"Wind代码","type":"string"},{"name":"证券简称","type":"string"},{"name":"2025年净利润","type":"number","unit":"亿元"},{"name":"记账本位币","type":"string"}],"excelTotalCount":2,"resolved_question":"","rows":[["600519.SH","贵州茅台",853.1032,"CNY"]],"step":"Step1"}]} |
| 92 | 贵州茅台 2025 年 ROE 是多少？ | `stock_data.get_stock_fundamentals` | SUCCESS | {"data":[{"columns":[{"name":"Wind代码","type":"string"},{"name":"证券简称","type":"string"},{"name":"2025年ROE","type":"number","unit":"%"}],"excelTotalCount":1,"resolved_question":"","rows":[["600519.SH","贵州茅台",34.462]],"step":"Step1"}]} |
| 93 | 宁德时代最近一期资产负债率是多少？ | `stock_data.get_stock_fundamentals` | SUCCESS | {"data":[{"columns":[{"name":"Wind代码","type":"string"},{"name":"证券简称","type":"string"},{"name":"最新资产负债率","type":"number","unit":"%"}],"excelTotalCount":1,"resolved_question":"","rows":[["300750.SZ","宁德时代",62.3223]],"step":"Step1"}]} |
| 94 | 比亚迪 2025 年营收同比增速是多少？ | `stock_data.get_stock_fundamentals` | SUCCESS | {"data":[{"columns":[{"name":"Wind代码","type":"string"},{"name":"证券简称","type":"string"},{"name":"2025年营业收入同比增长率","type":"number","unit":"%"}],"excelTotalCount":1,"resolved_question":"","rows":[["002594.SZ","比亚迪",3.4568]],"step":"Step1"}]} |
| 95 | 新易盛最近 60 日 MACD 走势。 | `stock_data.get_stock_technicals` | SUCCESS | {"data":[{"columns":[{"name":"Wind代码","type":"string"},{"name":"证券简称","type":"string"},{"name":"新易盛最近60日MACD","type":"number"},{"name":"新易盛最近60日MACD时间","type":"date"}],"excelTotalCount":39,"resolved_question":"","rows":[["300502.SZ","新易盛",23.3387,"2026-04-10"],["300502.SZ","新易盛",24.8866,"2026-04-13" |
| 96 | 中际旭创近一年 Beta 是多少？ | `stock_data.get_risk_metrics` | SUCCESS | {"data":[{"columns":[{"name":"Wind代码","type":"string"},{"name":"证券简称","type":"string"},{"name":"近1年BETA","type":"number"}],"excelTotalCount":1,"resolved_question":"","rows":[["300308.SZ","中际旭创",2.5446]],"step":"Step1"}]} |
| 97 | 贵州茅台前十大股东是谁？ | `stock_data.get_stock_equity_holders` | SUCCESS | {"data":[{"columns":[{"name":"Wind代码","type":"string"},{"name":"证券简称","type":"string"},{"name":"大股东前10名","type":"string"},{"name":"大股东前10名名次","type":"number"}],"excelTotalCount":20,"resolved_question":"","rows":[["600519.SH","贵州茅台","中国贵州茅台酒厂(集团)有限责任公司",1],["600519.SH","贵州茅台","香港中央结算有限公司(陆股通)",2],["6 |
| 98 | 中国最新 CPI 同比是多少？ | `economic_data.get_economic_data` | SUCCESS | {"date":["19870131","19870228","19870331","19870430","19870531","19870630","19870731","19870831","19870930","19871031","19871130","19871231","19880131","19880229","19880331","19880430","19880531","19880630","19880731","19880831","19880930","19881031","19881130","19881231","19890131","19890228","1989 |
| 99 | 中国 2026 年 5 月 PMI 是多少？ | `economic_data.get_economic_data` | SUCCESS | {"date":["20260531"],"indicatorInfo":[{"calcCurrency":"","calcFreq":"月","calcMagnitude":"","code":"M0017126","data":[50],"enCalcCurrency":"","enCalcFreq":"month","enCalcMagnitude":"","enName":"China: Manufacturing PMI","enSource":"National Bureau of Statistics of China","enUnit":"%","name":"中国:制造业PM |
| 100 | 美国最新非农就业人数是多少？ | `economic_data.get_economic_data` | SUCCESS | {"date":["19390131","19390228","19390331","19390430","19390531","19390630","19390731","19390831","19390930","19391031","19391130","19391231","19400131","19400229","19400331","19400430","19400531","19400630","19400731","19400831","19400930","19401031","19401130","19401231","19410131","19410228","1941 |

## 说明

- `SUCCESS`：Wind 返回非空数据。
- `SUCCESS_WITH_LIMITS`：Wind 返回数据，但含 `INVALID` 等缺失值。
- `NO_RESULTS`：调用成功，但 Wind 未返回可用数据。
- `FAILED`：CLI、网络、参数、路由或 Wind 后端返回错误。
- 网络或临时不可用错误按原路由、原参数自动重试 1 次。
- 完整入参、每次调用 stdout/stderr 和解析结果见 `wind_100_cases_1_9_0_results_20260608.json`。

> 数据来源于万得 Wind 金融数据服务。
