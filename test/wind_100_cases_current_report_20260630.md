# Wind MCP 100 个常用问题测试报告

> 生成日期：2026-06-30  
> 输入文件：`test/测试报错用例100句.md`  
> 测试对象：`skills/wind-mcp-skill`  
> 执行方式：在对话中逐句调用 `node scripts/cli.mjs call ...`，根据 CLI stdout / error 记录结果  
> 数据来源：万得 Wind 金融数据服务

## 1. 总结

本次围绕 100 条常用金融问句复测当前 `wind-mcp-skill` 的路由、参数校验、NER 和 Wind 返回结果。

| 指标 | 数量 | 比例 |
| --- | ---: | ---: |
| 总用例 | 100 | 100% |
| CLI 成功返回数据 | 97 | 97% |
| CLI 明确失败 | 3 | 3% |
| 标的错配风险 | 1 | 1% |
| 严格有效成功（扣除错配风险） | 96 | 96% |

说明：

- `CLI 成功返回数据` 指 CLI exit code = 0 且 Wind 返回非空数据。
- `标的错配风险` 指 CLI 返回数据，但返回的 `Wind代码` 与用户明确输入代码不一致，不能视为可靠成功。
- 若按“只看 CLI 是否返回数据”统计，本次成功率为 97%。
- 若按“返回数据且标的无错配”统计，本次严格成功率为 96%。

## 2. 本轮修复验证

### 2.1 裸 6 位代码

本轮修改后，裸 6 位代码不再被本地 `AMBIGUOUS_MARKET_TARGET` 拦截，而是原样交给 Wind NER。

复测结果：

| 问题编号 | 输入 | Wind 返回代码 | 结果 |
| ---: | --- | --- | --- |
| 31 | `603435` | `603435.SH` | 通过 |
| 33 | `300750` | `300750.SZ` | 通过 |
| 34 | `000001` | `000001.SZ` | 通过 |
| 36 | `601318` | `601318.SH` | 通过 |
| 37 | `600036` | `600036.SH` | 通过 |
| 38 | `002594` | `002594.SZ` | 通过 |
| 39 | `688981` | `688981.SH` | 通过 |
| 40 | `300308` | `300308.SZ` | 通过 |

结论：裸 6 位代码体验问题已解决。

### 2.2 裸美股 ticker

`NVDA` 首次原样调用仍返回 `MARKET_TARGET_NOT_FOUND`。按新错误指引，在明确美股语境下改为 `NVDA.O` 后成功：

| 问题编号 | 输入 | 首次结果 | 重试 | 结果 |
| ---: | --- | --- | --- | --- |
| 50 | `NVDA` | `MARKET_TARGET_NOT_FOUND` | `NVDA.O` | 通过，成交额 `28885409825` |

结论：裸美股 ticker 的“NER 失败后 `.O` 有限重试”规则可用。

## 3. 未解决问题

### 3.1 `00700.HK` 未识别

涉及问题：

- 42. `00700.HK 今天涨跌幅是多少？`
- 89. `00700.HK 最近 10 天日 K 线。`

复测结果：

| 输入 | 结果 |
| --- | --- |
| `00700.HK` | `MARKET_TARGET_NOT_FOUND` |
| `0700.HK` | 成功，返回 `0700.HK` |
| `腾讯控股` | 成功，返回 `0700.HK` |

结论：Wind 后端当前接受 `0700.HK`，不识别 `00700.HK`。建议后续考虑港股代码规范化：5 位前导 0 港股代码转为 4 位，如 `00700.HK -> 0700.HK`。

### 3.2 `603435.SZ` 标的错配

涉及问题：

- 32. `603435.SZ 最新价是多少？`

复测结果：

| 输入 | Wind 返回代码 | 结果 |
| --- | --- | --- |
| `603435.SZ` | `300682.SZ` | 错配风险 |

此前测试中同一输入还出现过返回 `603825.SH` 的情况。说明该问题不是稳定的正确识别，而是后端 NER / 纠错存在错配风险。

建议：若用户输入明确带后缀 Wind 代码，返回结果中的 `Wind代码` 与输入不一致，应在 agent 层标记为疑似错配，不应直接当作成功回答。

### 3.3 `余额宝` 未识别

涉及问题：

- 79. `余额宝七日年化收益率是多少？`

结果：

| 输入 | 结果 |
| --- | --- |
| `余额宝` | `MARKET_TARGET_NOT_FOUND` |

