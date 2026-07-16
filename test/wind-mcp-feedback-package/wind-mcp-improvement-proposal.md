# Wind MCP 服务改进意见书(终稿 v2)

> **方法与范围**:基于 fin-agent 2026-07-08~09 共 8 次真实运行(VLCC 研究、芯片产业链、多次三市场复盘),
> 采样 **280 个失败信封**(`grep '"ok": false'` 精确计数)与全部落盘返回体(`runs/*/.agent/data/wind_*.json`)。
> 经三轮评审:初稿 → 接口设计(ACI)专家逐条证据复核+深挖 → 数据质量专家对抗性评审(含"替 MCP 方写反驳")。
> 初稿中 6 处夸大/误判已修正,见附录 B——**本文所有留存断言均有文件+行号级证据,直接附在每个问题之后**。
>
> **核心结论**:数据本身基本是对的;最贵的缺陷不是"报错多"(显性成本),而是**不报错但会让下游算出错误数字的
> 静默语义缺陷**(第 1 章)。其次才是一致性税(第 2~3 章)。并且约一半"一致性报错"的最廉价修复点在
> **客户端 cli.mjs 的归一化层**,不需要 MCP 后端动代码(第 8 章归责清单)。

## 第 0 章 · 优先级总览

| 级别 | 问题 | 章节 | 性质 |
|---|---|---|---|
| **P0(产出错数字)** | excelTotalCount 计数不可信、整列 INVALID、quote 缺前收盘致涨跌幅错算、市值双口径不自标注、竞价 bar/非原子快照 | 1.1~1.5 | 静默,直接污染交付报告 |
| **P1(一致性税)** | 信封三形状、行情类无类型无单位、analytics 多 Step 无文档、schema 无版本、参数体系分裂、NER 黑盒、错误体 prose-only | 2~5 章 | 显性,烧 token/时间 |
| **P2(能力与效率)** | 行情单标的、quote 无降采样、EDB 四态、search_stocks 重载、retry_after | 6~7 章 | 调用量与长尾 |

错误码分布(280 次):PARAM_VALIDATION_ERROR 108、INVALID_PARAM_VALUE 58、PARAM_TYPE_ERROR 25、
EDB_INDICATOR_NOT_FOUND 25(单次运行内最高约 30 次)、ROUTE_ERROR 22、INVALID_PARAM_NAME 22、
MARKET_TARGET_NOT_FOUND 9、UNKNOWN 9、USAGE_ERROR 1、TEMPORARILY_UNAVAILABLE 1。

---

## 第 1 章 · 数据语义质量(P0:会让下游算出错数字的静默缺陷)

### 1.1 `excelTotalCount` 计数不可信,且无截断/分页机制

**问题**:该字段与真实返回行数系统性不符,既无截断标志也无分页参数,调用方无法判断"拿到的是不是全集"。

**证据**(两位评审独立发现,解读并列):
- 精确 2× 模式(数据质量专家):`runs/20260709-044238/.agent/data/wind_010.json` `excelTotalCount=62`,实际 rows=**31**(申万一级恰好 31 个行业,数据实为全集);`wind_018.json` `144` vs rows=**72**;`runs/20260709-034813/.agent/data/wind_009.json` `62` vs **31**。三例精确 2 倍。
- 疑似截断模式(接口专家):`runs/20260709-031421/.agent/data/wind_007.json` `excelTotalCount=138`,rows=**69**(日志 `run_20260709-031421.log:419,429`:agent 打印"总板块数: 69"并据此排名——若 138 为真,排名建立在半个数据集上);`runs/20260708-231246/.agent/data/wind_006.json` Step1 `20` vs 3 行、Step2 `69` vs 23 行(不符合 2×)。
- 反例:`run_20260709-044238.log:643` 美股板块 `excelTotalCount=82` = rows 82,一致。

**影响**:调用方把该字段当"结果总数"用,排名分母、涨跌家数统计、是否翻页的判断全部失真;若真有截断则更严重——排行榜是在缺了一半数据的子集上排的,且完全无感。

**解决方案**:
1. MCP 方澄清并修正字段语义(若是"含表头×2/隐藏列"之类的实现泄漏,改为真实行数;若确有截断,必须返回 `{"truncated": true, "returned": N, "total": M}` 并提供 `offset/limit` 或 `cursor`);
2. 对"排名/全行业"类查询,要么保证全量,要么显式报"结果超限,请缩小范围";
3. 客户端过渡方案:落盘时校验 `len(rows) vs excelTotalCount`,不一致即在回执中告警,一律以 `len(rows)` 为准。

