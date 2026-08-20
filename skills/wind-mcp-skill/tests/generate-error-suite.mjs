// Generates error-suite.cases.json — a large, mostly-negative test matrix that
// exercises cli.mjs routing + parameter validation + envelope across every tool,
// plus the SKILL/契约 boundaries (required fields, enums, types, pairs, order,
// mutual-exclusion, patterns, unknown fields, routing, JSON, @file, usage).
// Cases are asserted against the LOCAL behavior (a mock backend stands in for the
// network), so the whole suite is deterministic and needs no key.
//   node tests/generate-error-suite.mjs   ->  writes tests/error-suite.cases.json
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'error-suite.cases.json');

const SERVER_TOOLS = {
  stock_data: ['search_stocks', 'get_stock_basicinfo', 'get_stock_fundamentals', 'get_stock_equity_holders', 'get_stock_events', 'get_stock_technicals', 'get_risk_metrics', 'get_stock_price_indicators', 'get_stock_kline', 'get_stock_quote'],
  fund_data: ['search_funds', 'get_fund_info', 'get_fund_financials', 'get_fund_holdings', 'get_fund_performance', 'get_fund_holders', 'get_fund_company_info', 'get_fund_price_indicators', 'get_fund_kline', 'get_fund_quote'],
  index_data: ['get_index_basicinfo', 'get_index_fundamentals', 'get_index_technicals', 'get_index_price_indicators', 'get_index_kline', 'get_index_quote'],
  bond_data: ['get_bond_basicinfo', 'get_bond_issuer_info', 'get_bond_market_data', 'get_bond_financial_data'],
  financial_docs: ['get_company_announcements', 'get_financial_news'],
  economic_data: ['natural_language_get_edb_data'],
  analytics_data: ['get_financial_data'],
};
const SERVER_OF = {};
for (const [s, ts] of Object.entries(SERVER_TOOLS)) for (const t of ts) SERVER_OF[t] = s;

// profiles
const Q = ['search_stocks', 'get_stock_basicinfo', 'get_stock_fundamentals', 'get_stock_equity_holders', 'get_stock_events', 'get_stock_technicals', 'get_risk_metrics', 'search_funds', 'get_fund_info', 'get_fund_financials', 'get_fund_holdings', 'get_fund_performance', 'get_fund_holders', 'get_fund_company_info', 'get_index_basicinfo', 'get_index_fundamentals', 'get_index_technicals', 'get_bond_basicinfo', 'get_bond_issuer_info', 'get_bond_market_data', 'get_bond_financial_data', 'get_financial_data'];
const QRY = ['get_company_announcements', 'get_financial_news'];
const PI = ['get_stock_price_indicators', 'get_fund_price_indicators', 'get_index_price_indicators'];
const KL = ['get_stock_kline', 'get_fund_kline', 'get_index_kline'];
const QT = ['get_stock_quote', 'get_fund_quote', 'get_index_quote'];
const EDB = 'natural_language_get_edb_data';
// tools that get cross-domain remapped (kline/quote/price_indicators): wrong-server does NOT ROUTE_ERROR
const REMAPPABLE = new Set([...PI, ...KL, ...QT]);

const WC = { stock_data: '600519.SH', fund_data: '510300.SH', index_data: '000300.SH' };
const cases = [];
let n = 0;
const pad = (i) => String(i).padStart(3, '0');
function add(category, angle, argv, expect) {
  cases.push({ id: `${category}-${pad(++n)}`, category, angle, argv, expect });
}
const P = (server, tool, obj) => ['call', server, tool, JSON.stringify(obj)];
const ERRV = (code) => ({ ok: false, code });
const OKV = { ok: true };

