# `wind-mcp-research-skill` 评审报告

- 日期：2026-09-05
- 范围：按 `skills/wind-mcp-skill/mcp-connection-guide.md` 的方案，为 7 个新 MCP server（132 个工具）新建 skill，并评审现有 `wind-mcp-skill` 的结构
- 结论：**新 skill 已可用**。离线契约测试 53/53、边界测试 36/36（含真实后端分组时 39/39）、132 个工具实盘冒烟 129/132（3 个失败全部是已记录的服务端故障，非本 skill 问题）

## 一、先回答「现有结构是否最优」

结论：**骨架是对的，照搬；但有四处在 132 个工具的规模下会塌，必须改。**

### 1.1 值得照搬的四点

| 设计 | 为什么留 |
| --- | --- |
| **SKILL.md 只放路由，契约拆到 `references/<domain>.md`** | 渐进披露。agent 读完路由表只需再读一份契约，不必把全部工具塞进上下文 |
| **统一信封：成功是数据对象，失败是 `{ok:false,code,message}`** | agent 只需判断一个字段就知道成败，错误码可枚举、可分支处理 |
| **发网络前先做本地参数校验** | 参数错误在本地就报，省一次调用和积分，且错误信息比后端原文精确 |
| **「定路由 → 发命令 → 读回执 → 收口」四步 + 重调自检** | 把「报错后乱改参数」这个最常见的失败模式挡住了 |

### 1.2 必须改的四点

**① 契约文档是手写的，会和后端漂移。**
旧 skill 的 `references/*.md` 和 `scripts/tool-manifest.json`、`scripts/call-rules.json` 三份都靠人工维护。而 `mcp-connection-guide.md` 自己记录了：数小时内 company_data 的日期字段改了 4 轮、edb 3 个工具集体改名、fund 掉了 3 个工具。手工维护三份副本，在这个变更频率下必然对不上。

→ 新设计：**`registry.json` 是唯一真源**，由 `tools/list` 直接生成；`references/*.md` 由它生成；本地校验规则也从它推导。人工内容单独放 `annotations.json`，`refresh` 只覆盖 schema、不碰人工内容。

**② 校验规则是手工白名单，覆盖不到 132 个工具。**
旧 `call-rules.json` 里 `question_required` 手工列了 22 个工具名，`allowed` 字段只给 edb 的 2 个工具写了。132 个工具 432 个参数不可能这么维护。

→ 新设计：校验规则**全部从 schema 推导**——必填看 `required`，类型/枚举/数组上下界看属性定义，日期格式看说明里写没写 `HH`，互斥看说明里的「互斥」二字。零手工清单。

**③ 业务错误伪装成成功返回，旧 CLI 不拦。**
七个 server 普遍把「服务暂时不可用」以 `isError=false` 的纯文本返回。旧 CLI 只把协议层错误映射成 `backend_error`，这类文本会原样进成功信封，agent 会把报错当数据讲给用户。

→ 新设计：传输层做文本嗅探（短文本 + 命中错误词），转成 `backend_error` 并标 `detected_by:"text"`；`--raw` 可关闭。

**④ 未知字段被后端静默忽略，旧 CLI 无从拦截。**
本次实测确认：132 个工具里只有 35 个声明了 `additionalProperties:false`，其余 97 个写错字段名不报错，而是返回默认区间的数据。

→ 新设计：registry 有完整字段表，**对全部 132 个工具一律按封闭集合校验**，未知字段本地直接拦下并列出允许字段。`--allow-unknown` 作为注册表过期时的逃生口。

### 1.3 另外两个小问题