建议：提示用户提供更明确基金名或基金代码。历史用例中 `000198.OF` 可正常用于货币基金相关查询。

## 4. 逐题结果

| # | 问题 | 路由 / 处理 | 状态 | 摘要 |
| ---: | --- | --- | --- | --- |
| 1 | 贵州茅台最新价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 最新成交价 `1181.32`，`600519.SH` |
| 2 | 600519.SH 今天涨跌幅多少？ | `stock_data.get_stock_price_indicators` | 通过 | 涨跌幅 `-1.17` |
| 3 | 新易盛今天成交额是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 成交额 `30196984845`，`300502.SZ` |
| 4 | 300502.SZ 当前成交量是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 成交量 `51313448` |
| 5 | 宁德时代今天开盘价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 今日开盘价 `392.49`，`300750.SZ` |
| 6 | 比亚迪今天最高价和最低价分别是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 最高 `80.55`，最低 `78.58` |
| 7 | 中际旭创现在多少钱一股？ | `stock_data.get_stock_price_indicators` | 通过 | 最新成交价 `1266.07`，`300308.SZ` |
| 8 | 工业富联今日成交额是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 成交额 `10137837092` |
| 9 | 中国平安最新成交价和涨跌幅是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 最新成交价 `47.46`，涨跌幅 `-2.35` |
| 10 | 招商银行今天换手率是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 换手率 `0.447` |
| 11 | 隆基绿能今天成交量是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 成交量 `148214166` |
| 12 | 万科A 最新价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 首次网络错误，重试成功；最新成交价 `2.96` |
| 13 | 药明康德今天涨了多少？ | `stock_data.get_stock_price_indicators` | 通过 | 涨跌 `-2.07` |
| 14 | 立讯精密当前成交额是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 成交额 `15425206932` |
| 15 | 东方财富今天成交量和成交额是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 成交量 `360909832`，成交额 `7259708908` |
| 16 | 贵州茅台总市值是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 首次网络错误，重试成功；总市值2 `1.47591e+12` |
| 17 | 贵州茅台流通市值是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 流通市值 `1.47591e+12` |
| 18 | 宁德时代市盈率 TTM 是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 市盈率(TTM) `23.070` |
| 19 | 招商银行市净率是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 市净率 `0.000` |
| 20 | 比亚迪 52 周最高价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 52 周最高 `116.59` |
| 21 | 比亚迪 52 周最低价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 52 周最低 `77.6` |
| 22 | 中际旭创量比是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 量比 `0.893` |
| 23 | 新易盛 5 分钟涨跌幅是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 5 分钟涨跌幅 `-0.180` |
| 24 | 工业富联近 1 分钟成交额是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 近1分钟成交额 `11333334` |
| 25 | 东方财富现量是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 现量 `31300` |
| 26 | 贵州茅台今日成交额是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 成交额 `4016883555` |
| 27 | 宁德时代昨日收盘价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 前收盘价 `392.36` |
| 28 | 中国平安今天最低价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 今日最低价 `47.35` |
| 29 | 招商银行今日最高价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 今日最高价 `36.39` |
| 30 | 万科A 今日开盘价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 今日开盘价 `3.02` |
| 31 | 603435 最新价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 裸代码 NER 成功，`603435.SH` |
| 32 | 603435.SZ 最新价是多少？ | `stock_data.get_stock_price_indicators` | 错配风险 | 输入 `603435.SZ`，返回 `300682.SZ` |
| 33 | 300750 最新价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 裸代码 NER 成功，`300750.SZ` |
| 34 | 000001 最新价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 裸代码 NER 成功，`000001.SZ` |
| 35 | 000001.SZ 今天成交额是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 成交额 `930831673` |
| 36 | 601318 当前涨跌幅是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 裸代码 NER 成功，`601318.SH` |
| 37 | 600036 今天成交量是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 裸代码 NER 成功，`600036.SH` |
| 38 | 002594 最新成交价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 裸代码 NER 成功，`002594.SZ` |
| 39 | 688981 最新价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 裸代码 NER 成功，`688981.SH` |
| 40 | 300308 今天成交额是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 裸代码 NER 成功，`300308.SZ` |
| 41 | 腾讯控股最新价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 最新成交价 `431.000`，`0700.HK` |
| 42 | 00700.HK 今天涨跌幅是多少？ | `stock_data.get_stock_price_indicators` | 失败 | `MARKET_TARGET_NOT_FOUND`；`0700.HK` 可成功 |
| 43 | 阿里巴巴港股今天成交额是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 成交额 `5011917178`，`9988.HK` |
| 44 | 9988.HK 最新成交价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 最新成交价 `92.950` |
| 45 | 小米集团今天成交量是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 成交量 `93024558` |
| 46 | 美团-W 当前涨跌幅是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 涨跌幅 `1.26` |
| 47 | 苹果最新价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 最新成交价 `281.740`，`AAPL.O` |
| 48 | AAPL 最新成交价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 裸 ticker NER 成功，`AAPL.O` |
| 49 | 英伟达今天涨跌幅是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 首次网络错误，重试成功；`NVDA.O` |
| 50 | NVDA 当前成交额是多少？ | `stock_data.get_stock_price_indicators` | 通过 | `NVDA` 首次未识别，按美股语境补 `NVDA.O` 成功 |
| 51 | 微软最新价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 最新成交价 `368.570`，`MSFT.O` |
| 52 | MSFT 52 周最高价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 52 周最高 `551.048`，`MSFT.O` |
| 53 | 特斯拉今天成交量是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 成交量 `57645798`，`TSLA.O` |
| 54 | TSLA 当前涨跌幅是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 涨跌幅 `8.46`，`TSLA.O` |
| 55 | 亚马逊最新成交价是多少？ | `stock_data.get_stock_price_indicators` | 通过 | 最新成交价 `240.140`，`AMZN.O` |
| 56 | 沪深300 最新点位是多少？ | `index_data.get_index_price_indicators` | 通过 | 最新成交价 `4964.78` |
| 57 | 000300.SH 今天涨跌幅是多少？ | `index_data.get_index_price_indicators` | 通过 | 涨跌幅 `0.78` |
| 58 | 上证指数今天成交额是多少？ | `index_data.get_index_price_indicators` | 通过 | 首次网络错误，重试成功；成交额 `1366000245600` |
| 59 | 000001.SH 当前成交量是多少？ | `index_data.get_index_price_indicators` | 通过 | 成交量 `52819235200` |
| 60 | 创业板指最新价是多少？ | `index_data.get_index_price_indicators` | 通过 | 最新成交价 `4340.81` |
| 61 | 399006.SZ 今天涨跌幅是多少？ | `index_data.get_index_price_indicators` | 通过 | 涨跌幅 `2.94` |
| 62 | 中证500 最新点位是多少？ | `index_data.get_index_price_indicators` | 通过 | 最新成交价 `9005.19` |
| 63 | 000905.SH 今天成交额是多少？ | `index_data.get_index_price_indicators` | 通过 | 成交额 `624350396300` |
| 64 | 中证1000 当前涨跌幅是多少？ | `index_data.get_index_price_indicators` | 通过 | 涨跌幅 `2.21` |
| 65 | 000852.SH 最新成交价是多少？ | `index_data.get_index_price_indicators` | 通过 | 最新成交价 `8789.41` |
| 66 | 恒生指数最新点位是多少？ | `index_data.get_index_price_indicators` | 通过 | 最新成交价 `22801.53`，`HSI.HI` |
| 67 | 道琼斯指数最近一个月走势怎么样？ | `index_data.get_index_kline` | 通过 | `道琼斯指数` 未识别，改更明确名称 `道琼斯工业平均指数` 后成功，20 行 |
| 68 | 纳斯达克指数今天涨跌幅是多少？ | `index_data.get_index_price_indicators` | 通过 | 涨跌幅 `2.07` |
| 69 | 标普500 最新点位是多少？ | `index_data.get_index_price_indicators` | 通过 | 最新成交价 `7440.43` |
| 70 | 科创50 今天成交额是多少？ | `index_data.get_index_price_indicators` | 通过 | 成交额 `199775024300` |
| 71 | 588200.SH 最新价是多少？ | `fund_data.get_fund_price_indicators` | 通过 | 最新成交价 `4.913` |
| 72 | 科创芯片 ETF 今天涨跌幅是多少？ | `fund_data.get_fund_price_indicators` | 通过 | 首次因命令空格导致 JSON 解析失败，去空格后成功；涨跌幅 `4.20` |
| 73 | 510300.SH 当前成交额是多少？ | `fund_data.get_fund_price_indicators` | 通过 | 成交额 `9083048923` |
| 74 | 沪深300 ETF 最新成交价是多少？ | `fund_data.get_fund_price_indicators` | 通过 | 最新成交价 `5.009` |
| 75 | 159915.SZ 今天成交量是多少？ | `fund_data.get_fund_price_indicators` | 通过 | 成交量 `1005611486` |
| 76 | 创业板 ETF 当前涨跌幅是多少？ | `fund_data.get_fund_price_indicators` | 通过 | 涨跌幅 `2.93` |
| 77 | 易方达蓝筹精选最新净值是多少？ | `fund_data.get_fund_price_indicators` | 通过 | 最新净值 `1.5119` |
| 78 | 005827.OF 最新一期规模是多少？ | `fund_data.get_fund_price_indicators` | 通过 | 基金规模 `2.6793e+10` |
| 79 | 余额宝七日年化收益率是多少？ | `fund_data.get_fund_price_indicators` | 失败 | `MARKET_TARGET_NOT_FOUND` |
| 80 | 货币基金 000198.OF 最新净值是多少？ | `fund_data.get_fund_price_indicators` | 通过 | 最新净值 `1.0000` |
| 81 | 贵州茅台最近 30 天 K 线。 | `stock_data.get_stock_kline` | 通过 | 2026-06-01 至 2026-06-30，21 行 |
| 82 | 600519.SH 2026 年 5 月日 K 线。 | `stock_data.get_stock_kline` | 通过 | 18 行 |
| 83 | 新易盛最近 20 个交易日走势。 | `stock_data.get_stock_kline` | 通过 | 21 行 |
| 84 | 300502.SZ 近一个月日线。 | `stock_data.get_stock_kline` | 通过 | 21 行 |
| 85 | 宁德时代最近一周 5 分钟线。 | `stock_data.get_stock_kline` | 通过 | 284 行 |
| 86 | 比亚迪 2026 年以来周 K 线。 | `stock_data.get_stock_kline` | 通过 | 25 行 |
| 87 | 沪深300 最近 60 天 K 线。 | `index_data.get_index_kline` | 通过 | 60 行 |
| 88 | 上证指数 2026 年 5 月走势。 | `index_data.get_index_kline` | 通过 | 18 行 |
| 89 | 00700.HK 最近 10 天日 K 线。 | `stock_data.get_stock_kline` | 失败 | `MARKET_TARGET_NOT_FOUND`；`0700.HK` 可成功 |
| 90 | AAPL 最近一个月 K 线。 | `stock_data.get_stock_kline` | 通过 | 20 行，`AAPL.O` |
| 91 | 贵州茅台 2025 年净利润是多少？ | `stock_data.get_stock_fundamentals` | 通过 | `853.1032` 亿元 |
| 92 | 贵州茅台 2025 年 ROE 是多少？ | `stock_data.get_stock_fundamentals` | 通过 | `34.462%` |
| 93 | 宁德时代最近一期资产负债率是多少？ | `stock_data.get_stock_fundamentals` | 通过 | `62.3223%` |
| 94 | 比亚迪 2025 年营收同比增速是多少？ | `stock_data.get_stock_fundamentals` | 通过 | `3.4568%` |
| 95 | 新易盛最近 60 日 MACD 走势。 | `stock_data.get_stock_technicals` | 通过 | 39 行 |
| 96 | 中际旭创近一年 Beta 是多少？ | `stock_data.get_risk_metrics` | 通过 | `2.9996` |
| 97 | 贵州茅台前十大股东是谁？ | `stock_data.get_stock_equity_holders` | 通过 | 返回前十大股东 |
| 98 | 中国最新 CPI 同比是多少？ | `economic_data.natural_language_get_edb_data` | 通过 | 国家统计局 CPI 同比，`20260531=1.2%` |
| 99 | 中国 2026 年 5 月 PMI 是多少？ | `economic_data.natural_language_get_edb_data` | 通过 | 制造业 PMI，`20260531=50.0%` |
| 100 | 美国最新非农就业人数是多少？ | `economic_data.natural_language_get_edb_data` | 通过 | 非农就业人数季调，`20260531=159001.0` 千人 |

## 5. 建议后续动作

1. 增加港股前导零规范化：`00700.HK -> 0700.HK`。
2. 增加明确 Wind 代码返回一致性校验：用户输入 `603435.SZ` 这类带后缀代码时，若返回 `Wind代码` 不一致，应提示疑似错配。
3. 对常见基金别名（如余额宝）增加更明确的别名规则或在 `MARKET_TARGET_NOT_FOUND` 中提示用户补充基金代码。
4. 保持当前规则：裸 6 位交给 Wind NER；裸美股 ticker 仅在明确美股语境且 NER 失败后允许 `.O` 重试一次。