// ---------- 1. routing: unknown server_type ----------
for (const bad of ['stok_data', 'stock', 'stockdata', 'STOCK_DATA', 'fund', 'economic', 'doc_data', 'markets', 'stock_data ', ' stock_data', 'analytics', 'bonddata']) {
  add('route-unknown-server', `未知 server_type '${bad}'`, ['call', bad, 'get_stock_basicinfo', '{"question":"x"}'], ERRV('ROUTE_ERROR'));
}
// ---------- 2. routing: wrong tool for server (non-remappable => ROUTE_ERROR) ----------
for (const t of [...Q, ...QRY, EDB]) {
  const wrong = SERVER_OF[t] === 'stock_data' ? 'fund_data' : 'stock_data';
  add('route-wrong-tool', `${t} 放到 ${wrong}`, P(wrong, t, { question: 'x', query: 'x', executionMode: '仅搜索' }), ERRV('ROUTE_ERROR'));
}
// ---------- 3. routing: unknown tool name ----------
for (const [s] of Object.entries(SERVER_TOOLS)) {
  for (const bad of ['get_foo', 'search', 'get_stock_price', 'get_stock_basic_info']) {
    add('route-unknown-tool', `${s} 未知工具 ${bad}`, P(s, bad, { question: 'x' }), ERRV('ROUTE_ERROR'));
  }
}
// ---------- 4. usage errors ----------
add('usage', '未知子命令', ['frobnicate'], ERRV('USAGE_ERROR'));
add('usage', 'call 缺 tool 与 params', ['call', 'stock_data'], ERRV('USAGE_ERROR'));
add('usage', 'call 缺 params', ['call', 'stock_data', 'get_stock_basicinfo'], ERRV('USAGE_ERROR'));
add('usage', 'params 空串视为缺失', ['call', 'stock_data', 'get_stock_basicinfo', ''], ERRV('USAGE_ERROR'));
add('usage', 'setup-key 缺 --scope', ['setup-key'], ERRV('USAGE_ERROR'));

// ---------- 5. malformed JSON ----------
for (const bad of ['{bad', '{"question":}', "{'question':'x'}", '{"question":"x",}', '{question:"x"}', '{"question":"x"', '   ', '{"a":1,,}', '{"a":"\\"}', 'undefined', 'NaN', '{"a":01}', '{"a":.5}', '[1,2', '{"a":"b" "c":"d"}']) {
  add('json-malformed', `非法 JSON: ${bad.slice(0, 18)}`, ['call', 'stock_data', 'get_stock_basicinfo', bad], ERRV('INVALID_PARAMS_JSON'));
}
// ---------- 6. params not an object ----------
for (const [lbl, raw] of [['数组', '[]'], ['数组非空', '[1,2]'], ['数字', '123'], ['字符串', '"hello"'], ['布尔', 'true'], ['null', 'null']]) {
  add('params-not-object', `params 是 ${lbl}`, ['call', 'stock_data', 'get_stock_basicinfo', raw], ERRV('PARAM_TYPE_ERROR'));
}
// ---------- 7. @file params errors ----------
add('params-file', '@ 空路径', ['call', 'stock_data', 'get_stock_basicinfo', '@'], ERRV('PARAMS_FILE_ERROR'));
add('params-file', '@不存在的文件', ['call', 'stock_data', 'get_stock_basicinfo', '@/tmp/definitely-missing-xyz.json'], ERRV('PARAMS_FILE_ERROR'));
add('params-file', '@目录', ['call', 'stock_data', 'get_stock_basicinfo', '@/tmp'], ERRV('PARAMS_FILE_ERROR'));

// ---------- 8. missing required ----------
for (const t of Q) add('missing-required', `${t} 缺 question`, P(SERVER_OF[t], t, {}), ERRV('PARAM_VALIDATION_ERROR'));
for (const t of QRY) add('missing-required', `${t} 缺 query`, P(SERVER_OF[t], t, {}), ERRV('PARAM_VALIDATION_ERROR'));
for (const t of KL) {
  const s = SERVER_OF[t];
  add('missing-required', `${t} 缺 windcode`, P(s, t, { begin_date: '2026-08-03', end_date: '2026-08-18' }), ERRV('PARAM_VALIDATION_ERROR'));
  add('missing-required', `${t} 缺 begin_date`, P(s, t, { windcode: WC[s], end_date: '2026-08-18' }), ERRV('PARAM_VALIDATION_ERROR'));
  add('missing-required', `${t} 缺 end_date`, P(s, t, { windcode: WC[s], begin_date: '2026-08-03' }), ERRV('PARAM_VALIDATION_ERROR'));
}
for (const t of QT) add('missing-required', `${t} 缺 windcode`, P(SERVER_OF[t], t, { begin: '2026-08-18', end: '2026-08-18' }), ERRV('PARAM_VALIDATION_ERROR'));
add('missing-required', `EDB 缺 executionMode`, P('economic_data', EDB, { question: '中国GDP' }), ERRV('PARAM_VALIDATION_ERROR'));
add('missing-required', `EDB 缺 question`, P('economic_data', EDB, { executionMode: '仅搜索' }), ERRV('PARAM_VALIDATION_ERROR'));

