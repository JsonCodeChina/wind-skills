# 行情指标字段表 (`indexes` 参数取值)

**适用工具**:

- `get_stock_price_indicators` (股票/A 股/港股)
- `get_fund_price_indicators` (基金/ETF)

两个工具的 `indexes` 取值**完全相同**(后端共用同一份 enum,schema 列出 694 项,本表为实测可用的 689 项)。本表是**唯一权威清单**,不在表内的字段不要传。

## 怎么用

1. 先按用户问题定位**类别**(目录里挑一两个相关 H2)
2. 在该类别表里挑**精确字段名**(英文大小写要对)
3. 多个字段用**英文逗号** `,` 拼成一个字符串传给 `indexes`
4. 字段表里**没有**的概念 → 告诉用户"该指标不在 Wind 行情字段范围内",**不要猜名字**

## 品种适用 hint(enum 可传 ≠ 一定有数据)

`indexes` enum 是两个工具共享的**全集**,但**不是所有字段对所有标的都返数据**。错配会静默返空,不要误判为"工具坏了"。

| 类别 | 适用品种 |
|---|---|
| 元数据 / 基础行情 / 盘口报价 / L2 经纪商 / 历史比较 / 多周期涨跌幅 / 流动性 / 技术指标 / 盘中异动 / 资金流向 / 盘前盘后 | **股票 + 基金通用** |
| 估值 / 市值 / 股息率 | **股票为主**(基金的 PE/PB 极少有意义) |
| 财务基本面 / 评级 | **股票专属**(传给基金会返空) |
| 期货 / 期权 / 权证 / 可转债 / 债券价格-收益率多形态 | **对应品种专属**(传给股票/基金返空) |
| 基金 / 指数 | **对应品种专属** |
| 新三板/做市商/非匹配 / BBQ 询价 | **特定市场专属**,绝大多数普通查询用不上 |

## ⚠️ 字段陷阱(严格区分大小写,不要"自动纠正")

后端字段命名风格混杂,模型常踩的坑:

1. **单字段名容易误用**:`Type` 是**权证类型**(不是通用类型),`Shares` 是**基金份额**(不是股本)。
2. **后端拼写错原样照传**(改了反而调用失败):
   - `WARRENTBULLTOTAL`(本应 WARRANT,但后端就这么拼)= 牛证数量
   - `PE_PORJECTED`(本应 PROJECTED)= 市盈率预测
   - `PUREBEBTVALUE`(本应 PUREBEBT 应是 PUREBOND/DEBT,后端就这样)= 可转债纯债价值
3. **PascalCase / camelCase 混杂**(大写字母位置错就 fail):`TopBuyAmount`、`IPOPrice`、`IPODate`、`Shares`、`Estimatechange`、`BBQBidPrice`、`WarrantLastTradingDay`、`MaturityGapDays`、`CouponRate`、`ConvertibleBondType`、`Yield_CNBD_Maturity`、`ImplicitRatingKey_CSI` 等。
4. **描述重复 / 歧义**:`LSEXPECTATIONS` 和 `VIND_L2_AMOUNT_LARGE_OUT` 描述都是 "L1大卖单量",选哪个不知道——遇到此类**告诉用户两者并存让 ta 选**,或两个都传。
5. **schema 列了不代表后端实现了**:Wind schema 描述与实际实现可能脱节,本表已剔除 5 个实测不识别字段(`DividendYieldRatioYear` / `CHANGE5YEARS` / `CHANGEIPO` / `ETFBuyNumber` / `ETFSellNumber`),其它字段也可能有同类滞后。**遇到 `字段不识别 / 字段名不存在` 报错时不要重试不同拼写**,直接改走 NL 类工具兜底:
   - 多周期涨跌幅 / 历史走势 / 资金流时间序列 → `get_stock_technicals` (`{question}` 自然语言)
   - 财务 / 估值衍生指标 → `get_stock_fundamentals` / `get_fund_financials`
   - 跨域综合 → `analytics_data.get_financial_data`

**铁律**:从本表里**复制粘贴**字段名,不要凭印象敲;不要"自动纠正"成你以为更合理的拼写;字段不识别就**立刻切 NL**,不要在快照工具里反复试拼写。

## 目录