### 1.2 整列结构性 `"INVALID"`:哪列失效因标的而异,契约不声明

**问题**:某标的不适用的指标列,后端用字面量 `"INVALID"` 填满整列(而非 null 或省列),且同名列在不同标的下是否有效完全不同,契约无任何"列×标的类型"可用性说明。

**证据**(逐列量化):
- `runs/20260709-044238/.agent/data/wind_006.json`(上证指数分钟 quote):`AVGPRICE` 列 **242/242 全 INVALID**;
- 同 run `wind_002.json`(391 行):`AVGPRICE` 391/391 INVALID,`TURNOVER` **390/391 INVALID**(只有收盘 1 行有值);
- `runs/20260708-233207/.agent/data/wind_007.json`(1532 行估值序列):`VOLUME`+`TURNOVER` 两列全 INVALID;
- 对比:`wind_006` 的 `TURNOVER` 全列有效——**同名列有效性随标的漂移**。
- 罗素2000 quote:`VOLUME/TURNOVER` 全 INVALID(`run_20260709-044238.log:423`)。

**影响**:`float("INVALID")` 抛错只是小事;真正危险的是聚合——把 `INVALID→0` 或跳过后求和,`wind_002` 会把"全天成交额"算成"最后一分钟的成交额",`wind_007` 会得出"量能=0"的荒谬但看似正常的结论,直接进报告。

**解决方案**:
1. 无效值统一返回 `null`(JSON 原生),永不适用的列干脆不返回;
2. `columns` 元数据增加 `"applicable": false` 或按"标的类型×列"发布可用性矩阵;
3. 客户端过渡方案:落盘时检测"整列 INVALID"→ 删除该列并在回执注明,禁止喂给聚合。

### 1.3 `get_index_quote` 不含前收盘/涨跌幅 → 诱导错误涨跌幅进入交付报告

**问题**:quote 只有 `MATCH/AVGPRICE/VOLUME/TURNOVER/TIME/_DATE`,没有 `pre_close`,调用方只能用"(收-开)/开"冒充日涨跌幅——那是日内收益,不是对昨收的涨跌幅,数值必错。

**证据**:
- 字段清单:`run_20260709-044238.log:338`;agent 计算 `(close-open)/open`(`:496`)得道指"-0.06%"写进报告(`:530`)——真实日涨跌幅须对 2026-07-07 收盘,结构上无法从当日 quote 算出;
- 同标的两工具两个数:上证 quote 首末行自算 = **+1.70%**,`get_index_price_indicators`(`wind_011.json`)= **1.65%**——同一指数同一天两个"涨跌幅";
- 实际事故:2026-07-09 两份大盘报告的美股涨跌幅全部错误(owner 人工核查证实:标普报 +0.08%/实际 -0.28% 等),根因即此。

**影响**:不是"多调一次"的效率问题,是**交付物里的错误数字**;且同报告两处口径并存时直接制造"同指标两值"的自相矛盾。

**解决方案**:
1. quote 响应 meta 增加 `pre_close`、`pct_chg`、当日 OHLC 汇总;
2. 契约明示"quote 不含涨跌幅,涨跌幅一律取 price_indicators 的 `pct_chg`";
3. 错误预防:文档/错误提示层面明确禁止用开盘价近似昨收。

### 1.4 市值双口径(`总市值1`=不含限售 / `总市值2`=含限售)不自标注

**问题**:两个口径并存,归一化把裸词"总市值"默认映射到 `总市值2`,返回体不带口径标签——同一股票两次调用可拿到两个都叫"总市值"的不同数。

**证据**:`normalization-rules.json:105-107`(`总市值→总市值2`,`总市值不含限售→总市值1`);`tool-contracts.md:162-163`。下游事故关联:交付报告中中远海能出现三个市值(815.86/871.56/~700 亿,`runs/20260709-005304/report.md:98,143,325`),其中至少部分为口径混用+模型倒推的复合产物。

**影响**:市值是 PE/股息率等一切派生指标的分母,口径漂移会整链传导;"同指标多值"还会诱导模型"换口径圆谎"。

**解决方案**:市值类指标返回时强制附口径标签(如 `"caliber": "含限售"`);列名直接带口径(`总市值(含限售)`);归一化的默认映射在返回体中回显。