- `mcp-probe.mjs` 没有 `IS_MAIN` 守卫，`import` 它会执行 CLI 主流程（本次搭建时踩到）。新代码三个模块都加了守卫。
- 旧 skill 的 `scripts/update-check.mjs`（每天后台检查 skill 新版本）**原样搬了过来**，534 行一行没改——它处理 lock 文件定位、gitee/github 源判别、`update` 失败后回退 `add`、目录哈希比对、静默窗口与并发锁，是踩过坑的实现，不该重写。触发逻辑也保持原样：只在 `call` 成功后起一次 detached 子进程，先把脚本复制到 `~/.cache` 再执行（更新会替换整个 skill 目录，脚本不能在自己即将被覆盖的位置上跑）。
  **新增了一个旧 skill 没有的开关**：`WIND_SKILL_NO_UPDATE=1` 可以关掉。跑测试或在开发仓里工作时应该设上——否则每次 `call` 成功都会在后台跑一次 `npx skills update`，在开发工作树里可能覆盖本地文件。
- 「schema 漂移」是另一回事，由 `doctor` / `diff` / `refresh` 三条命令覆盖，与 skill 版本更新互不干扰。`doctor` 会把上次自更新的状态一并报出来。

## 二、新 skill 的结构

```
skills/wind-mcp-research-skill/
├── SKILL.md               167 行  路由表 + 四步循环 + 两段式调用 + 已知的坑 + 收口
├── references/                   7 份**工具目录**（由 registry.json 生成，不手写）
│   ├── finance.md  stock.md  fund.md  edb.md  futures.md  options.md  company.md
├── scripts/
│   ├── cli.mjs            959 行  传输层 → 参数校验 → 注册表读取 → 重建与文档生成 → 命令与信封
│   ├── update-check.mjs   534 行  【自更新】与旧 skill 同一份实现，一行未改
│   ├── registry.json             【生成物】132 个工具的完整 schema，只给 CLI 用
│   └── annotations.json          【人工维护】server 说明 + 领域关键词 + 132 个实测样例 + 已知故障
└── tests/
    ├── run-offline-tests.mjs     40 项契约测试，零网络
    ├── run-boundary-tests.mjs    36 项边界测试，默认零网络，`--live` 加三组真实后端
    ├── mock-fetch.mjs            fetch 替身
    └── README.md
```

代码量对比（不含测试）：

| | 旧 skill | 新 skill |
| --- | --- | --- |
| 自己的代码 | `cli.mjs` 1047 行 | `cli.mjs` **959 行** |
| 共用的更新脚本 | `update-check.mjs` 534 行 | 同一份，534 行 |
| 手工维护的契约 | `references/*.md` 10 份 + `tool-manifest.json` + `call-rules.json` | **无**——全部由 `registry.json` 生成 |

行数比旧 skill 还少，但覆盖的工具从 35 个变成 132 个，且三份手工副本换成了一份生成物。脚本只剩两个：`cli.mjs` 和 `update-check.mjs`（后者不能合并——更新会替换整个 skill 目录，脚本必须能被复制到别处独立执行）。

### 关键的三条分界

**生成物 vs 人工内容。** `registry.json` 和 `references/*.md` 是生成物，后端改了就重新生成；`annotations.json` 是人工写的，`refresh` 不会覆盖它。这样「后端变了」和「我们对后端的理解变了」是两件独立的事，不会互相冲掉。

**离线命令 vs 联网命令。** `find` / `describe` / `list-tools` / `list-servers` 全部离线，不消耗积分。132 个工具选型的成本因此降到零——agent 可以放心地先搜再定，不必赌。

**目录 vs 完整契约（决定上下文成本）。** `references/<server>.md` 只是**目录**：调用要点 + 一张表（工具名 / 一句话用途 / 入参签名 / 可直接跑的样例）。完整契约——【功能】【适用场景】【返回】【边界】+ 参数表 + 枚举 + 默认值——走 `cli.mjs describe <server> <tool>`，一次只取一个工具。

最初的版本把全量参数表也写进了目录，`company.md` 因此有 3.5 万字，而 agent 一次只用其中一个工具的参数。拆开后：

