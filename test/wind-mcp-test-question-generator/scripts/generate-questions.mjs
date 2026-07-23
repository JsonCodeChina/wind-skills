#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = { count: 100, format: "json", seed: String(Date.now()), skill: "", output: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--help" || key === "-h") out.help = true;
    else if (["--count", "--format", "--seed", "--skill", "--output"].includes(key)) out[key.slice(2)] = argv[++i];
    else throw new Error(`未知参数: ${key}`);
  }
  out.count = Number.parseInt(out.count, 10);
  if (!Number.isInteger(out.count) || out.count < 1 || out.count > 10000) throw new Error("--count 必须是 1-10000 的整数");
  if (!["json", "md", "txt"].includes(out.format)) throw new Error("--format 必须是 json、md 或 txt");
  return out;
}

function hashSeed(text) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFromSeed(seed) {
  let a = hashSeed(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const sample = (r, xs, min = 1, max = 3) => {
  const copy = [...xs];
  const n = Math.min(copy.length, min + Math.floor(r() * (max - min + 1)));
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
};
const joinZh = (xs) => xs.join("、");

const stocks = [
  ["贵州茅台", "600519.SH"], ["宁德时代", "300750.SZ"], ["招商银行", "600036.SH"],
  ["比亚迪", "002594.SZ"], ["中国平安", "601318.SH"], ["腾讯控股", "0700.HK"],
  ["苹果公司", "AAPL.O"], ["英伟达", "NVDA.O"]
];
const aStocks = stocks.slice(0, 5);
const funds = [
  ["易方达蓝筹精选", "005827.OF"], ["华夏成长混合", "000001.OF"],
  ["科创芯片ETF", "588200.SH"], ["创业板ETF", "159915.SZ"]
];
const tradedFunds = funds.slice(2);
const indexes = [
  ["沪深300", "000300.SH"], ["中证500", "000905.SH"], ["上证50", "000016.SH"], ["恒生指数", "HSI.HI"]
];
const bonds = ["国债2601", "24附息国债11", "浦发转债", "23国开05"];
const dates = [
  ["2024-01-02", "2024-06-28"], ["2024-07-01", "2024-12-31"],
  ["2025-01-02", "2025-12-31"], ["2026-01-05", "2026-06-30"]
];
const periods = ["1d", "1w", "1mo", "5min", "30min", "60min"];
const priceIndexes = ["最新成交价", "今日开盘价", "今日最高价", "今日最低价", "成交量", "前收盘价"];

function named(r, pool) {
  const [name, code] = pick(r, pool);
  return { name, code, label: pick(r, [name, `${name}（${code}）`, code]) };
}

function nlCase(r, server, tool, pool, topics) {
  const asset = named(r, pool);
  const topic = joinZh(sample(r, topics, 1, 3));
  const question = pick(r, [
    `查询${asset.label}的${topic}`,
    `请给出${asset.label}的${topic}`,
    `${asset.label}目前的${topic}是什么？`
  ]);
  return make(server, tool, question, { question, lang: "zh-CN" }, ["自然语言", asset.code, topic]);
}

function make(server_type, tool_name, question, params, tags = []) {
  return { question, expected: { server_type, tool_name, params }, variation_tags: tags };
}

function kline(r, server, tool, pool) {
  const asset = named(r, pool);
  const [begin_date, end_date] = pick(r, dates);
  const period = pick(r, periods);
  const aftype = pick(r, ["0", "1"]);
  const count = pick(r, [10, 20, 30, -10, -20]);
  const question = `查询${asset.label}从${begin_date}到${end_date}的${period} K线，${aftype === "0" ? "前复权" : "后复权"}，取${Math.abs(count)}条数据`;
  return make(server, tool, question, { windcode: asset.code, begin_date, end_date, count, period, aftype, issusp: pick(r, ["0", "1"]) }, ["日期区间", period, `aftype=${aftype}`]);
}

function quote(r, server, tool, pool) {
  const asset = named(r, pool);
  const [begin_date, end_date] = pick(r, dates);
  const question = `查看${asset.label}在${begin_date}至${end_date}的分钟行情走势`;
  return make(server, tool, question, { windcode: asset.code, begin_date, end_date }, ["分钟行情", "日期区间"]);
}

function price(r, server, tool, pool) {
  const asset = named(r, pool);
  const selected = sample(r, priceIndexes, 1, 4);
  const question = `查询${asset.label}最新的${joinZh(selected)}`;
  return make(server, tool, question, { windcode: asset.code, indexes: selected.join(",") }, ["行情快照", ...selected]);
}

const builders = {
  stock_data: {
    get_stock_price_indicators: r => price(r, "stock_data", "get_stock_price_indicators", stocks),
    get_risk_metrics: r => nlCase(r, "stock_data", "get_risk_metrics", stocks, ["Beta", "年化波动率", "最大回撤", "夏普比率", "95%置信度VaR"]),
    get_stock_events: r => nlCase(r, "stock_data", "get_stock_events", stocks, ["分红派息历史", "限售解禁安排", "股权激励", "违规处罚", "增发进度"]),
    get_stock_kline: r => kline(r, "stock_data", "get_stock_kline", stocks),
    get_stock_basicinfo: r => nlCase(r, "stock_data", "get_stock_basicinfo", stocks, ["注册地址", "主营业务", "上市日期", "行业分类", "法定代表人"]),
    get_stock_equity_holders: r => nlCase(r, "stock_data", "get_stock_equity_holders", stocks, ["前十大股东", "自由流通股本", "机构持股比例", "股东户数", "实际控制人"]),
    get_stock_fundamentals: r => {
      const asset = named(r, aStocks); const year = pick(r, [2023, 2024, 2025]);
      const fields = joinZh(sample(r, ["营业收入", "归母净利润", "ROE", "毛利率", "PE-TTM", "PB", "经营现金流净额"], 2, 4));
      const question = `查询${asset.label}${year}-12-31的${fields}`;
      return make("stock_data", "get_stock_fundamentals", question, { question, lang: "zh-CN" }, ["A股基本面", String(year), fields]);
    },
    get_stock_quote: r => quote(r, "stock_data", "get_stock_quote", stocks),
    get_stock_technicals: r => nlCase(r, "stock_data", "get_stock_technicals", stocks, ["最近20日收盘价", "MACD", "RSI", "成交量", "换手率", "融资余额"]),
    search_stocks: r => {
      const industry = pick(r, ["半导体", "银行", "新能源", "医药", "食品饮料"]);
      const cap = pick(r, [100, 300, 500, 1000]); const days = pick(r, [3, 5, 10, 20]);
      const question = `筛选A股${industry}行业中总市值2超过${cap}亿元且最近${days}日涨幅为正的股票`;
      return make("stock_data", "search_stocks", question, { question, lang: "zh-CN" }, ["选股", industry, `市值>${cap}亿`, `${days}日`]);
    }
  },
  fund_data: {
    get_fund_price_indicators: r => price(r, "fund_data", "get_fund_price_indicators", tradedFunds),
    get_fund_kline: r => kline(r, "fund_data", "get_fund_kline", tradedFunds),
    get_fund_financials: r => nlCase(r, "fund_data", "get_fund_financials", funds, ["基金利润", "管理费", "托管费", "单位分红", "资产总值"]),
    get_fund_holdings: r => nlCase(r, "fund_data", "get_fund_holdings", funds, ["前十大股票持仓", "债券持仓", "行业配置", "重仓股占比"]),
    get_fund_company_info: r => nlCase(r, "fund_data", "get_fund_company_info", funds, ["基金公司管理规模", "基金经理人数", "成立日期", "旗下基金数量"]),
    get_fund_quote: r => quote(r, "fund_data", "get_fund_quote", tradedFunds),
    get_fund_info: r => nlCase(r, "fund_data", "get_fund_info", funds, ["基金经理", "最新规模", "成立日期", "投资类型", "申购赎回状态"]),
    get_fund_holders: r => nlCase(r, "fund_data", "get_fund_holders", funds, ["机构持有人比例", "个人持有人比例", "持有人户数", "内部持有份额"]),
    get_fund_performance: r => nlCase(r, "fund_data", "get_fund_performance", funds, ["近一年年化收益率", "同类排名", "最大回撤", "年化夏普比率", "区间净流入额"]),
    search_funds: r => {
      const type = pick(r, ["股票型基金", "混合型基金", "指数基金", "ETF"]);
      const ret = pick(r, [5, 10, 15, 20, 30]); const scale = pick(r, [5, 10, 50, 100]);
      const question = `筛选近一年收益率超过${ret}%且规模大于${scale}亿元的${type}`;
      return make("fund_data", "search_funds", question, { question, lang: "zh-CN" }, ["基金筛选", type, `收益>${ret}%`, `规模>${scale}亿`]);
    }
  },
  index_data: {
    get_index_technicals: r => nlCase(r, "index_data", "get_index_technicals", indexes, ["MACD", "RSI", "20日涨跌幅", "布林带", "波动率"]),
    get_index_quote: r => quote(r, "index_data", "get_index_quote", indexes),
    get_index_kline: r => kline(r, "index_data", "get_index_kline", indexes),
    get_index_fundamentals: r => nlCase(r, "index_data", "get_index_fundamentals", indexes, ["PE", "PB", "PS", "历史估值分位", "成份股加权营收"]),
    get_index_price_indicators: r => price(r, "index_data", "get_index_price_indicators", indexes),
    get_index_basicinfo: r => nlCase(r, "index_data", "get_index_basicinfo", indexes, ["发布机构", "基日", "基点", "计算方法", "成份股数量"])
  },
  bond_data: {
    get_bond_basicinfo: r => {
      const b = pick(r, bonds); const topic = joinZh(sample(r, ["发行日期", "发行规模", "票面利率", "期限", "兑付安排"], 2, 4));
      const question = `查询${b}的${topic}`; return make("bond_data", "get_bond_basicinfo", question, { question, lang: "zh-CN" }, ["债券档案", topic]);
    },
    get_bond_issuer_info: r => {
      const b = pick(r, bonds); const topic = joinZh(sample(r, ["发债主体名称", "注册地址", "行业分类", "股权结构"], 1, 3));
      const question = `查询${b}发行人的${topic}`; return make("bond_data", "get_bond_issuer_info", question, { question, lang: "zh-CN" }, ["发行人", topic]);
    },
    get_bond_market_data: r => {
      const b = pick(r, bonds); const topic = joinZh(sample(r, ["估价", "溢价", "久期", "凸性", "利差"], 2, 4));
      const question = `查询${b}当前的${topic}`; return make("bond_data", "get_bond_market_data", question, { question, lang: "zh-CN" }, ["债券行情估值", topic]);
    },
    get_bond_financial_data: r => {
      const b = pick(r, bonds); const year = pick(r, [2023, 2024, 2025]);
      const topic = joinZh(sample(r, ["营业收入", "净利润", "总资产", "总负债"], 2, 3));
      const question = `查询${b}发债主体${year}年的${topic}`; return make("bond_data", "get_bond_financial_data", question, { question, lang: "zh-CN" }, ["发行人财务", String(year), topic]);
    }
  },
  financial_docs: {
    get_company_announcements: r => {
      const asset = named(r, stocks); const top_k = pick(r, [3, 5, 8, 10]);
      const topic = pick(r, ["年度报告", "分红公告", "董事会决议", "风险提示", "招股说明书"]);
      const question = `检索${asset.label}在2025年至2026年的${topic}，最多返回${top_k}条`;
      return make("financial_docs", "get_company_announcements", question, { question, top_k }, ["公告", topic, `top_k=${top_k}`]);
    },
    get_financial_news: r => {
      const subject = pick(r, [...stocks.map(x => x[0]), "人工智能行业", "新能源汽车行业", "A股市场"]);
      const top_k = pick(r, [3, 5, 8, 10]); const span = pick(r, ["最近一周", "最近一个月", "2026年上半年"]);
      const question = `检索${subject}${span}的财经新闻，最多返回${top_k}条`;
      return make("financial_docs", "get_financial_news", question, { question, top_k }, ["财经新闻", span, `top_k=${top_k}`]);
    }
  },
  economic_data: {
    natural_language_get_edb_data: r => {
      const mode = pick(r, ["仅搜索", "仅提数", "搜索并提数"]);
      let params; let question;
      if (mode === "仅搜索") {
        const subject = pick(r, ["中国GDP", "美国CPI", "上海社会消费品零售总额", "中国制造业PMI"]);
        question = `查找与${subject}相关的Wind EDB指标，不需要返回数值`;
        params = { executionMode: mode, question: subject };
      } else {
        const useObservation = r() < 0.5;
        const subject = mode === "仅提数" ? pick(r, ["G0000069", "G8411182", "G0000069,G8411182"]) : pick(r, ["中国GDP", "美国CPI", "中国新能源汽车产量"]);
        params = { executionMode: mode, question: subject };
        if (useObservation) params.observation = pick(r, ["3", "6", "12", "all"]);
        else [params.begin_date, params.end_date] = pick(r, dates);
        question = `${mode === "仅提数" ? "提取" : "搜索并提取"}${subject}${useObservation ? `最近${params.observation === "all" ? "全部" : params.observation + "期"}` : `从${params.begin_date}到${params.end_date}`}的数据`;
      }
      return make("economic_data", "natural_language_get_edb_data", question, params, ["EDB", mode, params.observation ? "observation" : "date-range"]);
    }
  },
  analytics_data: {
    get_financial_data: r => {
      const industry = pick(r, ["半导体", "银行", "新能源车", "医药", "食品饮料", "计算机"]);
      const year = pick(r, [2023, 2024, 2025, 2026]);
      const metric = pick(r, ["营业收入", "归母净利润", "总市值", "经营现金流", "研发费用"]);
      const method = pick(r, ["合计值并按公司贡献排序", "市值加权平均值", "行业中位数及公司排名", "同比增速分布"]);
      const question = `计算A股${industry}行业${year}年${metric}的${method}`;
      return make("analytics_data", "get_financial_data", question, { question, lang: "zh-CN" }, ["聚合计算", industry, String(year), metric, method]);
    }
  }
};

function loadManifest(skillDir) {
  const file = path.join(skillDir, "scripts", "tool-manifest.json");
  if (!fs.existsSync(file)) throw new Error(`找不到工具清单: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function allToolKeys(manifest) {
  return Object.entries(manifest).flatMap(([server, tools]) => tools.map(tool => `${server}.${tool}`));
}

function generate(args) {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const skillDir = args.skill
    ? path.resolve(process.cwd(), args.skill)
    : path.resolve(scriptDir, "..", "..", "..", "skills", "wind-mcp-skill");
  const manifest = loadManifest(skillDir);
  const contractTools = allToolKeys(manifest);
  const missingBuilders = contractTools.filter(key => {
    const [server, tool] = key.split(".");
    return typeof builders[server]?.[tool] !== "function";
  });
  const extraBuilders = Object.entries(builders).flatMap(([server, group]) => Object.keys(group).map(tool => `${server}.${tool}`)).filter(key => !contractTools.includes(key));
  if (missingBuilders.length || extraBuilders.length) {
    throw new Error(`生成器与契约不一致。缺少构建器: ${missingBuilders.join(", ") || "无"}；多余构建器: ${extraBuilders.join(", ") || "无"}`);
  }

  const r = rngFromSeed(args.seed);
  const selected = [];
  const shuffled = sample(r, contractTools, contractTools.length, contractTools.length);
  for (let i = 0; i < args.count; i += 1) selected.push(i < shuffled.length ? shuffled[i] : pick(r, contractTools));

  const seen = new Set();
  const cases = selected.map((key, index) => {
    const [server, tool] = key.split(".");
    let item;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      item = builders[server][tool](r);
      if (!seen.has(item.question)) break;
    }
    if (seen.has(item.question)) {
      item.question = `${item.question}，并注明数据口径（测试用例${index + 1}）`;
      if ("question" in item.expected.params) item.expected.params.question = item.question;
      item.variation_tags.push("去重变体");
    }
    seen.add(item.question);
    return { id: String(index + 1).padStart(3, "0"), ...item };
  });

  const covered = [...new Set(cases.map(x => `${x.expected.server_type}.${x.expected.tool_name}`))].sort();
  const summary = {
    requested_count: args.count,
    generated_count: cases.length,
    unique_questions: seen.size,
    contract_tool_count: contractTools.length,
    covered_tool_count: covered.length,
    missing_tools: contractTools.filter(x => !covered.includes(x)),
    by_server: Object.fromEntries(Object.keys(manifest).map(server => [server, cases.filter(x => x.expected.server_type === server).length]))
  };
  return { seed: args.seed, generated_at: new Date().toISOString(), source_skill: skillDir, summary, cases };
}

function render(data, format) {
  if (format === "json") return `${JSON.stringify(data, null, 2)}\n`;
  if (format === "txt") return `${data.cases.map(x => `${x.id}. ${x.question}`).join("\n")}\n`;
  const lines = [
    "# Wind MCP 随机测试问题",
    "",
    `- Seed: \`${data.seed}\``,
    `- 题目: ${data.summary.generated_count}`,
    `- 唯一题目: ${data.summary.unique_questions}`,
    `- 工具覆盖: ${data.summary.covered_tool_count}/${data.summary.contract_tool_count}`,
    "",
    ...data.cases.map(x => `${Number(x.id)}. ${x.question}  \n   \`${x.expected.server_type}.${x.expected.tool_name}\``),
    ""
  ];
  return lines.join("\n");
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("用法: node generate-questions.mjs [--skill PATH] [--count 100] [--seed TEXT] [--format json|md|txt] [--output FILE]");
  process.exit(0);
}
const data = generate(args);
const output = render(data, args.format);
if (args.output) fs.writeFileSync(path.resolve(args.output), output, "utf8");
else process.stdout.write(output);
console.error(JSON.stringify(data.summary));