### 1.5 分钟数据的时间陷阱:竞价巨量 bar、午休断层、非原子"快照"

**问题**:分钟序列里混着集合竞价 bar(9:30 与 15:00 巨量、14:58-59 零量挂价)、午休直接跳段,而 analytics"收盘排名"各行时间戳漂移(15:00:06~15:02:07 不等),并非同一时点的原子快照——这些结构性 bar/漂移无任何标注。

**证据**:`wind_006.json`:15:00 单行 `VOLUME=553,630,800`(邻近分钟的 2-3 倍)、14:58/14:59 `VOLUME=0` 但价格在动、11:30→13:00 跳段;`wind_010.json` 各行"交易时间"漂移、`wind_018.json` 港股 16:08:03。

**影响**:VWAP、分钟均量、量能分布等日内统计会被竞价 bar 拉偏;把漂移时间戳当同一收盘时点会引入跨标的比较误差。

**解决方案**:分钟行增加 `session` 标注(`auction/continuous/break`);排名类返回在 meta 声明"逐标的抓取时间区间";客户端过渡:日内统计前剔除竞价 bar。

---

## 第 2 章 · 响应结构与类型(P1)

### 2.1 响应信封至少三种形状,层级漂移

**问题**:行情类 `{"data":{columns,rows,windcode}}`;analytics `{"data":{"data":[{columns,rows}]}}`;EDB/NL 更深。调用方平均花 2~3 步试错才能解析。

**证据**:同一 run 内连续 `KeyError` 撞结构:`run_20260709-044238.log:384-387,429-432`;`run_20260709-031421.log:397-426`;analytics 外层"行数:1"内藏 82/69 行(`run_20260709-044238.log:176`、`run_20260709-031421.log:392`)。

**解决方案**:统一信封为单层:

```json
{
  "schema_version": "2.0",
  "code": 0,
  "columns": [{"name": "涨跌幅", "type": "number", "unit": "%", "caliber": null}],
  "rows": [[7.33]],
  "meta": {"windcode": "882001.WI", "returned": 31, "total": 31,
           "truncated": false, "tz": "+08:00", "as_of": "2026-07-09T15:00:00+08:00"}
}
```
旧形状兼容期内双发(新字段并存),一个大版本后弃旧。

### 2.2 行情三工具数值字符串化且无单位;analytics 反而是正确范式

**问题**:`get_index_quote/kline/price_indicators` 所有数值列 `{"type":"string"}` 且无 unit(`run_20260709-044238.log:437-465`;`wind_011.json` 涨跌幅=字符串 `"1.65"`);而 **analytics 返回真 JSON number 且带 `"unit":"%"`**(`wind_010.json` 涨跌幅=number `7.33`)。成交额单位(元/万/亿)、成交量(股/手)全靠调用方猜——实测 agent 在代码里赌 `TURNOVER/1e8=亿`(`run_20260709-031421.log:396`)。

**影响**:口径猜错=数字差 1e4~1e8 倍,且不报错。

**解决方案**:以 analytics 的列元数据为全线标准——`{"name","type":"number","unit"}` 推广到行情三工具;涨跌幅统一声明标度(`7.33` 表示 7.33%);kline 的复权口径(`aftime`)回写进响应 meta(现仅在入参,返回不自述——此点标注:推测,建议 MCP 自查)。

### 2.3 analytics 多 Step 分块载荷无文档

**问题**:返回是"步骤块数组"(Step1/Step2),各块列结构不同;只读 `data[0]` 会静默丢后续块。

**证据**:`runs/20260708-231246/.agent/data/wind_006.json`(Step1 3 行一套列 + Step2 23 行另一套列);`Step2` 关键字跨 6 个 run 出现 14 次,属常态。

**解决方案**:契约明确 multi-step 语义与各块含义;或按其自身规则("一个 analytics 问题只聚焦一个取数动作")单块化。

### 2.4 TIME 与 _DATE 冗余;日 K 用 `T00:00:00` 伪时刻

**证据**:分钟行 `[..., "2026-07-08T09:30:00.000-04:00", "20260708"]`(`run_20260709-044238.log:340`);日 K `"2025-01-02T00:00:00.000+08:00"`(`run_20260708-234007.log:314`)。
**正名**(初稿有误):TIME 的时区偏移量(`+08:00/-04:00`)是自描述的,美股=美东无歧义,这点**不构成缺陷**;残留问题只是 `_DATE` 无时区、与 TIME 冗余、日频伪时刻。
**解决方案**:日频以上用 `date` 类型去掉时刻;删除冗余 `_DATE` 或文档说明二者分工。