| 目录 | 拆之前 | 拆之后 | |
| --- | --- | --- | --- |
| `company.md` | 35410 字 | 8610 字 | 4.1x |
| `options.md` | 29996 字 | 7053 字 | 4.3x |
| `fund.md` | 23357 字 | 5885 字 | 4.0x |
| 7 份合计 | 130784 字 | **36760 字** | 3.6x |

单个工具的 `describe` 输出在 0.9–3.3 千字之间；只看一个字段的 `describe <server> <tool> <param>` 更小。所以回答一个 company 问题的读取量，从「SKILL.md + 3.5 万字契约」变成「SKILL.md + 8.6 千字目录 + 0.9 千字契约 ≈ 1.95 万字」。

目录里保留了一列「别选错」——【边界】的首句。这一列是必要的：`company_get_discredit` / `company_get_final_case` / `company_get_high_consumers` / `company_get_executed_persons` 的【功能】几乎是同义反复（都是「查询企业的 X 公开记录」），只有【边界】写明它们是四种不同的司法执行结果。测试里有一条专门断言这四个工具的「别选错」列互不相同。

每份目录末尾还有一节「本 server 最容易选错的」，内容按 server 各写各的（fund 写全部持仓 vs 重仓，options 写查行情 vs 定价器，futures 写库存的三个候选），测试断言它不会串台。

离线测试卡了三条硬线守住这个分界：单份目录 ≤ 1 万字、7 份合计 ≤ 4.2 万字、目录里不许出现 `| 参数 | 必填 |` 表头。有人「顺手把文档补全一点」测试就会红。

### 契约文档怎么控制体积

`company` 有 54 个工具、其中 20 个的入参完全相同（只有 `companyKey`）。生成器检测到「≥5 个工具共用**完全相同**的单参数 schema」时提一节「公共入参」，这些工具的小节里不再重复参数表，但**每个工具的完整说明（含【边界】）都保留**——因为区分 「失信被执行」 / 「终本案件」 / 「限制高消费」 靠的正是【边界】那段。

合并要求「连说明文字也一致」而不只是同名。中途发现 `stock` 下 `windCode` 在板块工具里指板块代码、在公司工具里指股票代码，只按字段名合并会把错误的契约写进文档。

## 三、测试结果

### 3.1 离线契约测试（53 项，`tests/run-offline-tests.mjs`）

覆盖：8 类参数校验规则、SSE/纯 JSON 双解析、业务错误嗅探的正负样本、CLI 六种信封形态、`jsonrpc.id` 必须是整数、每次调用前必须 `initialize`、校验失败时零网络请求、离线命令零网络请求、`find` 的相关度排序与零命中语义、以及注册表与文档的一致性（每个工具都有样例、样例本身能过校验、每个工具在契约文档里有小节、SKILL.md 路由表覆盖 7 个 server、每个 server 都配了领域关键词）。

测试断言的是**用户实际看到的 stdout 信封**，不是内部函数返回值：用 `mock-fetch.mjs` 顶掉 `globalThis.fetch`，进程内调用 `cli.mjs` 导出的 `main()`。

**这一层当场抓到两个真实缺陷**（旧资料里的样例已与线上 schema 不一致）：
- `finance.general_search_documents` 的样例传 `documentType:"新闻"`，而 enum 声明的是 `news`/`na`/`rpp`
- `fund.fund_get_size` 的样例传了 `reportDate`，而该工具根本没有这个参数

### 3.2 边界测试（36 项，`tests/run-boundary-tests.mjs`）

| 分组 | 覆盖 |
| --- | --- |
| 畸形入参 | 空对象、省略参数、JSON 数组、`null`、必填传空串、`__proto__` 原型污染、5 万字符超长值、中文与全角引号、多余位置参数 |
| 参数文件与路径 | `@文件` 正常读入、内容非 JSON、路径穿越到 skill 目录外 |
| 协议与网络异常 | HTTP 401/403/429/500/503、空响应体、JSON-RPC error 对象、半截 SSE、空 content、纯 JSON 传输 |
| 注册表 | 工具名大小写错、用完整 server 名路由、不存在的工具提示 refresh、未知命令、缺参数 |
| 极值 | 数组超 `maxItems`（51 个代码）、重复元素、空数组、`startDate == endDate`、未来日期、日期时间的 `T` 分隔与带秒、枚举大小写 |
| 并发 | 4 路并发调用互不串扰 |