// ---------- 9. empty / whitespace required ----------
for (const t of Q) add('empty-required', `${t} question 空串`, P(SERVER_OF[t], t, { question: '' }), ERRV('PARAM_VALIDATION_ERROR'));
for (const t of Q.slice(0, 8)) add('empty-required', `${t} question 全空白`, P(SERVER_OF[t], t, { question: '   ' }), ERRV('PARAM_VALIDATION_ERROR'));
for (const t of QRY) add('empty-required', `${t} query 空串`, P(SERVER_OF[t], t, { query: '' }), ERRV('PARAM_VALIDATION_ERROR'));
for (const t of KL) add('empty-required', `${t} windcode 空串`, P(SERVER_OF[t], t, { windcode: '', begin_date: '2026-08-03', end_date: '2026-08-18' }), ERRV('PARAM_VALIDATION_ERROR'));
for (const t of QT) add('empty-required', `${t} windcode 空串`, P(SERVER_OF[t], t, { windcode: '', begin: '2026-08-18', end: '2026-08-18' }), ERRV('PARAM_VALIDATION_ERROR'));

// ---------- 10. wrong type on string_keys => PARAM_TYPE_ERROR ----------
const badTypes = [['数字', 123], ['数组', ['a']], ['布尔', true], ['对象', { a: 1 }], ['null', null]];
for (const t of Q) for (const [lbl, v] of badTypes.slice(0, 3)) add('wrong-type', `${t} question=${lbl}`, P(SERVER_OF[t], t, { question: v }), ERRV('PARAM_TYPE_ERROR'));
for (const t of QRY) for (const [lbl, v] of badTypes) add('wrong-type', `${t} query=${lbl}`, P(SERVER_OF[t], t, { query: v }), ERRV('PARAM_TYPE_ERROR'));
for (const t of [...PI, ...KL, ...QT]) for (const [lbl, v] of badTypes.slice(0, 3)) {
  const s = SERVER_OF[t];
  add('wrong-type', `${t} windcode=${lbl}`, P(s, t, { windcode: v, indexes: '中文简称', begin_date: '2026-08-03', end_date: '2026-08-18', begin: '2026-08-18', end: '2026-08-18' }), ERRV('PARAM_TYPE_ERROR'));
}
for (const [lbl, v] of badTypes.slice(0, 3)) add('wrong-type', `EDB observation=${lbl}`, P('economic_data', EDB, { executionMode: '搜索并提数', question: 'x', observation: v }), ERRV('PARAM_TYPE_ERROR'));

// ---------- 11. enum errors ----------
for (const t of KL) {
  const s = SERVER_OF[t];
  for (const bad of ['99', 'daily', 'day', '1day', 'week', '2d', '0d', 'minute', '1D', 'Q', 'hourly']) {
    add('enum-period', `${t} period='${bad}'`, P(s, t, { windcode: WC[s], begin_date: '2026-08-03', end_date: '2026-08-18', period: bad }), ERRV('PARAM_VALIDATION_ERROR'));
  }
  for (const bad of ['3', 'x', 'front', '前复权', '-1']) {
    add('enum-aftype', `${t} aftype='${bad}'`, P(s, t, { windcode: WC[s], begin_date: '2026-08-03', end_date: '2026-08-18', aftype: bad }), ERRV('PARAM_VALIDATION_ERROR'));
  }
  for (const bad of ['2', 'yes', 'true', 'y']) {
    add('enum-issusp', `${t} issusp='${bad}'`, P(s, t, { windcode: WC[s], begin_date: '2026-08-03', end_date: '2026-08-18', issusp: bad }), ERRV('PARAM_VALIDATION_ERROR'));
  }
}
for (const bad of ['s', 'SEARCH', '查询', 'search_fetch', 'fetchAll', '提数', 'Search', '仅 搜索']) {
  add('enum-execmode', `EDB executionMode='${bad}'`, P('economic_data', EDB, { executionMode: bad, question: 'x' }), ERRV('PARAM_VALIDATION_ERROR'));
}

// ---------- 12. date ordering (begin > end) ----------
for (const t of KL) add('date-order', `${t} begin_date>end_date`, P(SERVER_OF[t], t, { windcode: WC[SERVER_OF[t]], begin_date: '2026-08-18', end_date: '2026-08-03' }), ERRV('PARAM_VALIDATION_ERROR'));
for (const t of QT) add('date-order', `${t} begin>end`, P(SERVER_OF[t], t, { windcode: WC[SERVER_OF[t]], begin: '2026-08-18', end: '2026-08-03' }), ERRV('PARAM_VALIDATION_ERROR'));
add('date-order', 'EDB beginDate>endDate', P('economic_data', EDB, { executionMode: '仅提数', question: 'G0000069', beginDate: '20241231', endDate: '20230101' }), ERRV('PARAM_VALIDATION_ERROR'));