### 2.5 无 schema 版本;`version` 入参是无定义的死公共面

**证据**:全部日志 `"version"` 零次使用;契约只写"后端版本参数,不得自造"(`tool-contracts.md:96,115,133`)——调用方永远无法合法使用。
**解决方案**:响应加 `schema_version`;`version` 参数给出枚举与语义,或走弃用流程从公共面移除。

---

## 第 3 章 · 参数体系(P1;每条标注归责)

### 3.1 日期格式两套 —— 【客户端可独立修复,根因已定位】

**证据**:kline 传 `2026-07-08` 被拒、要求 `yyyyMMdd`(`run_20260709-044238.log:141-147`);同 server 的 quote 传 `2026-07-09` 成功(`:336-342`)。**根因**:客户端校验表 `tool-validation-rules.json:16-22` 的 `date_keys` 只含 `begin_date/end_date/beginDate/endDate`,漏掉 quote 的 `begin/end`;且归一化表 `normalization-rules.json` 有 period 别名却**没有任何日期归一条目**。
**解决方案**:在 `normalization-rules.json` 增加日期归一(`YYYY-MM-DD → YYYYMMDD`,作用于全部日期键)——一行配置级修复,零后端改动;MCP 侧长期统一接受 ISO 日期。

### 3.2 period 魔法数字 —— 【MCP 改语义,客户端可先补别名】

**证据**:"period 只能是 1/3/.../15,日 K 请传 '10'"(`run_20260709-044238.log:145`);客户端已有 `day/日线→10` 别名但缺 `1d/1w`(`normalization-rules.json:33-38`;`1d` 报错见 `:140-144`)。
**解决方案**:MCP 提供语义枚举(`day/week/month/1min/5min`),数字码兼容;客户端立即补 `1d/1w/1m` 别名。

### 3.3 lang 多词表 —— 【公平归责:`zh` 是调用方自造;真缺陷是词表分裂+错误不回显枚举】

**证据**:契约明写 stock/fund 系 `English/中文`(`tool-contracts.md:96`)、analytics `CNS/ENS`(`:306`);同一 agent 前脚正确用 `CNS` 成功(`run_20260709-044238.log:172`)后脚自造 `zh` 被拒(`:729-734`),错误只回 `Invalid value 'zh'` 不给合法值。**多词表是"诱导猜测"的结构性原因,但 `zh` 被拒本身不是缺陷。**
**解决方案**:MCP 统一一套词表(建议 `zh/en`),兼容旧值;所有枚举类错误必须回显 `candidates`;客户端归一化先行(`zh/中文/chinese→各工具词表`)。

### 3.4 列表参数不收数组 —— 【MCP 或客户端皆可修】

**证据**:`indexes` 传 JSON 数组 → PARAM_TYPE_ERROR(`run_20260709-010941.log:1049-1053`、`run_20260709-024539.log:3195-3199`)。
**解决方案**:服务端同时接受数组与逗号串;或客户端归一化 `list → ",".join`。

### 3.5 参数名跨工具漂移 —— 【MCP 规范】

**证据**:自然语言入参 `question` vs `query`(financial_docs);日期 `begin_date/end_date` vs `begin/end`;标的一律 `windcode` 但别名(`code/ticker/symbol`)一律拒(`tool-contracts.md:60-63`)。
**解决方案**:发布参数命名规范并全线对齐(NL 入参统一 `question`、日期统一 `begin_date/end_date`),旧名兼容一个周期。

---

## 第 4 章 · 标的识别(P1)

### 4.1 NER 黑盒,且无自助解析工具

**问题**:代码/别名能否被识别不可预测,契约禁止调用方猜后缀,却不提供任何"名称→windcode"解析工具。

**证据**:`RUT`→失败、`RUT.O`→失败、中文"罗素2000"→成功(`run_20260709-044238.log:357-425`);`BDTIY.IP/BDTI.HI` 共 9 次 MARKET_TARGET_NOT_FOUND;错误体只有说教文字,无候选。

**解决方案**:
1. 新增轻量工具 `resolve_instrument(query) → [{windcode, name, market, type, confidence}]`;
2. 或 MARKET_TARGET_NOT_FOUND 的错误体直接返回 `candidates` 数组;
3. 契约公布 NER 支持的输入形态清单(中文全称/简称/裸代码/ticker 的支持矩阵)。