`__proto__`、路径穿越、并发串扰三项确认无问题；数组上下界一项**发现校验缺口并当场补上**（`fund` 批量工具的 `windCodes` 上限 50，原先只由后端截断）。

### 3.3 实盘冒烟（132 个工具，`node scripts/cli.mjs smoke`）

```
pass 129 / fail 3 / 132
finance 12/13   stock 15/15   fund 21/21   edb 3/3
futures 9/9     options 15/17   company 54/54
```

3 个失败全部是 `mcp-connection-guide.md` 已记录的服务端故障，且都带上了 `known_issue` 标注：

| 工具 | 状态 |
| --- | --- |
| `finance.quote_get_realtime_indicators` | 服务端不可用（09-04 曾正常） |
| `options.options_calc_accumulator` | 服务端持续不可用 |
| `options.options_calc_single_shark_fin` | 服务端持续不可用 |

对比基线：旧资料记录的是 126/132。差额来自修好的两个样例和补上的一个真实 `documentId`。

## 四、本次实测新发现的后端问题

以下五条是 `mcp-connection-guide.md` 里没有的，均已写进 `annotations.json` 并出现在生成的契约文档里。

### 4.1 `general_get_document` 拿不到正文（影响最大）

schema 的【返回】写「返回…**正文内容**及附件链接」，实测：

| documentType | 结果 |
| --- | --- |
| `news`（3 篇不同来源） | `文档内容` 是**空串**，只有标题、时间、来源、原文链接 |
| `na`（公告） | `文档内容` 是**空串** |
| `rpp`（研报） | `文档内容` = 「无此研报权限」 |

信封是 `isError:false`、文本是合法 JSON，**CLI 的错误嗅探抓不到这种形态**。要正文必须改用 `general_query_documents`（实测返回体的 `content` 字段带完整正文）。

已在 SKILL.md 第 1 节仲裁规则、第 4 节读回执、第 5 节已知的坑三处写明，并在第 4 节加了一条通用规则：**结构完整但关键字段是空串，同样按失败处理。**

### 4.2 EDB 转换币种后 `meta.unit` 不更新

```
call edb economic_query_indicator_series '{"question":"中国GDP现价","observation":3,"targetMagnitude":"亿","targetCurrency":"USD"}'
→ meta: {"unit":"亿元", "magnitude":"亿", "currency":"美元"}, value:[182497, 184696, 200583]
```

`unit` 写「亿元」，`currency` 却是「美元」，而 200583 显然是亿美元口径（人民币现价 GDP 是它的 7 倍量级）。

**这是唯一一类「照文档做、不报错、但答案错」的缺陷**——比参数报错危险得多。已在 SKILL.md 第 4 节和 `references/edb.md` 写明：传了 `targetCurrency` 时币种以 `meta.currency` 为准，不要照抄 `unit`。

### 4.3 说明文字与 enum 打架，且方向相反

| 字段 | 情况 | 处理 |
| --- | --- | --- |
| `edb…targetMagnitude` | 说明举例「元 / 亿元 / 万亿元 / 百万吨」**全部不在 enum 里**，enum 只收纯量级词 | 以 enum 为准，本地拦截；文档写明「要亿美元就填 `targetMagnitude:"亿"` + `targetCurrency:"USD"`」 |
| `finance…general_search_documents.documentType` | 说明写「可选值: 新闻、公告、研报」，enum 是 `news`/`na`/`rpp`；**实测两种都能调通** | 统一按 enum 传英文，与下游 `general_get_document` 保持一致 |
| `futures_get_basis.sector`、`futures_get_warehouse_receipt.type` | enum 只有英文，说明里附了「映射关系」表并写明**两种写法等价**；实测中文键确实能调通 | **校验器从说明里自动提取映射行**，中文键一并放行 |

