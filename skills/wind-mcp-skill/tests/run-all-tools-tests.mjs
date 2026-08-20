// Integration smoke test across every tool in the manifest, correct + error cases.
// This hits the REAL backend, so it needs credentials and network — it is NOT a
// hermetic unit test (run it manually, not in CI).
//
// Requirements:
//   - a usable key: skill config.json (wind_api_key) or env WIND_API_KEY
//   - to include the economic_data new tools, also preload tests/redirect-fetch.mjs
//     and set WIND_NEWTOOLS_URL / WIND_NEWTOOLS_SESSION (otherwise they are skipped)
//
// Usage (the runner applies redirect-fetch.mjs to each spawned cli.mjs itself):
//   node tests/run-all-tools-tests.mjs
//   WIND_NEWTOOLS_URL=... WIND_NEWTOOLS_SESSION=... NODE_TLS_REJECT_UNAUTHORIZED=0 \
//     node tests/run-all-tools-tests.mjs
//
// Verdicts:
//   valid case  -> PASS if the CLI handled it (exit0 success OR backend_error);
//                  FAIL only if a *well-formed* request tripped local validation/routing
//   error case  -> PASS if the CLI returns the expected local error code
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = dirname(TESTS_DIR);
const CLI = join(SKILL_DIR, 'scripts', 'cli.mjs');
const REDIRECT = join(TESTS_DIR, 'redirect-fetch.mjs');
const ROUNDS = Number(process.env.ROUNDS || 1);
const hasNewtools = !!(process.env.WIND_NEWTOOLS_URL && process.env.WIND_NEWTOOLS_SESSION);
const LOCAL_CODES = new Set(['PARAM_VALIDATION_ERROR', 'PARAM_TYPE_ERROR', 'ROUTE_ERROR', 'INVALID_PARAMS_JSON', 'USAGE_ERROR', 'PARAMS_FILE_ERROR']);
const D = { bd: '2026-08-03', ed: '2026-08-18', day: '2026-08-18' };