- [元数据 / 标识](#元数据--标识) — 18 个
- [基础行情 (价/量/额/涨跌/状态)](#基础行情-价量额涨跌状态) — 30 个
- [盘口报价 (买卖档/价差/委托总量)](#盘口报价-买卖档价差委托总量) — 44 个
- [L2 经纪商档位](#L2-经纪商档位) — 24 个
- [历史比较 / 多周期涨跌幅](#历史比较--多周期涨跌幅) — 22 个
- [估值 / 市值 / 股息率](#估值--市值--股息率) — 10 个
- [财务基本面 / 评级](#财务基本面--评级) — 14 个
- [流动性 / 活跃度](#流动性--活跃度) — 10 个
- [技术指标 (MACD/KDJ/RSI/MA/BOLL/RPS)](#技术指标-MACDKDJRSIMABOLLRPS) — 29 个
- [盘中异动 / 涨跌停 / 突破](#盘中异动--涨跌停--突破) — 22 个
- [资金流向(机构/大户/中户/散户)](#资金流向机构大户中户散户) — 84 个
- [盘前盘后](#盘前盘后) — 31 个
- [期货专属](#期货专属) — 16 个
- [期权专属](#期权专属) — 57 个
- [权证 / 可转债](#权证--可转债) — 30 个
- [债券价格/收益率多形态](#债券价格收益率多形态) — 154 个
- [基金专属](#基金专属) — 39 个
- [指数专属](#指数专属) — 17 个
- [新三板/做市商/非匹配报价](#新三板做市商非匹配报价) — 25 个
- [BBQ 询价/中介](#BBQ-询价中介) — 13 个

## 元数据 / 标识

| 字段名 | 中文释义 |
| --- | --- |
| `LOTSIZE` | 每手股数 |
| `WINDCODE` | 代码 |
| `NAME` | 中文简称 |
| `WINDTYPE` | 品种类型 |
| `MKTNAME` | 交易所 |
| `CURRENCYCODE` | 币种 |
| `IPOPrice` | 发行价格 |
| `IPODate` | 上市日期 |
| `TERM` | 期限(年) |
| `REGISTRATION` | 是否注册制 |
| `VIE` | 是否具有协议控制框架 |
| `LISTINITIAL` | 是否初期 |
| `BUYUNDERLYING` | 是否融资标的 |
| `SELLUNDERLYING` | 是否融券标的 |
| `MANAGEMENTCOMPANY` | 管理公司 |
| `INDUSTRY` | Wind四级行业 |
| `EXTNAME` | 扩展简称 |
| `RO` | 一份ADR代表多少比例 |

## 基础行情 (价/量/额/涨跌/状态)

| 字段名 | 中文释义 |
| --- | --- |
| `TRADINGDATE` | 交易日期 |
| `TIME` | 交易时间 |
| `MATCH` | 最新价 |
| `PRECLOSE` | 前收价 |
| `OPEN` | 开盘价 |
| `HIGH` | 最高价 |
| `LOW` | 最低价 |
| `VOLUME` | 总成交量 |
| `DELTAAMOUNT` | 现额 |
| `DELTAVOLUME` | 现量 |
| `TURNOVER` | 总成交额 |
| `MATCHITEMS` | 分时成交总笔数 |
| `AVERAGEPRICE` | 均价 |
| `CHANGE` | 涨跌 |
| `CHANGERANGE` | 涨跌幅 |
| `CHANGERANGE5MIN` | 5分钟涨跌幅 |
| `DELTAMATCHITEMS` | 现手笔数 |
| `TRADINGSTATUS` | 交易状态 |
| `HIGHLIMIT` | 涨停价 |
| `LOWLIMIT` | 跌停价 |
| `WEIGHTEDAVERAGEPRICE` | 加权平均价 |
| `WEIGHTEDPRECLOSE` | 前加权价 |
| `LATESTMATCH` | 逐笔成交价格 |
| `DEALDIRECTION` | 逐笔成交方向 |
| `OPENCHANGERANGE` | 开盘价涨跌幅 |
| `OPENCHANGE` | 开盘价涨跌 |
| `VIRTUALVOL` | 虚拟成交量 |
| `VIRTUALTURNOVER` | 虚拟成交额 |
| `CHANGECLOSE` | 收盘涨跌 |
| `CHANGERANGECLOSE` | 收盘涨跌幅 |

## 盘口报价 (买卖档/价差/委托总量)

| 字段名 | 中文释义 |
| --- | --- |
| `BIDPRC1` | 买1价 |
| `BIDPRC2` | 买2价 |
| `BIDPRC3` | 买3价 |
| `BIDPRC4` | 买4价 |
| `BIDPRC5` | 买5价 |
| `BIDPRC6` | 买6价 |
| `BIDPRC7` | 买7价 |
| `BIDPRC8` | 买8价 |
| `BIDPRC9` | 买9价 |
| `BIDPRC10` | 买10价 |
| `ASKPRC1` | 卖1价 |
| `ASKPRC2` | 卖2价 |
| `ASKPRC3` | 卖3价 |
| `ASKPRC4` | 卖4价 |
| `ASKPRC5` | 卖5价 |
| `ASKPRC6` | 卖6价 |
| `ASKPRC7` | 卖7价 |
| `ASKPRC8` | 卖8价 |
| `ASKPRC9` | 卖9价 |
| `ASKPRC10` | 卖10价 |
| `BIDVOL1` | 买1量 |
| `BIDVOL2` | 买2量 |
| `BIDVOL3` | 买3量 |
| `BIDVOL4` | 买4量 |
| `BIDVOL5` | 买5量 |
| `BIDVOL6` | 买6量 |
| `BIDVOL7` | 买7量 |
| `BIDVOL8` | 买8量 |
| `BIDVOL9` | 买9量 |
| `BIDVOL10` | 买10量 |
| `ASKVOL1` | 卖1量 |
| `ASKVOL2` | 卖2量 |
| `ASKVOL3` | 卖3量 |
| `ASKVOL4` | 卖4量 |
| `ASKVOL5` | 卖5量 |
| `ASKVOL6` | 卖6量 |
| `ASKVOL7` | 卖7量 |
| `ASKVOL8` | 卖8量 |
| `ASKVOL9` | 卖9量 |
| `ASKVOL10` | 卖10量 |
| `SpreadPrice` | 最小价差 |
| `TOTALBIDVOLUME` | 外盘 |
| `TOTALASKVOLUME` | 内盘 |
| `ASKBIDSPREAD` | 买卖价差 |

## L2 经纪商档位

| 字段名 | 中文释义 |
| --- | --- |
| `BIDORD1` | 买盘经纪商数1 |
| `BIDORD2` | 买盘经纪商数2 |
| `BIDORD3` | 买盘经纪商数3 |
| `BIDORD4` | 买盘经纪商数4 |
| `BIDORD5` | 买盘经纪商数5 |
| `ASKORD1` | 卖盘经纪商数1 |
| `ASKORD2` | 卖盘经纪商数2 |
| `ASKORD3` | 卖盘经纪商数3 |
| `ASKORD4` | 卖盘经纪商数4 |
| `ASKORD5` | 卖盘经纪商数5 |
| `BIDORD6` | 买盘经纪商数6 |
| `BIDORD7` | 买盘经纪商数7 |
| `BIDORD8` | 买盘经纪商数8 |
| `BIDORD9` | 买盘经纪商数9 |
| `BIDORD10` | 买盘经纪商数10 |
| `ASKORD6` | 卖盘经纪商数6 |
| `ASKORD7` | 卖盘经纪商数7 |
| `ASKORD8` | 卖盘经纪商数8 |
| `ASKORD9` | 卖盘经纪商数9 |
| `ASKORD10` | 卖盘经纪商数10 |
| `BIDORDER_TOTALVOLUME_L2` | 委托总买量 |
| `ASKORDER_TOTALVOLUME_L2` | 委托总卖量 |
| `BIDORDER_TOTALVOLUME` | 委托买入总量 |
| `ASKORDER_TOTALVOLUME` | 委托卖出总量 |

## 历史比较 / 多周期涨跌幅

| 字段名 | 中文释义 |
| --- | --- |
| `PRE5CLOSE` | 5日前收盘价 |
| `PRE10CLOSE` | 10日前收盘价 |
| `PRE20CLOSE` | 20日前收盘价 |
| `PRE60CLOSE` | 60日前收盘价 |
| `PRE120CLOSE` | 120日前收盘价 |
| `PRE250CLOSE` | 250日前收盘价 |
| `LASTYEARCLOSE` | 去年年底收盘价 |
| `AVEVOLUMELAST5DAYS` | 最近5日平均量 |
| `AVEVOLUMELAST30DAYS` | 最近30日平均量 |
| `CHANGE5DAYS` | 5日涨跌幅 |
| `CHANGE10DAYS` | 10日涨跌幅 |
| `CHANGE20DAYS` | 20日涨跌幅 |
| `CHANGE60DAYS` | 60日涨跌幅 |
| `CHANGE120DAYS` | 120日涨跌幅 |
| `CHANGE250DAYS` | 250日涨跌幅 |
| `CHANGEYEARBEGIN` | 年初至今涨跌幅 |
| `WEEK52HIGH` | 52周最高 |
| `WEEK52LOW` | 52周最低 |
| `CHANGE3YEARS` | 3年涨跌幅 |
| `CHANGE10YEARS` | 10年涨跌幅 |
| `CHANGE20YEARS` | 20年涨跌幅 |
| `CHANGE30YEARS` | 30年涨跌幅 |

## 估值 / 市值 / 股息率

| 字段名 | 中文释义 |
| --- | --- |
| `PB` | 市净率 |
| `PB_MRQ` | 市净率LF |
| `CAPITALMARKETVALUE` | 总市值1 |
| `LISTEDMARKETVALUE` | 流通市值 |
| `PE_TTM` | 市盈率TTM |
| `PE_LYR` | 市盈率LastYear |
| `PE_PORJECTED` | 市盈率预测 |
| `CAPITALMARKETVALUE2` | 总市值2 |
| `DIVIDENDYIELDRATIO` | 股息率 |
| `PFFO` | P/FFO |

## 财务基本面 / 评级

| 字段名 | 中文释义 |
| --- | --- |
| `CURRENCYCAPITAL` | 流通股本 |
| `TOTALCAPITAL` | 总股本 |
| `NETPROFIT` | 净利润 |
| `EPS_TTM_LC` | 每股收益TTM |
| `FORECASTEARNINGSPERSHARE1` | 每股收益预测值 |
| `NETASSETS` | 净资产 |
| `NETASSETSPERSHARE` | 每股净资产 |
| `TOTALASSETS` | 总资产 |
| `FORECASTEARNINGSPERSHARE2` | 每股收益预测值2 |
| `RATING` | 评级 |
| `RATINGAGENCIESCOUNT` | 评级机构总数 |
| `LATESTANNUALREPORTYEAR` | 最近年报的年份 |
| `PROFIT` | 是否盈利 |
| `VOTINGRIGHTS` | 是否存在投票权差异 |

## 流动性 / 活跃度

| 字段名 | 中文释义 |
| --- | --- |
| `CHANGEHANDRATE` | 换手率 |
| `LIANGBI` | 量比 |
| `WEIBI` | 委比 |
| `FLUCTUATION` | 振幅 |
| `WEICHA` | 委差 |
| `TURNOVER7DAYSAVERAGE` | 近7日平均成交额 |
| `TURNOVER1MIN` | 最近1分钟成交额 |
| `TURNOVER3MIN` | 最近3分钟成交额 |
| `TURNOVER5MIN` | 最近5分钟成交额 |
| `WLIANGBI` | W量比 |

## 技术指标 (MACD/KDJ/RSI/MA/BOLL/RPS)

| 字段名 | 中文释义 |
| --- | --- |
| `MACD` | MACD |
| `MACD_DIFF` | MACD_DIFF |
| `KDJ_K` | KDJ_K |
| `KDJ_D` | KDJ_D |
| `KDJ_J` | KDJ_J |
| `RSI6` | RSI6 |
| `RSI12` | RSI12 |
| `SAR` | SAR |
| `BOLL_MID` | BOLL_MID |
| `BOLL_UPPER` | BOLL_UPPER |
| `BOLL_LOWER` | BOLL_LOWER |
| `MA_5` | MA_5 |
| `MA_10` | MA_10 |
| `MA_20` | MA_20 |
| `MA_60` | MA_60 |
| `MA_120` | MA_120 |
| `MA_250` | MA_250 |
| `BIAS5` | BIAS5 |
| `CCI14` | CCI14 |
| `CR26` | CR26 |
| `PSY12` | PSY12 |
| `WR10` | WR10 |
| `B36` | B36 |
| `AR26` | AR26 |
| `BR26` | BR26 |
| `RPS_5` | RPS_5 |
| `RPS_20` | RPS_20 |
| `RPS_120` | RPS_120 |
| `RPS_250` | RPS_250 |

## 盘中异动 / 涨跌停 / 突破

| 字段名 | 中文释义 |
| --- | --- |
| `HISTORICALHIGHDAYS` | 突破创新高天数 |
| `LINGXIAN` | 领先指标 |
| `SERIESUPDAYS` | 连涨天数 |
| `PREVDAYCHANGERANGE` | 昨日涨跌幅指标 |
| `UPSTAYINGTIME` | 涨停时间 |
| `DOWNSTAYINGTIME` | 跌停时间 |
| `ROCKETING` | 当天火箭发射次数 |
| `HIGHDIVING` | 当天高台跳水次数 |
| `RISETOP` | 当天封涨停次数 |
| `DROPBOTTOM` | 当天封跌停次数 |
| `OPENTOP` | 当天打开涨停次数 |
| `OPENBOTTOM` | 当天打开跌停次数 |
| `PERCENT3UP` | 上涨越过3%次数 |
| `PERCENT3DOWN` | 下跌击穿-3%次数 |
| `RECENTLYHIGH` | 当天创20日新高次数 |
| `RECENTLYLOW` | 当天创20日新低次数 |
| `MACDGOLDENCROSS` | 当天MACD金叉次数 |
| `MACDDEADCROSS` | 当天MACD死叉次数 |
| `TopBuyAmount` | 涨停封单额 |
| `TopBuyRatio` | 涨停封单额占成交额比率 |
| `LimitUpBuyStrength` | 涨停封单比 |
| `LimitDownSellStrength` | 跌停封单比 |

## 资金流向(机构/大户/中户/散户)

| 字段名 | 中文释义 |
| --- | --- |
| `IND_L2_VOLUME1_IN` | 当日机构买入成交量 |
| `IND_L2_VOLUME1_OUT` | 当日机构卖出成交量 |
| `IND_L2_VOLUME2_IN` | 当日大户买入成交量 |
| `IND_L2_VOLUME2_OUT` | 当日大户卖出成交量 |
| `IND_L2_VOLUME3_IN` | 当日中户买入成交量 |
| `IND_L2_VOLUME3_OUT` | 当日中户卖出成交量 |
| `IND_L2_VOLUME4_IN` | 当日散户买入成交量 |
| `IND_L2_VOLUME4_OUT` | 当日散户卖出成交量 |
| `IND_L2_VOLUME1_NETIN` | 机构净买入总成交量 |
| `IND_L2_VOLUME2_NETIN` | 大户净买入总成交量 |
| `IND_L2_VOLUME3_NETIN` | 中户净买入总成交量 |
| `IND_L2_VOLUME4_NETIN` | 散户净买入总成交量 |
| `ORDER1_IN` | 当日机构买单总数 |
| `ORDER1_OUT` | 当日机构卖单总数 |
| `ORDER2_IN` | 当日大户买单总数 |
| `ORDER2_OUT` | 当日大户卖单总数 |
| `ORDER3_IN` | 当日中户买单总数 |
| `ORDER3_OUT` | 当日中户卖单总数 |
| `ORDER4_IN` | 当日散户买单总数 |
| `ORDER4_OUT` | 当日散户卖单总数 |
| `L2_MF_DAY` | 该日资金净流入占比 |
| `L2_MONEY1_NETIN` | 该日机构资金净流入 |
| `L2_MONEY2_NETIN` | 该日大户资金净流入 |
| `L2_MONEY3_NETIN` | 该日中户资金净流入 |
| `L2_MONEY4_NETIN` | 该日散户资金净流入 |
| `L2_CONT_NETIN_DAYS` | 连红天数 |
| `L2_MONEY_1D_NETIN` | 一日流入资金额 |
| `L2_MONEY_1D_NETIN_RATIO` | 一日流入资金率 |
| `L2_MONEY_5D_NETIN` | 五日流入资金额 |
| `L2_MONEY_5D_NETIN_RATIO` | 五日流入资金率 |
| `L2_MONEY_5D_NETIN_DAYS` | 五日流入资金天数 |
| `L2_MONEY_10D_NETIN` | 十日流入资金额 |
| `L2_MONEY_10D_NETIN_RATIO` | 十日流入资金率 |
| `L2_MONEY_10D_NETIN_DAYS` | 十日流入资金天数 |
| `L2_MONEY_20D_NETIN` | 20日流入资金额 |
| `L2_MONEY_20D_NETIN_RATIO` | 20日流入资金率 |
| `L2_MONEY_20D_NETIN_DAYS` | 20日流入资金天数 |
| `L2_MONEY_60D_NETIN` | 60日流入资金额 |
| `L2_MONEY_60D_NETIN_RATIO` | 60日流入资金率 |
| `L2_MONEY_60D_NETIN_DAYS` | 60日流入资金天数 |
| `L2_MONEY_3D_NETIN` | 3日净流入额 |
| `L2_MONEY_3D_NETIN_DAYS` | 3日净流入天数 |
| `VIND_L2_AMOUNT1_IN` | 当日机构买入成交额 |
| `VIND_L2_AMOUNT1_OUT` | 当日机构卖出成交额 |
| `VIND_L2_AMOUNT2_IN` | 当日大户买入成交额 |
| `VIND_L2_AMOUNT2_OUT` | 当日大户卖出成交额 |
| `VIND_L2_AMOUNT3_IN` | 当日中户买入成交额 |
| `VIND_L2_AMOUNT3_OUT` | 当日中户卖出成交额 |
| `VIND_L2_AMOUNT4_IN` | 当日散户买入成交额 |
| `VIND_L2_AMOUNT4_OUT` | 当日散户卖出成交额 |
| `HUGEBUYAMOUNT` | 机构主买入金额 |
| `BIGBUYAMOUNT` | 大户主买入金额 |
| `MIDBUYAMOUNT` | 中户主买入金额 |
| `SMALLBUYAMOUNT` | 散户主买入金额 |
| `HUGEBUYVOLUME` | 机构主买入总量 |
| `BIGBUYVOLUME` | 大户主买入总量 |
| `MIDBUYVOLUME` | 中户主买入总量 |
| `SMALLBUYVOLUME` | 散户主买入总量 |
| `HUGESELLAMOUNT` | 机构主卖出金额 |
| `BIGSELLAMOUNT` | 大户主卖出金额 |
| `MIDSELLAMOUNT` | 中户主卖出金额 |
| `SMALLSELLAMOUNT` | 散户主卖出金额 |
| `HUGESELLVOLUME` | 机构主卖出总量 |
| `BIGSELLVOLUME` | 大户主卖出总量 |
| `MIDSELLVOLUME` | 中户主卖出总量 |
| `SMALLSELLVOLUME` | 散户主卖出总量 |
| `BUYTOTALAMOUNT` | 主买总额 |
| `BUYTOTALVOLUME` | 主买总量 |
| `SELLTOTALAMOUNT` | 主卖总额 |
| `SELLTOTALVOLUME` | 主卖总量 |
| `CAPITALFLOWSRATIO` | 资金流向占比(量) |
| `NETCAPITALINFLOWVOLUME` | 资金净流入量 |
| `NETCAPITALINFLOWAMOUNT` | 资金净流入金额 |
| `CAPITALFLOWRATIOAMOUNT` | 资金流向占比(金额) |
| `L2_MONEYFLOW_NETIN_RATIO` | L1当日资金流入率 |
| `VIND_L2_AMOUNT_LARGE_IN` | L1大买单量 |
| `VIND_L2_AMOUNT_LARGE_OUT` | L1大卖单量 (VIND_L2_AMOUNT_LARGE_OUT) |
| `LSEXPECTATIONS` | L1大卖单量 (LSEXPECTATIONS) |
| `MAINFORCEBUYORDER` | 当天主力挂买总量 |
| `MAINFORCESELLORDER` | 当天主力挂卖总量 |
| `MAINFORCECANCELBUY` | 当天主力撤买总量 |
| `MAINFORCECANCELSELL` | 当天主力撤卖总量 |
| `L2_MONEY_30D_NETIN_DAYS` | 商品资金流向：30日流入天数 |
| `L2_MONEY_30D_NETIN` | 商品资金流向：30日总流入额 |

## 盘前盘后

| 字段名 | 中文释义 |
| --- | --- |
| `BEFOREPRICE` | 盘前最新价 |
| `BEFORECHANGE` | 盘前涨跌 |
| `BEFORECHANGERATIO` | 盘前涨跌幅 |
| `BEFOREVOLUME` | 盘前成交量 |
| `AFTERPRICE` | 盘后最新价 |
| `AFTERCHANGE` | 盘后涨跌 |
| `AFTERCHANGERATIO` | 盘后涨跌幅 |
| `AFTERVOLUME` | 盘后成交量 |
| `PRETIME` | 盘前交易时间 |
| `AFTERTRADETIME` | 盘后交易时间 |
| `AFTERDELTAVOLUME` | 盘后交易成交量 |
| `PREAMOUNT` | 盘前模拟成交额 |
| `PRE5MINCHANGERATE` | 期货报价单位 盘前涨速 |
| `PREFLUCTUATION` | 盘前振幅 |
| `PREWEIBI` | 盘前委比 |
| `PREUPTOTAL` | 盘前上涨家数 |
| `PREDOWNTOTAL` | 盘前下跌家数 |
| `PRESAMETOTAL` | 盘前平牌家数 |
| `PREWEICHA` | 盘前委差 |
| `PREBIDPRC1` | 盘前买1 |
| `PREBIDPRC2` | 盘前买2 |
| `PREASKPRC1` | 盘前卖1 |
| `PREASKPRC2` | 盘前卖2 |
| `PREBIDVOL1` | 盘前买一量 |
| `PREBIDVOL2` | 盘前买二量 |
| `PREASKVOL1` | 盘前卖一量 |
| `PREASKVOL2` | 盘前卖二量 |
| `AFTERMATCHITEMS` | 盘后成交笔数 |
| `AFTERTURNOVER` | 盘后成交额 |
| `AUCTIONCHANGERATIO` | 竞价涨跌幅 |
| `UNMATCHEDVOLUME` | 盘前未匹配量 |

## 期货专属

| 字段名 | 中文释义 |
| --- | --- |
| `SETTLEMENT` | 结算价 |
| `PRESETTLEMENT` | 前结算价 |
| `POSITION` | 持仓量 |
| `PREPOSITION` | 前持仓量 |
| `POSITIONCHANGE` | 持仓量变化 |
| `ESTIMATESETTLE` | 预估结算价 |
| `DAILYPOSITIONCHANGE` | 日增仓 |
| `SETTLEDATE` | 掉期到期日 |
| `DELIVERYMONTH` | 期货交割月份 |
| `POSITIONCHANGERANGE` | 日增仓比 |
| `NETBULLPOSITION` | 多头主买 |
| `NETBEARPOSITION` | 空头主买 |
| `BULLBEARPOSITION` | 双头开仓 |
| `MONEYPOSITION` | 每日资金持仓 |
| `BULLRATIO` | 多头主买比率 |
| `BEARRATIO` | 空头主买比率 |

## 期权专属

| 字段名 | 中文释义 |
| --- | --- |
| `IMPLIEDVOLATILITY` | 隐含波动率 |
| `STRIKERPRICE` | 行权价格 |
| `INTRINSICVALUE` | 内在价值 |
| `TIMEVALUE` | 时间价值 |
| `INOUT` | 价内外程度 |
| `DELTA` | DELTA |
| `GAMA` | GAMA |
| `VEGA` | VEGA |
| `THETA` | THETA |
| `RHO` | RHO |
| `STRIKERRATIO` | 行权比例 |
| `VSPREAD` | 期现差 (VSPREAD) |
| `OPTIONVOLUME` | 期权成交量 |
| `VOLUMEPCR` | 成交量PCR |
| `OPTIONPOSITION` | 期权持仓量 |
| `IMPLIEDVOLATILITY_BID1` | 买1隐含波动率 |
| `IMPLIEDVOLATILITY_BID2` | 买2隐含波动率 |
| `IMPLIEDVOLATILITY_BID3` | 买3隐含波动率 |
| `IMPLIEDVOLATILITY_BID4` | 买4隐含波动率 |
| `IMPLIEDVOLATILITY_BID5` | 买5隐含波动率 |
| `IMPLIEDVOLATILITY_BID6` | 买6隐含波动率 |
| `IMPLIEDVOLATILITY_BID7` | 买7隐含波动率 |
| `IMPLIEDVOLATILITY_BID8` | 买8隐含波动率 |
| `IMPLIEDVOLATILITY_BID9` | 买9隐含波动率 |
| `IMPLIEDVOLATILITY_BID10` | 买10隐含波动率 |
| `IMPLIEDVOLATILITY_ASK1` | 卖1隐含波动率 |
| `IMPLIEDVOLATILITY_ASK2` | 卖2隐含波动率 |
| `IMPLIEDVOLATILITY_ASK3` | 卖3隐含波动率 |
| `IMPLIEDVOLATILITY_ASK4` | 卖4隐含波动率 |
| `IMPLIEDVOLATILITY_ASK5` | 卖5隐含波动率 |
| `IMPLIEDVOLATILITY_ASK6` | 卖6隐含波动率 |
| `IMPLIEDVOLATILITY_ASK7` | 卖7隐含波动率 |
| `IMPLIEDVOLATILITY_ASK8` | 卖8隐含波动率 |
| `IMPLIEDVOLATILITY_ASK9` | 卖9隐含波动率 |
| `IMPLIEDVOLATILITY_ASK10` | 卖10隐含波动率 |
| `OPTION_VALUESTATUS` | 期权价值状态 |
| `MARGIN` | 保证金 |
| `NORISKRATE` | 无风险利率 |
| `IMPLIEDVOLATILITYPREV` | 前收价对应隐含波动率 |
| `IMPLIEDVOLATILITYCHANGERANGE` | 隐含波动率涨跌幅 |
| `TIMEVALUES` | 时间价值(标的) |
| `IMPLIEDVOLATILITYMID` | 中间价对应隐含波动率 |
| `PUTVOLUME` | 认沽成交量 |
| `CALLVOLUME` | 认购成交量 |
| `CALLPOSITION` | 认购持仓量 |
| `PUTPOSITION` | 认沽持仓量 |
| `CALLTURNOVER` | 认沽期权成交额 |
| `PUTTURNOVER` | 认购期权成交额 |
| `DELTACASH` | Delta成交价 |
| `GAMACASH` | Gamma成交价 |
| `FSSPREAD` | 期现差 (FSSPREAD) |
| `VEGACASH` | Vega成交价 |
| `THETACASH` | Theta成交价 |
| `RHOCASH` | RHO成交价 |
| `IMPLIEDPAYOUT` | 隐含分红率 |
| `ASKBIDSPREADMID` | 期权相对价差 |
| `GAMA1PCT` | Gamma1Pct |

## 权证 / 可转债

| 字段名 | 中文释义 |
| --- | --- |
| `CALLPRICE` | 回收价 |
| `STOCKCHANGEHANDRATE` | 正股换手率 |
| `WARRANTPRICE` | 权证价格 |
| `CONVERSIONPRICE` | 转股价格 |
| `CONVERSIONRATIO` | 转股比例 |
| `CONVERSIONVALUE` | 转换价值 |
| `OVERFLOWRATIO` | 转股溢价率 |
| `ARBITRAGESPACE` | 套利空间 |
| `REMAININGCIRCULATION` | 剩余流通量/债券余额 |
| `RemainderRatio` | 剩余流通量占比 |
| `WarrantPCR` | 购沽成交比 |
| `THEORETICALPRICE` | 理论价格 |
| `WARRANTOVERFLOWRATIO` | 权证溢价率 |
| `LEVELTIMES` | 杠杆倍数 |
| `ACTUALLEVELTIMES` | 实际杠杆倍数 |
| `Type` | 权证类型 |
| `StrikerType` | 行权类型 |
| `WARRANTEXERCISEDATE` | 到期日 |
| `WARRANTSTOCKPRICE` | 正股价格 |
| `WARRANTSTOCKRANGE` | 正股涨跌幅 |
| `RemainDay` | 剩余天数 |
| `WarrantLastTradingDay` | 权证最后交易日 |
| `Remainder` | 权证余额 |
| `PREMIUMPB` | 可转债纯债溢价率 |
| `PJDJ` | 可转债平价底价/平底溢价率 |
| `ConvertibleBondType` | 可转债类型 |
| `PUREBEBTVALUE` | 可转债纯债价值 |
| `WARRENTBULLTOTAL` | 牛证数量 |
| `WARRANTBEARTOTAL` | 熊证数量 |
| `WARRANTPRICEDIFF` | 距回收价 |

## 债券价格/收益率多形态

| 字段名 | 中文释义 |
| --- | --- |
| `FP_NEWPRICE` | 全价最新价 |
| `NP_NEWPRICE` | 净值最新价 |
| `YTM_NEWPRICE` | 收益率最新价 |
| `AI` | 应计利息 |
| `REMAININGYEARS` | 剩余期限 (REMAININGYEARS) |
| `MACAULAYDURATION` | 麦氏久期 |
| `MODIFIEDDURATION` | 修正久期 |
| `CONVEXITY` | 凸性 |
| `LATESTISSURERCREDITRATING` | 长期信用评级 |
| `LATESTCREDIT` | 短期信用评级 |
| `FP_PREVCLOSE` | 全价前收价 |
| `PreAveragePriceYTM` | 前加权均价收益率 |
| `TODAYOPEN_YTM` | 开盘收益率 |
| `TODAYHIGH_YTM` | 最高收益率 |
| `TODAYLOW_YTM` | 最低收益率 |
| `TODAYOPEN_FP` | 开盘价全价 |
| `TODAYOPEN_NP` | 开盘价净价 |
| `TODAYHIGH_FP` | 最高价全价 |
| `TODAYHIGH_NP` | 最高价净价 |
| `TODAYLOW_FP` | 最低价全价 |
| `TODAYLOW_NP` | 最低价净价 |
| `PREVCLOSE_NP` | 净价前收 |
| `PREVCLOSE_YTM` | 收益率前收 |
| `AVERAGEPRICEYTM` | 均价收益率 |
| `COUPON` | 当期票息 |
| `YTMBP5Day` | 5日涨跌BP(到期收益率) |
| `YTMBP10Day` | 10日涨跌BP(到期收益率) |
| `YTMBP20Day` | 20日涨跌BP(到期收益率) |
| `YTMBP60Day` | 60日涨跌BP(到期收益率) |
| `YTMBP120Day` | 120日涨跌BP(到期收益率) |
| `YTMBP250Day` | 250日涨跌BP(到期收益率) |
| `BIDPRICEYTM1` | 买1价对应收益率 |
| `BIDPRICEYTM2` | 买2价对应收益率 |
| `BIDPRICEYTM3` | 买3价对应收益率 |
| `BIDPRICEYTM4` | 买4价对应收益率 |
| `BIDPRICEYTM5` | 买5价对应收益率 |
| `BIDPRICEYTM6` | 买6价对应收益率 |
| `BIDPRICEYTM7` | 买7价对应收益率 |
| `BIDPRICEYTM8` | 买8价对应收益率 |
| `BIDPRICEYTM9` | 买9价对应收益率 |
| `BIDPRICEYTM10` | 买10价对应收益率 |
| `ASKPRICEYTM1` | 卖1价对应收益率 |
| `ASKPRICEYTM2` | 卖2价对应收益率 |
| `ASKPRICEYTM3` | 卖3价对应收益率 |
| `ASKPRICEYTM4` | 卖4价对应收益率 |
| `ASKPRICEYTM5` | 卖5价对应收益率 |
| `ASKPRICEYTM6` | 卖6价对应收益率 |
| `ASKPRICEYTM7` | 卖7价对应收益率 |
| `ASKPRICEYTM8` | 卖8价对应收益率 |
| `ASKPRICEYTM9` | 卖9价对应收益率 |
| `ASKPRICEYTM10` | 卖10价对应收益率 |
| `BIDCLEANPRICE` | 债券最优买报价 |
| `BIDYTM` | 债券最优买报价收益率 |
| `BIDVOLUME` | 债券最优买券面总额 |
| `BIDORG` | 债券最优买报价方 |
| `ASKCLEANPRICE` | 债券最优卖报价 |
| `ASKYTM` | 债券最优卖报价收益率 |
| `ASKVOLUME` | 债券最优卖券面总额 |
| `ASKORG` | 债券最优卖报价方 |
| `PREVCLOSE_YTCP` | 前收价YTCP |
| `TODAYOPEN_YTCP` | 开盘价YTCP |
| `NEWPRICE_YTCP` | 最新价YTCP |
| `BIDPRICEYTCP1` | 买1价对应行权收益率 |
| `BIDPRICEYTCP2` | 买2价对应行权收益率 |
| `BIDPRICEYTCP3` | 买3价对应行权收益率 |
| `BIDPRICEYTCP4` | 买4价对应行权收益率 |
| `BIDPRICEYTCP5` | 买5价对应行权收益率 |
| `BIDPRICEYTCP6` | 买6价对应行权收益率 |
| `BIDPRICEYTCP7` | 买7价对应行权收益率 |
| `BIDPRICEYTCP8` | 买8价对应行权收益率 |
| `BIDPRICEYTCP9` | 买9价对应行权收益率 |
| `BIDPRICEYTCP10` | 买10价对应行权收益率 |
| `ASKPRICEYTCP1` | 卖1价对应行权收益率 |
| `ASKPRICEYTCP2` | 卖2价对应行权收益率 |
| `ASKPRICEYTCP3` | 卖3价对应行权收益率 |
| `ASKPRICEYTCP4` | 卖4价对应行权收益率 |
| `ASKPRICEYTCP5` | 卖5价对应行权收益率 |
| `ASKPRICEYTCP6` | 卖6价对应行权收益率 |
| `ASKPRICEYTCP7` | 卖7价对应行权收益率 |
| `ASKPRICEYTCP8` | 卖8价对应行权收益率 |
| `ASKPRICEYTCP9` | 卖9价对应行权收益率 |
| `ASKPRICEYTCP10` | 卖10价对应行权收益率 |
| `BIDPRICEYCU1` | 买1价YCU |
| `BIDPRICEYCU2` | 买2价YCU |
| `BIDPRICEYCU3` | 买3价YCU |
| `BIDPRICEYCU4` | 买4价YCU |
| `BIDPRICEYCU5` | 买5价YCU |
| `BIDPRICEYCU6` | 买6价YCU |
| `BIDPRICEYCU7` | 买7价YCU |
| `BIDPRICEYCU8` | 买8价YCU |
| `BIDPRICEYCU9` | 买9价YCU |
| `BIDPRICEYCU10` | 买10价YCU |
| `ASKPRICEYCU1` | 卖1价YCU |
| `ASKPRICEYCU2` | 卖2价YCU |
| `ASKPRICEYCU3` | 卖3价YCU |
| `ASKPRICEYCU4` | 卖4价YCU |
| `ASKPRICEYCU5` | 卖5价YCU |
| `ASKPRICEYCU6` | 卖6价YCU |
| `ASKPRICEYCU7` | 卖7价YCU |
| `ASKPRICEYCU8` | 卖8价YCU |
| `ASKPRICEYCU9` | 卖9价YCU |
| `ASKPRICEYCU10` | 卖10价YCU |
| `TODAYHIGH_YTCP` | 最高价YTCP |
| `TODAYLOW_YTCP` | 最低价YTCP |
| `AVERAGEPRICEYTCP` | 均价收益率(行权) |
| `MACAULAYDURATION_YTCP` | 麦氏久期YTCP |
| `MODIFIEDDURATION_YTCP` | 修正久期YTCP |
| `CONVEXITY_YTCP` | 凸性YTCP |
| `NEWPRICE_YCU` | 最新价YCU |
| `TODAYOPEN_YCU` | 开盘价YCU |
| `TODAYHIGH_YCU` | 最高价YCU |
| `TODAYLOW_YCU` | 最低价YCU |
| `PREVCLOSE_YCU` | 前收YCU |
| `AVERAGEPRICEYCU` | 均价收益率(票面不调整) |
| `MACAULAYDURATION_YCU` | 麦氏久期YCU |
| `MODIFIEDDURATION_YCU` | 修正久期YCU |
| `CONVEXITY_YCU` | 凸性YCU |
| `YTCPBP` | 最新收益率BP(YTC/P) |
| `YTCP5_BP` | 5日收益率BP(YTC/P) |
| `YTCP10_BP` | 10日收益率BP(YTC/P) |
| `YTCP20_BP` | 20日收益率BP(YTC/P) |
| `YTCP60_BP` | 60日收益率BP(YTC/P) |
| `YTCP120_BP` | 120日收益率BP(YTC/P) |
| `YTCP250_BP` | 250日收益率BP(YTC/P) |
| `YCUBP` | 最新收益率BP(YCU) |
| `YCU5_BP` | 5日收益率BP(YCU) |
| `YCU10_BP` | 10日收益率BP(YCU) |
| `YCU20_BP` | 20日收益率BP(YCU) |
| `YCU60_BP` | 60日收益率BP(YCU) |
| `YCU120_BP` | 120日收益率BP(YCU) |
| `YCU250_BP` | 250日收益率BP(YCU) |
| `TermNote2` | 剩余期限 (TermNote2) |
| `BondType_CNBD` | 债券类型中债版 |
| `MaturityGapDays` | 为到期日距离下一交易日的天数 |
| `MatchingStatus` | 债券匹配成交状态标记(N0=匹配成交 N1=协商成交 N2=点击成交 N3=询价成交 N4=竞买成交) |
| `MATCHPRICE` | 债券匹配成交价 |
| `MATCHPRICE_YTM` | 债券匹配成交价收益率 |
| `MATCHPRICE_YTCP` | 债券匹配最新价YTCP |
| `MATCHVOLUME` | 债券成交总量(匹配) |
| `MATCHTURNOVER` | 债券匹配成交额 |
| `CouponRate` | 票面利率 |
| `Rateofstdbnd` | 质押率 |
| `ImplicitDefaultRate_CSI` | 隐含违约率(中证) |
| `CorporateRatingKeyV2` | 主体评级 |
| `BondRatingKeyV2` | BBQ债项评级 |
| `ImplicitRatingKey_CNBD` | 中债隐含评级 |
| `ImplicitRatingKey_CSI` | 中证隐含评级 |
| `Yield_CNBD_Maturity` | 中债估值（到期） |
| `Yield_CSI` | BBQ中证估值收益率（到期） |
| `Yield_CNBD_Exercise` | 中债估值（行权） |
| `Yield_CSI_Exercise` | BBQ中证行权收益率 |
| `Yield_CSI_Recommend` | 中证估值收益率 |
| `Yield_CNBD` | 中债估值收益率 |
| `YTMBP` | 最新收益率BP |

## 基金专属

| 字段名 | 中文释义 |
| --- | --- |
| `NETVALUE` | 最新净值 |
| `FORWARDDISCOUNT` | 贴水率 |
| `Shares` | 基金份额 |
| `PREVNETVALUE` | 上期净值 |
| `GROWTHRATE` | 最新净值增长率 |
| `GROWTHRATETHISYEAR` | 年初以来净值增长率 |
| `GROWTHRATEFROMDAY1` | 成立以来净值增长率 |
| `GROWTHRATELASTWEEK` | 最近一周净值增长率 |
| `GROWTHRATELASTMONTH` | 最近一月周净值增长率 |
| `GROWTHRATELASTSEASON` | 最近一季净值增长率 |
| `GROWTHRATELAST6MONTHS` | 最近6月净值增长率 |
| `GROWTHRATELASTYEAR` | 最近一年净值增长率 |
| `ACCUMULATEDNETVALUE` | 最近累计净值 |
| `ACCUMULATEDBONUS` | 累计分红 |
| `PreIOPV` | 昨IOPV值 |
| `SUBSCRIPTIONSTATUS` | 申购状态 |
| `PREMIUMDISCOUNT` | 溢折价 |
| `PREMIUMDISCOUNTRATE` | 溢折率 |
| `FUNDOVERALLPREMIUMRATE` | 基金整体溢价率 |
| `FUNDRATING` | 基金综合评级 |
| `MORNINGSTARFUNDRATING` | 晨星基金评级 |
| `WINDFUNDRATING` | Wind基金评级 |
| `GROWTHRATELAST2YEARS` | 最近2年净值增长率 |
| `GROWTHRATELAST3YEARS` | 最近3年净值增长率 |
| `GROWTHRATELAST5YEARS` | 最近5年净值增长率 |
| `FUNDSIZE` | 基金规模 |
| `ANNUALIZEDRATE7DAYS` | 七日年化收益率 |
| `PREINCOMEOF10000COPIES` | 万份基金收益 |
| `PreannualizeDate7Days` | 上期七日年化收益率 |
| `INCOMEOF10000COPIES` | 上期万份基金收益 |
| `IOPV` | IOPV |
| `ESTIMATEMATCH` | 净值估算 |
| `ETFBuyAmount` | ETF申购数量 |
| `ETFSellAmount` | ETF赎回数量 |
| `ETFBuyMoney` | ETF申购金额 |
| `ETFSellMoney` | ETF赎回金额 |
| `ESTIMATEPRECLOSE` | 基金预估前收价 |
| `ESTIMATECHANGERANGE` | 估算涨跌幅(基金) |
| `Estimatechange` | 估算涨跌(基金) |

## 指数专属

| 字段名 | 中文释义 |
| --- | --- |
| `UPTOTAL` | 上涨家数 |
| `DOWNTOTAL` | 下跌家数 |
| `SAMETOTAL` | 平牌家数 |
| `IndexSwatchVolumn` | 指数样本数量 |
| `VCHANGERANGE1MIN` | 1分钟涨跌幅 |
| `VCHANGERANGE3MIN` | 3分钟涨跌幅 |
| `UpLimits` | 涨停个股数 |
| `DownLimits` | 跌停个股数 |
| `RelativeRange_1Min` | 1分钟相对涨跌幅 |
| `RelativeRange_3Mins` | 3分钟相对涨跌幅 |
| `RelativeRange_5Mins` | 5分钟相对涨跌幅 |
| `RelativeRange_15Mins` | 15分钟相对涨跌幅 |
| `RelativeRange_30Mins` | 30分钟相对涨跌幅 |
| `CONTRIBUTION` | 贡献度 |
| `CONTRIBUTION_5MINS` | 5分钟贡献度 |
| `SUSPENDTOTAL` | 成分股停牌个数 |
| `F5FLAG` | 涨跌分布 |

## 新三板/做市商/非匹配报价

| 字段名 | 中文释义 |
| --- | --- |
| `EXTTYPE` | 新三板扩展类型 |
| `TRADETYPE` | 新三板交易类型 |
| `MarketMakerCount` | 新三板做市商家数 |
| `BidOrgNameUnmatch1` | 非匹配报价-报买方 |
| `AskOrgNameUnmatch1` | 非匹配报价-报卖方 |
| `VOLUMEUNMATCH` | 非匹配统计-日成交量 |
| `TURNOVERUNMATCH` | 非匹配统计-日成交额 |
| `BidCNBDBestYTMBPUnmatch` | 非匹配:最优买-中债(到期) |
| `CNBDOfrBestYTMBPUnmatch` | 非匹配:中债-最优卖(到期) |
| `BidCNBDBestYTCPBPUnmatch` | 非匹配:最优买-中债(行权) |
| `CNBDOfrBestYTCPBPUnmatch` | 非匹配:中债-最优卖(行权) |
| `BidCSIBestYTMBPUnmatch` | 非匹配:最优买-中证(到期) |
| `CSIOfrBestYTMBPUnmatch` | 非匹配:中证-最优卖(到期) |
| `BidCSIBestYTCPBPUnmatch` | 非匹配:最优买-中证(行权) |
| `CSIOfrBestYTCPBPUnmatch` | 非匹配:中证-最优卖(行权) |
| `BidVolUnmatch1` | 非匹配报价-买量 |
| `AskVolUnmatch1` | 非匹配报价-卖量 |
| `BidPriceYTMUnmatch1` | 非匹配报价-买YTM |
| `BidPriceYTCPUnmatch1` | 非匹配报价-买YTE |
| `BidPriceUnmatch1` | 非匹配报价-买价(净) |
| `AskPriceUnmatch1` | 非匹配报价-卖价(净) |
| `AskPriceYTCPUnmatch1` | 非匹配报价-卖YTE |
| `AskPriceYTMUnmatch1` | 非匹配报价-卖YTM |
| `PRICEYTMUNMATCH` | 债券非匹配最新价YTM |
| `PRICEYTCPUNMATCH` | 债券非匹配最新价YTCP |

## BBQ 询价/中介

| 字段名 | 中文释义 |
| --- | --- |
| `BBQBidPriceBest` | BBQ所有中介最优买价 |
| `BBQAskPriceBest` | BBQ所有中介最优卖价 |
| `BBQDealTime` | BBQ成交时间 |
| `BBQBidPrice` | 买入_BBQ |
| `BBQAskPrice` | 卖出_BBQ |
| `BBQBidVolume` | 买量_BBQ |
| `BBQAskVolume` | 卖量_BBQ |
| `BBQTradePrice` | 成交价_BBQ |
| `BBQStatusStr` | 成交状态 |
| `BBQCNBDChange` | 成交价_中债_BBQ |
| `BBQCSIChange` | 成交价_中证_BBQ |
| `BBQQuoteTime` | 时间_BBQ |
| `BBQTime` | BBQ成交日期 |