第三条是本次改动里风险最高的一处：如果只按 enum 严格校验，`sector:"有色金属"` 这个**合法调用会被本地误杀**。校验器现在解析说明里的 `• 中文 = English` 行来构造别名集，不在映射表里的值（如「稀土」）仍然拦截。

### 4.4 `fund_get_size` 的 `reportDate` 是幽灵参数

工具说明写「`asOfDate` 控制日频类字段，**`reportDate` 控制报告期类字段**」，但 `properties` 里根本没有 `reportDate`，且该工具声明了 `additionalProperties:false`。实测传与不传返回**完全一致**——字段被静默忽略，报告期类字段始终返回最新一期。

### 4.5 波动率曲面的 `time` 会被向后对齐，且返回体里有个同名的入参回显

传 `2026-09-03 15:00`，返回体的 `calculationTime` 是 `15:05`——不报错、也不精确匹配。

更麻烦的是同一个返回体里还有 `meta_info.calcParams.time`，它原样回显**你传进去的** `15:00`，和权威的 `calculationTime` 直接打架。这与 4.2 的 `unit` / `currency` 是同一类陷阱：**返回体里同时存在「入参回显」和「实际生效值」两个字段，读错就报错数。** 已在 options 的调用要点里写明只读 `calculationTime`。

### 4.6 `futures_get_supply_demand` 一次返回里单位混排

沪铜库存（`type=4`）的同一批结果里，交易所库存用「吨」（上期所 63,000、LME 234,175），地区库存用「万吨」（上海保税区 3.62、广东 0.78），**量级差 1 万倍**。想算总库存的 agent 会直接把 63000 和 3.62 相加。已在 futures 的调用要点里写明逐行读各自的 `unit`、不要跨行相加。

### 4.7 `futures_get_basis` 的板块查询会被静默降级成单日

传 `sector`（板块）+ `startDate`/`endDate` 时，后端**不报错**，而是只返回 `endDate` 当日的截面，把说明埋在返回体的 `queryDataNote` 里：

```
{"sector":"有色金属","startDate":"2026-08-01","endDate":"2026-08-31"}
→ queryDataNote: "日期区间仅支持单品种查询，已返回最后日期 '2026-08-31' 的数据"
→ 日期集合只有 2026-08-31

{"windCodes":["CU.SHF"],"startDate":"2026-08-25","endDate":"2026-08-31"}
→ 日期集合 08-25 / 08-26 / 08-27 / 08-28 / 08-31（完整序列）
```

问「8 月板块基差走势」拿到的会是「8 月 31 日板块基差截面」，**不看 `queryDataNote` 根本发现不了**。要板块历史序列只能逐品种用 `windCodes` 循环。已写进 futures 的调用要点和该工具的已知故障。

## 五、子 agent 亲和测试

方法：起一个**只能读本 skill 目录**的子 agent（明确禁止读旧 skill、禁止 WebSearch、禁止直接用 MCP 工具），给它真实用户问句，要求它按 SKILL.md 的流程自己选路由、自己查契约、自己发命令，并汇报每一步的依据和踩到的坑。跑了两轮：第一轮探路，按结果改文档；第二轮回归验证改动是否真的挡住了坑。

### 5.1 第一轮：8 个问题

覆盖股票估值、企业失信、宏观折算、期货库存、期权曲面、基金持仓、文档正文，外加一个越界问题（比特币）。

**路由结果：8 题里 7 题在读任何 references 之前就定对了 server**，全部依据 SKILL.md 第 1 节的路由表和 4 条仲裁规则；没有一题是靠读契约才纠正路由的。唯一犹豫的是「沪铜库存」——`futures_get_warehouse_receipt` 和 `futures_get_supply_demand` 都自称管仓单，靠 guidance 里「问『库存』传 4」那句拉直。