---

## 第 5 章 · 错误设计(P1)

### 5.1 错误体 prose-only:机器决策要做中文阅读理解;指引指向调用方不可达文件

**问题**:失败信封只有 `{code, agent_action}`,重试策略、字段期望、候选值全部烤在中文散文里;且每条都让调用方"按 references/tool-contracts.md 修正"——那是 MCP 发行包内部文档,调用方运行时根本没有。

**证据**:信封结构 `error-codes.json:6`;"仅允许原样重试一次"等重试语义为纯文案(`run_20260709-005304.log:209`);模型真的去找该文件:`run_20260709-010941.log:1133-1137`、`run_20260709-024539.log:2862-3415`、`run_20260708-233207.log:1492-1496`(`ls/find references/` 全部落空,纯烧步数);params 整体类型错时误报"缺少必填参数: question",误导修复方向。

**解决方案**(错误体目标 schema):

```json
{
  "code": "INVALID_PARAM_VALUE",
  "field": "lang",
  "got": "zh",
  "expected": {"type": "enum", "candidates": ["CNS", "ENS"]},
  "retryable": true,
  "retry_after_ms": 0,
  "hint": "人类可读说明(降级为附属信息)"
}
```
并删除对外部不可达文档的引用——错误信息必须自包含。

---

## 第 6 章 · 能力缺口与效率(P2)

### 6.1 行情类单标的限制
**证据**:契约明禁多代码(`tool-contracts.md:63-66`);16 只股票=16 次调用,纯串行延迟。
**解决方案**:行情三工具支持 `windcodes` 数组(≤50),返回按标的分组;或提供批量工具。

### 6.2 quote 名为快照实为全日分钟序列,无降采样
**证据**:单日返回 391 行(`run_20260709-044238.log:339`),只想要收盘也得全量拉回。
**解决方案**:增加 `granularity=daily|1min`;daily 模式返回单行 OHLC+pre_close+pct_chg(与 1.3 联动)。

### 6.3 EDB 四态 executionMode 复杂,两段式取数
**证据**:search/fetch/searchFetch/retrieve 四模式反复试错,EDB_INDICATOR_NOT_FOUND 单 run 约 30 次(`run_20260709-005304.log`)。
**解决方案**:默认提供"自然语言直达数据"单模式;查不到返回近似指标 `candidates` 而非裸错误。

### 6.4 `search_stocks` 重载:A股与港美股两套语义共用一名,无 market 参数
**证据**:`tool-contracts.md:85-117` 同名两段定义;市场只能靠问句措辞隐式表达。
**解决方案**:增加显式 `market` 枚举参数(`A/HK/US`),或拆分工具。

---

## 第 7 章 · 稳定性(P2)

### 7.1 temporarily_unavailable 无 retry_after、幂等未声明
**证据**:`run_20260709-005304.log:208-209`,重试指引为散文"原样重试一次"。
**解决方案**:错误体带 `retry_after_ms`;文档声明只读查询幂等。

---

## 第 8 章 · 归责与落地路径

### 8.1 两栏清单

| 修复项 | 客户端 cli.mjs 可独立修(约 1 天) | 必须 MCP 后端/契约改 |
|---|---|---|
| 日期归一(3.1) | ✅ normalization-rules 加一条 | 长期统一 ISO |
| period/lang 别名(3.2/3.3) | ✅ 补别名映射 | 统一词表+错误回显候选 |
| 数组→逗号串(3.4) | ✅ | 原生收数组 |
| excelTotalCount 校验告警(1.1) | ✅ 以 len(rows) 为准 | 修字段语义+分页 |
| 整列 INVALID 丢列(1.2) | ✅ 落盘时检测 | null 化+可用性矩阵 |
| quote 禁自算涨跌幅(1.3) | ✅ 调用方纪律(fin-agent 已立规) | quote 带 pre_close/pct_chg |
| 信封/类型/单位/版本(2 章) | — | ✅ |
| resolve 工具/错误体结构化(4/5 章) | — | ✅ |

### 8.2 调用方(fin-agent)已自行落地的部分
数字必须脚本搬运禁背默、涨跌幅直取 `pct_chg`、全量落盘、数据锚定独立复核——**这些是调用方责任,不列入对 MCP 的要求**;本意见书其余各条为扣除调用方自身问题后仍然成立的服务侧缺陷。