// [server, tool, validArgs, errorArgs, expectedErrorCode]
const CASES = [
  ['stock_data', 'search_stocks', { question: '筛选沪深市场市值超5000亿的股票' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['stock_data', 'get_stock_basicinfo', { question: '贵州茅台600519.SH的上市板与行业分类' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['stock_data', 'get_stock_fundamentals', { question: '贵州茅台600519.SH最新一期ROE和营业收入' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['stock_data', 'get_stock_equity_holders', { question: '贵州茅台600519.SH前十大股东' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['stock_data', 'get_stock_events', { question: '贵州茅台600519.SH的分红派息历史' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['stock_data', 'get_stock_technicals', { question: '贵州茅台600519.SH最近20日的MACD' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['stock_data', 'get_risk_metrics', { question: '宁德时代300750.SZ过去1年的Beta和最大回撤' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['stock_data', 'get_stock_price_indicators', { windcode: '600519.SH', indexes: '中文简称,最新成交价,涨跌幅' }, { windcode: 123, indexes: '中文简称' }, 'PARAM_TYPE_ERROR'],
  ['stock_data', 'get_stock_kline', { windcode: '600519.SH', begin_date: D.bd, end_date: D.ed }, { windcode: '600519.SH', begin_date: D.bd }, 'PARAM_VALIDATION_ERROR'],
  ['stock_data', 'get_stock_quote', { windcode: '600519.SH', begin: D.day, end: D.day }, { windcode: '600519.SH', begin: D.day }, 'PARAM_VALIDATION_ERROR'],
  ['fund_data', 'search_funds', { question: '筛选股票型基金中近一年收益率超20%的产品' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['fund_data', 'get_fund_holdings', { question: '华夏成长000001.OF的重仓股' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['fund_data', 'get_fund_performance', { question: '华夏成长000001.OF近一年的收益率' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['fund_data', 'get_fund_holders', { question: '华夏成长000001.OF的持有人结构' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['fund_data', 'get_fund_company_info', { question: '华夏基金管理有限公司的基本信息' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['fund_data', 'get_fund_financials', { question: '华夏成长000001.OF的财务数据' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['fund_data', 'get_fund_info', { question: '华夏成长000001.OF的投资类型和现任基金经理' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['fund_data', 'get_fund_price_indicators', { windcode: '510300.SH', indexes: '中文简称,最新成交价' }, { windcode: 123, indexes: '中文简称' }, 'PARAM_TYPE_ERROR'],
  ['fund_data', 'get_fund_kline', { windcode: '510300.SH', begin_date: D.bd, end_date: D.ed }, { windcode: '510300.SH', begin_date: D.bd }, 'PARAM_VALIDATION_ERROR'],
  ['fund_data', 'get_fund_quote', { windcode: '510300.SH', begin: D.day, end: D.day }, { windcode: '510300.SH', begin: D.day }, 'PARAM_VALIDATION_ERROR'],
  ['index_data', 'get_index_basicinfo', { question: '沪深300指数000300.SH的基本信息' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['index_data', 'get_index_fundamentals', { question: '沪深300指数000300.SH的市盈率' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['index_data', 'get_index_technicals', { question: '沪深300指数000300.SH最近20日的涨跌幅' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['index_data', 'get_index_price_indicators', { windcode: '000300.SH', indexes: '中文简称' }, { windcode: 123, indexes: '中文简称' }, 'PARAM_TYPE_ERROR'],
  ['index_data', 'get_index_kline', { windcode: '000300.SH', begin_date: D.bd, end_date: D.ed }, { windcode: '000300.SH', begin_date: D.bd }, 'PARAM_VALIDATION_ERROR'],
  ['index_data', 'get_index_quote', { windcode: '000300.SH', begin: D.day, end: D.day }, { windcode: '000300.SH', begin: D.day }, 'PARAM_VALIDATION_ERROR'],
  ['bond_data', 'get_bond_basicinfo', { question: '24附息国债11的基本信息' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['bond_data', 'get_bond_issuer_info', { question: '贵州茅台作为发债主体的信息' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['bond_data', 'get_bond_market_data', { question: '24附息国债11的行情估值' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['bond_data', 'get_bond_financial_data', { question: '贵州茅台作为发债主体的财务数据' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['financial_docs', 'get_company_announcements', { query: '贵州茅台最近的公告' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['financial_docs', 'get_financial_news', { query: '美联储利率政策' }, {}, 'PARAM_VALIDATION_ERROR'],
  ['analytics_data', 'get_financial_data', { question: '查询中国A股市场过去一年的平均成交量' }, {}, 'PARAM_VALIDATION_ERROR'],
];
const ECON_CASES = [
  ['economic_data', 'natural_language_get_edb_data', { executionMode: '搜索并提数', question: '中国GDP现价当季值', observation: '6' }, { question: '中国GDP' }, 'PARAM_VALIDATION_ERROR'],
];
// meta routing / json — [name, argv, expectedCode]. wrong-tool uses a non-remappable tool.
const META = [
  ['unknown server_type', ['call', 'bad_data', 'get_x', '{}'], 'ROUTE_ERROR'],
  ['wrong tool for server', ['call', 'stock_data', 'get_bond_basicinfo', '{"question":"x"}'], 'ROUTE_ERROR'],
  ['malformed JSON', ['call', 'stock_data', 'get_stock_basicinfo', '{bad json'], 'INVALID_PARAMS_JSON'],
  ['array params', ['call', 'stock_data', 'get_stock_basicinfo', '[]'], 'PARAM_TYPE_ERROR'],
];

function runCli(argv) {
  const nodeArgs = hasNewtools ? ['--import', REDIRECT, CLI, ...argv] : [CLI, ...argv];
  const r = spawnSync('node', nodeArgs, { env: process.env, encoding: 'utf8', timeout: 90000 });
  let ok = null, code = null;
  try { const d = JSON.parse(r.stdout); if (d && d.ok === false) { ok = false; code = d.code; } else ok = true; } catch { /* unparseable */ }
  return { exit: r.status, ok, code };
}

let pass = 0, fail = 0;
const anomalies = [];
for (let round = 1; round <= ROUNDS; round++) {
  console.log(`\n================= ROUND ${round}/${ROUNDS} =================`);
  const cases = hasNewtools ? [...CASES, ...ECON_CASES] : CASES;
  if (!hasNewtools) console.log('(economic_data new tools SKIPPED — set WIND_NEWTOOLS_URL/SESSION + preload redirect-fetch.mjs)');
  let lastServer = '';
  for (const [server, tool, valid, err, errCode] of cases) {
    if (server !== lastServer) { console.log(`--- ${server} ---`); lastServer = server; }
    const v = runCli(['call', server, tool, JSON.stringify(valid)]);
    const e = runCli(['call', server, tool, JSON.stringify(err)]);
    // valid: handled iff success OR backend_error (not a local validation/route error)
    const vGood = v.ok === true || (v.ok === false && !LOCAL_CODES.has(v.code));
    const eGood = e.ok === false && e.code === errCode;
    vGood ? pass++ : fail++; eGood ? pass++ : fail++;
    const vNote = v.ok === true ? 'success' : (v.ok === false ? v.code : 'unparseable');
    console.log(`  ${vGood ? 'PASS' : 'FAIL'} ${eGood ? 'PASS' : 'FAIL'}  ${tool.padEnd(30)} valid:${String(vNote).padEnd(16)} error:${e.code}`);
    if (!vGood) anomalies.push(`R${round} ${server}/${tool} VALID -> ${vNote} (exit ${v.exit})`);
    if (!eGood) anomalies.push(`R${round} ${server}/${tool} ERROR -> ${e.code} (want ${errCode})`);
  }
  console.log('--- meta (routing / json) ---');
  for (const [name, argv, wantCode] of META) {
    const r = runCli(argv);
    const good = r.ok === false && r.code === wantCode;
    good ? pass++ : fail++;
    console.log(`  ${good ? 'PASS' : 'FAIL'}  ${name.padEnd(24)} code=${r.code} (want ${wantCode})`);
    if (!good) anomalies.push(`R${round} meta:${name} -> ${r.code}`);
  }
}

console.log(`\n================= SUMMARY =================`);
console.log(`checks: ${pass + fail}  PASS=${pass}  FAIL=${fail}`);
if (anomalies.length) { console.log(`anomalies (${anomalies.length}):`); for (const a of anomalies) console.log('  - ' + a); }
process.exit(fail ? 1 : 0);