越界题的判断链条完整：路由表 7 行都不覆盖加密货币 → 仲裁规则第 2 条列举的兜底资产是**闭合列举**（债券、外汇、商品现货、全球指数），比特币不在其中 → 又跑了 6 个关键词的离线 `find` 做实证 → 判 `OUT_OF_SCOPE`。

**错误信息可用性**：4 次故意错参的探针，`message` 全部足够直接改对，一次都不需要回头翻文档。子 agent 的原话是「未知参数拦截那条不仅报出唯一合法字段名，还解释了为什么本地要拦——这一句直接消解了我加 `--allow-unknown` 绕过去的冲动」。

**这一轮暴露的问题，全部已修**：

| 问题 | 严重度 | 处理 |
| --- | --- | --- |
| EDB 折美元后照抄 `meta.unit` 会报错单位（不报错的错答案） | 高 | SKILL.md 第 4 节 + edb guidance + 工具 `known_issue` 三处写明 |
| `general_get_document` 正文为空，且原 `known_issue` 把人往「id 选错了」误导 | 高 | 改路由到 `general_query_documents`，重写 `known_issue`，SKILL.md 第 5 节加坑 |
| `targetMagnitude` 的说明举例全部非法 | 中 | edb guidance 加 ⚠，写清「亿美元 = `targetMagnitude:"亿"` + `targetCurrency:"USD"`」 |
| `companyKey` 被错误归进「不能自己编 id」的两段式表 | 中 | 移出该表，另写一段：已给全称可直接传，不必先搜实体 |
| `ROUTE_ERROR` 承诺给近似工具名但实际没给 | 中 | 近似匹配改为按下划线切词打分，`stock_get_valuation` 现在能命中 `stock_get_company_valuation` |
| 「结构完整但关键字段是空串」这种失败形态没有判定规则 | 中 | SKILL.md 第 4 节加为通用规则 |
| `--raw`、`doctor`、`diff`、`smoke` 在 SKILL.md 里缺席 | 低 | 第 2 节补全，并说明裸跑 CLI 会打印完整用法 |
| 第 3 节参数传递、第 4 节自检 6 条冗余 | 低 | 参数传递收紧，自检从 6 条压到 4 条 |

### 5.2 第二轮：回归验证

针对上面修掉的 6 个点各设一题，要求子 agent 汇报「有没有被文档提前拦住」。

**结果：6 题全部首调成功、6 次网络请求、零重试、零错答。六个防错点判定全部「生效」，无一「未生效」，无一「文档没提到」。**

几个值得记的细节：

- **EDB 单位**：子 agent 原本要照 `targetMagnitude` 的 description 填 `"亿元"`，被 guidance 那句「说明举例全部非法」挡下。最终报的是「亿美元」，并明确写出判定依据是 `meta.currency` 而非 `meta.unit`。
- **失信记录**：只发了 1 次请求。若没有那段「已给全称可直接传」，按两段式表的惯性会先调 `company_search_entity`，变成 2 次。
- **库存二选一**：双向兜底生效——从 guidance 进去会被导向 `supply_demand type=4`，从错误的 `warehouse_receipt` 进去也会被它的 `known_issue` 推回来。
- **`sector` 中文键**：子agent 故意填了不在 enum 里的「有色金属」验证放行逻辑，本地未拦、后端正常返回。
- **曲面时点**：传 `15:00`，返回 `calculationTime: 15:05`，与 guidance 的预言一字不差，子 agent 按要求核对后据实报了 15:05。

**第二轮新发现 4 个问题，也已全部修掉**：