### 8.3 对"预期收益"的诚实修订
初稿称"75% 报错可消失"——经对抗评审修订为:**格式类错误约占 75%,其中约一半可由客户端归一化独立消除(不依赖 MCP);其余(词表统一、错误回显候选、结构统一)需 MCP 改动**。静默类缺陷(第 1 章)无法用报错数衡量,但对金融结论的伤害最大,应优先。

---

## 附录 A · 证据索引

| 证据 | 位置 |
|---|---|
| 280 失败信封 | `logs/run_202607*.log`,`grep '"ok": false'` |
| excelTotalCount 2× | `runs/20260709-044238/.agent/data/wind_010.json`(62 vs 31)、`wind_018.json`(144 vs 72)、`runs/20260709-034813/.agent/data/wind_009.json`(62 vs 31) |
| excelTotalCount 疑似截断 | `runs/20260709-031421/.agent/data/wind_007.json`(138 vs 69)+ `logs/run_20260709-031421.log:419,429` |
| 整列 INVALID | `runs/20260709-044238/.agent/data/wind_006.json`(AVGPRICE 242/242)、`wind_002.json`(TURNOVER 390/391)、`runs/20260708-233207/.agent/data/wind_007.json`(VOLUME+TURNOVER 全列) |
| quote 涨跌幅错算进报告 | `logs/run_20260709-044238.log:338,496,530`;同标两值:`wind_006`(自算+1.70%) vs `wind_011`(1.65%) |
| 市值双口径 | `normalization-rules.json:105-107`、`tool-contracts.md:162-163`;下游 `runs/20260709-005304/report.md:98,143,325` |
| 竞价 bar/时间漂移 | `wind_006.json`(15:00 巨量、14:58-59 零量)、`wind_010.json`/`wind_018.json`(时间戳漂移) |
| 信封三形状 KeyError | `logs/run_20260709-044238.log:384-387,429-432`、`run_20260709-031421.log:397-426` |
| number+unit 正面范式 | `wind_010.json`(涨跌幅 number + unit:%) vs `wind_011.json`(字符串无 unit) |
| 日期两套+根因 | `logs/run_20260709-044238.log:141-147,336-342`;`tool-validation-rules.json:16-22`;`normalization-rules.json`(无日期条目) |
| lang 词表 | `tool-contracts.md:96,306`;`logs/run_20260709-044238.log:172,729-734` |
| indexes 数组被拒 | `logs/run_20260709-010941.log:1049-1053`、`run_20260709-024539.log:3195-3199` |
| NER 黑盒 | `logs/run_20260709-044238.log:357-425`;MARKET_TARGET_NOT_FOUND ×9 |
| 错误指向不可达文档 | `logs/run_20260709-010941.log:1133-1137`、`run_20260709-024539.log:2862-3415`、`run_20260708-233207.log:1492-1496` |
| analytics 多 Step | `runs/20260708-231246/.agent/data/wind_006.json`;`Step2` 跨 6 run ×14 |
| version 死参数 | 契约 `tool-contracts.md:96,115,133`;全日志零使用 |

## 附录 B · 初稿修正记录(评审诚实性)

1. ~~"数值全部是字符串"~~ → 仅行情三工具;analytics 是 number+unit 正面范式(反而应推广);
2. ~~"wind_006=上证 242 处 INVALID 须逐格防御"~~ → INVALID 是**整列结构性 N/A**,修复方向是 null 化/丢列,非逐格;
3. ~~"通用值 zh 被拒"~~ → `zh` 从来不是合法值,系调用方自造;真缺陷是多词表+错误不回显候选;
4. ~~"TIME 时区有歧义"~~ → 时区偏移自描述、无歧义(美股 -04:00 即美东);残留仅 _DATE 冗余;
5. ~~"excelTotalCount 是命名瑕疵"~~ → 升级为 P0:计数不可信(2× 证据)且无截断/分页机制;
6. ~~"75% 报错可由 MCP 统一消除"~~ → 修订见 8.3(约一半在客户端即可修)。

## 附录 C · 未决问题(留给 MCP 方确认)

- `excelTotalCount` 的真实语义(2× 的成因?是否存在真截断?);
- `version` 参数的后端行为;
- kline 返回体是否在某隐藏字段自述复权口径;
- 空结果的三态语义(空 rows / error / 占位)——本次 8 run 未复现混用,列为待验证。