// ---------- 13. paired incomplete (EDB beginDate/endDate) ----------
add('paired', 'EDB 只给 beginDate', P('economic_data', EDB, { executionMode: '仅提数', question: 'G0000069', beginDate: '20230101' }), ERRV('PARAM_VALIDATION_ERROR'));
add('paired', 'EDB 只给 endDate', P('economic_data', EDB, { executionMode: '仅提数', question: 'G0000069', endDate: '20241231' }), ERRV('PARAM_VALIDATION_ERROR'));

// ---------- 14. mutually exclusive (observation vs date) ----------
add('mutex', 'EDB observation + beginDate', P('economic_data', EDB, { executionMode: '仅提数', question: 'G0000069', observation: '5', beginDate: '20230101' }), ERRV('PARAM_VALIDATION_ERROR'));
add('mutex', 'EDB observation + endDate', P('economic_data', EDB, { executionMode: '仅提数', question: 'G0000069', observation: '5', endDate: '20241231' }), ERRV('PARAM_VALIDATION_ERROR'));

// ---------- 15. observation pattern ----------
for (const bad of ['abc', '-1', '1.5', '1a', '1.0', 'ten', '5 ', ' 5', '0x5']) {
  add('pattern-observation', `EDB observation='${bad}'`, P('economic_data', EDB, { executionMode: '仅提数', question: 'G0000069', observation: bad }), ERRV('PARAM_VALIDATION_ERROR'));
}
// ---------- 16. conditional: fetch/searchFetch require observation or dates ----------
for (const m of ['fetch', 'searchFetch', '仅提数', '搜索并提数']) {
  add('conditional', `EDB ${m} 无 observation/dates`, P('economic_data', EDB, { executionMode: m, question: 'G0000069' }), ERRV('PARAM_VALIDATION_ERROR'));
}
// ---------- 17. unknown field (EDB has allowed list) ----------
for (const f of [['windcode', '600519.SH'], ['period', '1d'], ['foo', 'bar'], ['query', 'x']]) {
  add('unknown-field', `EDB 多传字段 ${f[0]}`, P('economic_data', EDB, { executionMode: '仅搜索', question: 'x', [f[0]]: f[1] }), ERRV('PARAM_VALIDATION_ERROR'));
}

// ---------- 18. a few CORRECT calls (pass local validation -> mock success) ----------
for (const t of ['search_stocks', 'get_stock_basicinfo', 'get_risk_metrics', 'get_bond_basicinfo', 'get_financial_data']) add('correct', `${t} 合法`, P(SERVER_OF[t], t, { question: '贵州茅台600519.SH' }), OKV);
for (const t of QRY) add('correct', `${t} 合法`, P(SERVER_OF[t], t, { query: '贵州茅台公告' }), OKV);
for (const t of PI) add('correct', `${t} 合法`, P(SERVER_OF[t], t, { windcode: WC[SERVER_OF[t]], indexes: '中文简称' }), OKV);
for (const t of KL) add('correct', `${t} 合法`, P(SERVER_OF[t], t, { windcode: WC[SERVER_OF[t]], begin_date: '2026-08-03', end_date: '2026-08-18', period: '1d' }), OKV);
for (const t of QT) add('correct', `${t} 合法(仅 windcode)`, P(SERVER_OF[t], t, { windcode: WC[SERVER_OF[t]] }), OKV);
add('correct', 'EDB 仅搜索', P('economic_data', EDB, { executionMode: '仅搜索', question: '中国GDP' }), OKV);
add('correct', 'EDB 搜索并提数+observation', P('economic_data', EDB, { executionMode: '搜索并提数', question: '中国GDP', observation: '6' }), OKV);
// cross-domain remap: wrong-domain quote/kline auto-corrects and passes
add('correct', '跨域改写 get_fund_quote@stock_data', P('stock_data', 'get_fund_quote', { windcode: '600519.SH' }), OKV);
add('correct', '跨域改写 get_index_kline@stock_data', P('stock_data', 'get_index_kline', { windcode: '600519.SH', begin_date: '2026-08-03', end_date: '2026-08-18' }), OKV);

writeFileSync(OUT, JSON.stringify(cases, null, 1) + '\n');
const byCat = {};
for (const c of cases) byCat[c.category] = (byCat[c.category] || 0) + 1;
console.log(`wrote ${cases.length} cases to ${OUT}`);
console.log('by category:', JSON.stringify(byCat, null, 0));
const nOk = cases.filter((c) => c.expect.ok === true).length;
console.log(`negative=${cases.length - nOk}  positive=${nOk}`);