| 问题 | 处理 |
| --- | --- |
| 曲面返回体里 `meta_info.calcParams.time` 是**入参回显**，与权威的 `calculationTime` 打架（与 `unit`/`currency` 同构的陷阱） | options guidance 补一句「只读 `calculationTime`」 |
| **`find GDP` 零命中**，而 SKILL.md 把 `find` 抬成越界判据——严格照做会把「中国 GDP」判成 `OUT_OF_SCOPE` | 两头改：`find` 加 server 级领域关键词，`find GDP` 现在返回 `related_servers: [edb]`；零命中时强制输出一句「这不构成不支持的证据，回路由表复核」。SKILL.md 第 1 节改写为「越界判定以路由表为准，find 只作辅助」 |
| `find` 召回不稳定（`find 库存` 只命中 1 个、`find 仓单` 命中 3 个） | 同上：领域关键词兜底 + 零命中提示 |
| `futures_get_supply_demand` 一次返回里单位混排（「吨」与「万吨」并存，量级差 1 万倍） | futures guidance 补一句「逐行读各自的 `unit`，不要跨行相加」 |

子 agent 的结论原话：能，六题全部首调成功；**但前提是遵守「先按路由表定 server、再 `list-tools`/`describe` 定工具」的顺序**——关键防错信息大量沉在 `list-tools` 的 guidance 和 `describe` 的 `known_issue` 里，只读 SKILL.md 正文会漏掉其中两条。这条意见已经反映到 SKILL.md 第 1、2 节的措辞里。

### 5.3 第三轮：验证分层加载

改成「路由表 → 目录 → 单工具契约 → 单参数」四层后，起第三个子 agent 验证。5 个问题，重点不是能不能答对，而是**读了什么、浪费了多少**。

**结果：5 题全部首调成功。** 更重要的两条：

- **`scripts/registry.json`（35 万字节）全程没被读，连 `grep` 都没跑。** SKILL.md 那句「那是给 CLI 用的，你不需要读它」有效。
- **`scripts/cli.mjs` 也没被读**——文档把四个子命令和传参方式讲清了，没有需要看源码才能解开的问题。

参数来源分布很能说明分层是否合理：3 题直接照抄目录里的样例（零 `describe`），1 题必须 `describe`（期权定价器 9 个必填参数，输出一个字没浪费），1 题靠目录顶部的「调用要点」（`sector` 收中文键那条）。

**子 agent 自己算的账**：读进约 56 KB，真正参与决策的 6–8 KB。浪费的大头**不是 `describe`**（命中率很高），而是四份目录里那 101 个它根本不会碰的工具行。它的原话：

> 真正的节省来自「按 server 切分」，不是来自「目录 + describe」……「目录 + describe」的真正价值是把「读 54 个工具的全参数」变成「读 1 个工具的全参数」——这是 54:1，很划算。
> 用一次往返换 30 倍上下文，这笔账没有犹豫的余地。

它也点出了结构的边界：**窄任务（每题只碰 1 个工具）最优，宽任务会退化**——要把一家企业的所有风险维度都拉一遍时，十几次 `describe` 的往返成本会追上大文件。这是取舍，不是缺陷。

**这一轮发现并已修掉的 5 个问题**：

| 问题 | 处理 |
| --- | --- |
| 目录的「用途」列对 54 个 company 工具基本是把工具名翻译回中文，信息增量接近零；真正区分它们的【边界】被砍掉了 | 目录加一列「别选错」＝【边界】首句（截断 56 字）。company.md 因此从 7387 涨到 8610 字，值得 |
| 「除非原样照抄样例」这个豁免覆盖了 83% 的 company 工具，把「必须 describe」架空，两句话互相打架 | 改写成两个必须同时成立的条件：**工具选得准**（目录的「别选错」列已把相邻工具区分开，或用户用了工具名原词）**且参数不用改**。有一条不成立就先 `describe` |
| 每份目录末尾的结尾语是机械复制的，`fund.md` / `options.md` 里在举司法案件的例子，纯噪声 | 改成每个 server 自己的「最容易选错的」，写进 `annotations.json`，测试断言不串台 |
| 目录的「加粗=必填」表达不了「`windCodes` 与 `sector` 至少提供一个」这种二选一约束 | 从 schema 说明里检测「至少提供一个 / 二选一」，在入参列加 `⚠二选一，见 describe` 标记 |
| 为了确认 `sector` 一个字段的取值，得把整份 4 KB 契约拉下来（其中 60% 是用不上的映射表） | 新增 `describe <server> <tool> <param>`，只输出那一个字段的类型、enum、等价写法、默认值和样例值。`futures_get_basis` 从 2271 字降到 1157 字 |

**同时发现一个新的后端问题**（已写进契约，见 4.7）。

## 六、与现有 `wind-mcp-skill` 的关系

两套 server **都还在线**（本次实测确认），能力不是替代而是分层：

| | `wind-mcp-skill`（旧） | `wind-mcp-research-skill`（新） |
| --- | --- | --- |
| server | `vserver_stock_data` 等 7 个 | `vserver_finance_data` 等 7 个 |
| 工具数 | 35 | 132 |
| 定位 | 行情与基础数据，自然语言问句为主 | 投研级：加了期货、期权与定价、企业工商风控、投研文档与语料、基金归因 |
| 参数风格 | 大量 `question` 自然语言入参 | 以结构化参数为主，自然语言只作兜底 |

覆盖上新的是超集，但两者的**参数风格差异很大**，不是换个 endpoint 就能迁移。本次不动旧 skill；是否合并或下线，建议按实际调用量另行决定。已在仓库 README 的「数据获取类」表格里并列登记。

## 七、遗留问题与建议

| # | 问题 | 影响 | 建议 |
| --- | --- | --- | --- |
| 1 | `options_calc_accumulator`、`options_calc_single_shark_fin` 服务端持续不可用 | 累计期权与鲨鱼鳍定价能力缺失 | 报给后端；skill 侧已标 `known_issue`，不重试 |
| 2 | `general_get_document` 拿不到正文 | 「读某篇公告/新闻全文」这个需求只能靠 `general_query_documents` 近似满足 | 报给后端；skill 侧已改路由 |
| 3 | 研报正文返回「无此研报权限」 | 当前 Key 无研报权限，`documentType:"rpp"` 只能列清单 | 确认是权限还是能力问题 |
| 4 | EDB 转币种后 `meta.unit` 不更新 | 会导致不报错的错误答案 | 报给后端；skill 侧已在三处写明 |
| 5 | 多个字段的说明举例与自己的 enum 冲突 | 照抄说明会被拦或调错 | 报给后端；skill 侧以 enum 为准 + 自动提取等价写法 |
| 6 | `registry.json` 有 354KB | 仓库体积；但 agent 从不读它（第三轮子 agent 实测确认，连 grep 都没跑），只读生成出的目录 | 保留。它是校验和文档生成的唯一真源，删了就退回手工维护 |
| 7 | 样例入参里有日期与 `documentId` | 时间推移后冒烟会出现「非故障失败」 | `run-offline-tests.mjs` 的一致性检查会点名失效样例，按提示更新 `annotations.json` |

## 八、维护动作速查

```bash
cd skills/wind-mcp-research-skill

node scripts/cli.mjs doctor            # Key + 7 个 server 连通性 + 注册表漂移
node scripts/cli.mjs diff company      # 只看差异
node scripts/cli.mjs refresh company   # 拉最新 schema 写回 registry.json 并重生成全部目录
node scripts/cli.mjs refresh           # 同上，7 个 server 全量
node tests/run-offline-tests.mjs       # 会点名因 schema 变动而失效的样例
node scripts/cli.mjs smoke             # 132 个工具实盘冒烟

跑测试或在开发仓里工作时先 `export WIND_SKILL_NO_UPDATE=1`，否则每次 `call` 成功都会在后台起一次 skill 自更新。
```

人工知识只写在 `scripts/annotations.json`：server 的 `guidance`、每个工具的 `sample` 与 `knownIssue`。改完跑 `node scripts/cli.mjs refresh` 即可同步到全部工具目录。
