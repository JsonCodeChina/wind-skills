#!/usr/bin/env node
// 离线契约测试：不发任何网络请求，验证参数校验、信封形态、传输层解析与文档一致性。
// 运行：node tests/run-offline-tests.mjs
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, nearestTools, validateParams, enumAliases, parseBody, sniffBusinessError, readRegistry, readUpdateState, triggerUpdateCheck, McpError } from '../scripts/cli.mjs';
import { installMockFetch, simpleHandler } from './mock-fetch.mjs';

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REG = readRegistry();

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push({ name, message: e.message });
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push({ name, message: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || ''} 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

const schemaOf = (server, tool) => REG.servers[server].tools[tool].inputSchema;

// 在进程内跑一次 CLI，捕获 stdout 里的 JSON 信封。
async function runCli(argv, handler) {
  const mock = handler ? installMockFetch(handler) : null;
  const chunks = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (c) => { chunks.push(c); return true; };
  const prevExit = process.exitCode;
  process.exitCode = 0;
  try {
    await main(argv);
  } catch (e) {
    process.stdout.write = write;
    if (mock) mock.restore();
    return { thrown: e, calls: mock?.calls || [] };
  }
  process.stdout.write = write;
  const exitCode = process.exitCode;
  process.exitCode = prevExit;
  if (mock) mock.restore();
  const text = chunks.join('');
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* 非 JSON 输出（如 usage） */ }
  return { text, json: parsed, exitCode, calls: mock?.calls || [] };
}

// ---------- 1. 参数校验 ----------
check('未知字段被拦截', () => {
  const e = validateParams(schemaOf('company', 'company_get_judgments'), { companyKey: 'X', startDate: '2024-01-01' });
  eq(e?.code, 'PARAM_VALIDATION_ERROR');
  assert(e.message.includes('startDate'), '错误信息应点名未知字段');
  assert(e.message.includes('timeFrom'), '错误信息应给出允许字段');
});

check('缺必填被拦截', () => {
  const e = validateParams(schemaOf('futures', 'futures_get_supply_demand'), { windCode: 'CU.SHF' });
  eq(e?.code, 'PARAM_VALIDATION_ERROR');
  assert(e.message.includes('type'), '应点名缺失的 type');
});

check('类型不符被拦截', () => {
  const e = validateParams(schemaOf('edb', 'economic_get_indicator_series'), { metricCodes: 'M1', observation: '5' });
  eq(e?.code, 'PARAM_TYPE_ERROR');
});

check('枚举越界被拦截', () => {
  const e = validateParams(schemaOf('futures', 'futures_get_supply_demand'), { windCode: 'CU.SHF', type: 9 });
  eq(e?.code, 'PARAM_VALIDATION_ERROR');
  assert(e.message.includes('1、2、3、4'), '应列出允许值');
});

check('array 类型的 enum 校验的是元素', () => {
  const ok = validateParams(schemaOf('company', 'company_get_judgments'), { companyKey: 'X', role: ['原告'] });
  eq(ok, null, 'role=[原告] 应通过');
  const bad = validateParams(schemaOf('company', 'company_get_judgments'), { companyKey: 'X', role: ['甲方'] });
  eq(bad?.code, 'PARAM_VALIDATION_ERROR');
});

check('声明 integer 但 enum 是字符串时以 enum 为准', () => {
  const s = schemaOf('finance', 'quote_get_historical_data_series');
  eq(validateParams(s, { windCode: '600519.SH', type: 1 }), null, 'type=1 应通过');
  eq(validateParams(s, { windCode: '600519.SH', type: '1' }), null, "type='1' 应通过");
  eq(validateParams(s, { windCode: '600519.SH', type: 7 })?.code, 'PARAM_VALIDATION_ERROR');
});

check('说明里声明「等价写法」的中文键被放行', () => {
  const s = schemaOf('futures', 'futures_get_basis');
  eq(validateParams(s, { sector: '有色金属' }), null, '中文键应放行（后端实测接受）');
  eq(validateParams(s, { sector: 'Non-ferrous metals' }), null, '英文系统值应放行');
  eq(validateParams(s, { sector: '稀土' })?.code, 'PARAM_VALIDATION_ERROR', '不在映射表里的值仍应拦截');
});

check('别名提取只认映射行，不误收 enum 之外的词', () => {
  const aliases = enumAliases(schemaOf('futures', 'futures_get_basis').properties.sector);
  assert(aliases.has('有色金属') && aliases.has('全市场'), `应提取到中文键，实际 ${[...aliases].join(',')}`);
  assert(!aliases.has('稀土'), '不应凭空产生别名');
  const rev = enumAliases(schemaOf('futures', 'futures_get_warehouse_receipt').properties.type);
  assert(rev.has('仓单') && rev.has('交割'), `反向映射行也要认，实际 ${[...rev].join(',')}`);
});

check('无映射说明的字段不产生别名', () => {
  eq(enumAliases(schemaOf('futures', 'futures_get_supply_demand').properties.type).size, 0);
});

check('工具名近似匹配按下划线切词，不只靠子串', () => {
  const names = Object.keys(REG.servers.stock.tools);
  eq(nearestTools(names, 'stock_get_valuation')[0], 'stock_get_company_valuation');
  eq(nearestTools(names, 'STOCK_GET_COMPANY_PROFILE')[0], 'stock_get_company_profile');
  eq(nearestTools(names, 'zzz').length, 0, '完全无关的名字不应硬凑近似项');
});

check('纯日期字段要求 YYYY-MM-DD', () => {
  const s = schemaOf('futures', 'futures_get_supply_demand');
  eq(validateParams(s, { windCode: 'CU.SHF', type: 4, startDate: '2026/01/01' })?.code, 'PARAM_VALIDATION_ERROR');
  eq(validateParams(s, { windCode: 'CU.SHF', type: 4, startDate: '2026-01-01' }), null);
});

check('日期时间字段要求带时分', () => {
  const s = schemaOf('options', 'options_get_volatility_surface');
  eq(validateParams(s, { windCode: '510050.SH', time: '2026-09-03' })?.code, 'PARAM_VALIDATION_ERROR');
  eq(validateParams(s, { windCode: '510050.SH', time: '2026-09-03 15:00' }), null);
});

check('日期区间颠倒被拦截', () => {
  const e = validateParams(schemaOf('futures', 'futures_get_supply_demand'), { windCode: 'CU.SHF', type: 4, startDate: '2026-06-01', endDate: '2026-01-01' });
  eq(e?.code, 'PARAM_VALIDATION_ERROR');
  assert(e.message.includes('颠倒'), '应说明区间颠倒');
});

check('互斥字段被拦截', () => {
  const e = validateParams(schemaOf('edb', 'economic_get_indicator_series'), { metricCodes: 'M1', observation: 5, startDate: '2024-01-01' });
  eq(e?.code, 'PARAM_VALIDATION_ERROR');
  assert(e.message.includes('互斥'), '应说明互斥');
});

check('参数不是对象时报类型错', () => {
  eq(validateParams(schemaOf('edb', 'economic_search_indicator'), ['a'])?.code, 'PARAM_TYPE_ERROR');
});

check('--allow-unknown 只放行未知字段，不放行必填与枚举', () => {
  const s = schemaOf('futures', 'futures_get_supply_demand');
  eq(validateParams(s, { windCode: 'CU.SHF', type: 4, zzz: 1 }, { allowUnknown: true }), null);
  eq(validateParams(s, { windCode: 'CU.SHF', zzz: 1 }, { allowUnknown: true })?.code, 'PARAM_VALIDATION_ERROR');
});

// ---------- 2. 传输层 ----------
check('SSE 响应取最后一条 data 行', () => {
  const body = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"a":1}}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"a":2}}\n\n';
  eq(parseBody(body).result.a, 2);
});

check('纯 JSON 响应也能解析', () => {
  eq(parseBody('{"jsonrpc":"2.0","id":1,"result":{"a":3}}').result.a, 3);
});

check('无法解析的响应抛 NETWORK_ERROR', () => {
  let code = null;
  try { parseBody('<html>502</html>'); } catch (e) { code = e.code; }
  eq(code, 'NETWORK_ERROR');
});

check('业务错误文本能被识别', () => {
  for (const t of ['服务暂时不可用，请稍后重试', '未识别到有效的金融标的', 'timeFrom不能大于timeTo', '没有搜索到指标', '文档详情数据为空', '']) {
    assert(sniffBusinessError(t), `应识别为业务错误：${JSON.stringify(t)}`);
  }
});

check('正常数据不被误判为业务错误', () => {
  for (const t of ['{"最新价": 1450.2, "涨跌幅": 0.8}', '贵州茅台酒股份有限公司', 'x'.repeat(400) + '不可用']) {
    assert(!sniffBusinessError(t), `不应识别为业务错误：${t.slice(0, 40)}`);
  }
});

// ---------- 3. CLI 信封 ----------
await checkAsync('成功调用输出数据对象与 cli_meta', async () => {
  const r = await runCli(['call', 'stock', 'stock_get_company_profile', '{"windCode":"600519.SH"}'], simpleHandler({ toolText: '{"公司名称":"贵州茅台"}' }));
  assert(r.json?.content?.[0]?.text?.includes('贵州茅台'), '应带回后端文本');
  eq(r.json.cli_meta.server, 'stock');
  eq(r.json.cli_meta.tool, 'stock_get_company_profile');
  eq(r.json.ok, undefined, '成功信封不应有 ok 字段');
});

await checkAsync('jsonrpc id 必须是整数', async () => {
  const r = await runCli(['call', 'stock', 'stock_get_company_profile', '{"windCode":"600519.SH"}'], simpleHandler({ toolText: 'data' }));
  assert(r.calls.length >= 2, '应至少发出 initialize + tools/call');
  for (const c of r.calls) assert(Number.isInteger(c.body.id), `id 必须是整数，实际 ${c.body.id}`);
});

await checkAsync('每次调用前都先 initialize', async () => {
  const r = await runCli(['call', 'edb', 'economic_search_indicator', '{"question":"GDP"}'], simpleHandler({ toolText: 'data' }));
  eq(r.calls[0].body.method, 'initialize');
  eq(r.calls[1].body.method, 'tools/call');
});

await checkAsync('isError=true 转成 backend_error', async () => {
  const r = await runCli(['call', 'edb', 'economic_search_indicator', '{"question":"GDP"}'], simpleHandler({ toolText: '内部错误', isError: true }));
  eq(r.json.ok, false);
  eq(r.json.code, 'backend_error');
  eq(r.json.detected_by, 'protocol');
  eq(r.exitCode, 1);
});

await checkAsync('isError=false 的纯文本业务错误也转成 backend_error', async () => {
  const r = await runCli(['call', 'edb', 'economic_search_indicator', '{"question":"GDP"}'], simpleHandler({ toolText: '服务暂时不可用，请稍后重试' }));
  eq(r.json.ok, false);
  eq(r.json.code, 'backend_error');
  eq(r.json.detected_by, 'text');
});

await checkAsync('--raw 保留原样输出并打 suspect_error 标记', async () => {
  const r = await runCli(['call', 'edb', 'economic_search_indicator', '{"question":"GDP"}', '--raw'], simpleHandler({ toolText: '服务暂时不可用，请稍后重试' }));
  eq(r.json.ok, undefined);
  eq(r.json.cli_meta.suspect_error, true);
});

await checkAsync('已知故障工具在错误信封里带 known_issue', async () => {
  const sample = REG.servers.options.tools.options_calc_accumulator.sample;
  const r = await runCli(['call', 'options', 'options_calc_accumulator', JSON.stringify(sample)], simpleHandler({ toolText: '服务暂时不可用，请稍后重试' }));
  assert(r.json.known_issue, '应带 known_issue');
});

await checkAsync('未知 server 报 ROUTE_ERROR', async () => {
  const r = await runCli(['call', 'bond', 'x', '{}']);
  eq(r.thrown?.code, 'ROUTE_ERROR');
});

await checkAsync('未知工具报 ROUTE_ERROR 并给近似名', async () => {
  const r = await runCli(['call', 'stock', 'stock_get_company_finance', '{}']);
  eq(r.thrown?.code, 'ROUTE_ERROR');
  assert(r.thrown.message.includes('stock_get_company_finance_analysis'), '应给出近似工具名');
});

await checkAsync('非法 JSON 报 INVALID_PARAMS_JSON', async () => {
  const r = await runCli(['call', 'stock', 'stock_get_company_profile', '{windCode:600519}']);
  eq(r.thrown?.code, 'INVALID_PARAMS_JSON');
});

await checkAsync('参数文件不存在报 PARAMS_FILE_ERROR', async () => {
  const r = await runCli(['call', 'stock', 'stock_get_company_profile', '@scripts/does-not-exist.json']);
  eq(r.thrown?.code, 'PARAMS_FILE_ERROR');
});

await checkAsync('校验失败时不发网络请求', async () => {
  const r = await runCli(['call', 'futures', 'futures_get_supply_demand', '{"windCode":"CU.SHF"}'], simpleHandler({}));
  eq(r.json.code, 'PARAM_VALIDATION_ERROR');
  eq(r.calls.length, 0, '本地拦截后不应发出任何请求');
});

await checkAsync('describe / list-tools / find 不发网络请求', async () => {
  for (const argv of [['describe', 'edb', 'economic_search_indicator'], ['list-tools', 'company'], ['find', '波动率'], ['list-servers']]) {
    const r = await runCli(argv, simpleHandler({}));
    eq(r.calls.length, 0, `${argv[0]} 不应发网络请求`);
    assert(r.json, `${argv[0]} 应输出 JSON`);
  }
});

await checkAsync('find 能跨 server 命中', async () => {
  const r = await runCli(['find', '仓单']);
  assert(r.json.count >= 2, `应命中多个仓单工具，实际 ${r.json.count}`);
  assert(r.json.hits.every((h) => h.server && h.tool), '每条命中要带 server 与 tool');
});

await checkAsync('find 按相关度排序，最贴切的排第一', async () => {
  for (const [kw, top] of [['基差', 'futures_get_basis'], ['失信', 'company_get_discredit'], ['库存', 'futures_get_supply_demand']]) {
    const r = await runCli(['find', kw]);
    eq(r.json.hits[0]?.tool, top, `find ${kw} 的首位`);
  }
});

await checkAsync('find 零命中时给出 related_servers 而不是让人误判越界', async () => {
  const r = await runCli(['find', 'GDP']);
  eq(r.json.count, 0, '前提：工具说明里确实没有 GDP 字样');
  assert(r.json.related_servers?.some((x) => x.server === 'edb'), 'GDP 应指向 edb');
  assert(r.json.note, '零命中必须带提示');
});

await checkAsync('确实不支持的领域零命中且明确说明不构成越界证据', async () => {
  const r = await runCli(['find', '比特币']);
  eq(r.json.count, 0);
  eq(r.json.related_servers, undefined, '不支持的领域不应有 related_servers');
  assert(r.json.note.includes('不构成'), '提示要说明零命中不等于不支持');
});

check('每个 server 都配了领域关键词', () => {
  for (const [alias, s] of Object.entries(REG.servers)) {
    assert((s.keywords || []).length >= 10, `${alias} 的领域关键词太少：${(s.keywords || []).length}`);
  }
});

// ---------- 3.5 自动更新 ----------
check('WIND_SKILL_NO_UPDATE 能关掉自动更新', () => {
  const statePath = join(SKILL_DIR, 'scripts', 'update-state.json');
  const before = existsSync(statePath) ? readFileSync(statePath, 'utf8') : null;
  const prev = process.env.WIND_SKILL_NO_UPDATE;
  process.env.WIND_SKILL_NO_UPDATE = '1';
  triggerUpdateCheck();
  if (prev === undefined) delete process.env.WIND_SKILL_NO_UPDATE; else process.env.WIND_SKILL_NO_UPDATE = prev;
  const after = existsSync(statePath) ? readFileSync(statePath, 'utf8') : null;
  eq(after, before, '关掉之后不应写状态文件、不应起子进程');
});

check('更新脚本在位且状态可读', () => {
  assert(existsSync(join(SKILL_DIR, 'scripts', 'update-check.mjs')), '缺 scripts/update-check.mjs');
  const state = readUpdateState();
  assert(state === null || typeof state === 'object', 'update-state.json 要么不存在要么是对象');
});

check('运行时只依赖 cli.mjs，构建时代码不进取数路径', () => {
  const cli = readFileSync(join(SKILL_DIR, 'scripts', 'cli.mjs'), 'utf8');
  const staticImports = [...cli.matchAll(/^import .* from '(\.\/[^']+)'/gm)].map((m) => m[1]);
  eq(staticImports.length, 0, `cli.mjs 不应静态 import 同目录模块，实际：${staticImports.join(',')}`);
  assert(!/await import\('\.\/build\.mjs'\)/.test(cli), 'build.mjs 与 cli.mjs 互相 import 会形成 ESM 循环依赖，refresh 必须走子进程');
});

// ---------- 4. 注册表与文档一致性 ----------
check('7 个 server / 132 个工具齐全', () => {
  const aliases = Object.keys(REG.servers);
  eq(aliases.length, 7, 'server 数量');
  const total = aliases.reduce((n, a) => n + Object.keys(REG.servers[a].tools).length, 0);
  assert(total >= 130, `工具总数应不少于 130，实际 ${total}`);
});

check('每个工具都有实测样例入参，且样例本身能通过校验', () => {
  const missing = [];
  const invalid = [];
  for (const [alias, s] of Object.entries(REG.servers)) {
    for (const [name, t] of Object.entries(s.tools)) {
      if (!t.sample) { missing.push(`${alias}.${name}`); continue; }
      const e = validateParams(t.inputSchema, t.sample);
      if (e) invalid.push(`${alias}.${name}: ${e.message}`);
    }
  }
  assert(!missing.length, `缺样例：${missing.join(', ')}`);
  assert(!invalid.length, `样例不合法：\n  ${invalid.join('\n  ')}`);
});

check('每个 server 都有工具目录，且列全了自己的工具', () => {
  for (const [alias, s] of Object.entries(REG.servers)) {
    const path = join(SKILL_DIR, 'references', `${alias}.md`);
    assert(existsSync(path), `缺 references/${alias}.md`);
    const md = readFileSync(path, 'utf8');
    for (const name of Object.keys(s.tools)) {
      assert(md.includes(`| \`${name}\` |`), `references/${alias}.md 的目录表缺 ${name}`);
    }
  }
});

// 目录只该是目录：参数表、枚举、【适用场景】这些放进来会让 company 重新涨到 3.5 万字，
// 而 agent 一次只用一个工具的参数。这条是防止有人「顺手补全一下文档」把上下文成本加回去。
check('工具目录保持轻量：单份不超过 1 万字，7 份合计不超过 4 万字', () => {
  let total = 0;
  for (const alias of Object.keys(REG.servers)) {
    const md = readFileSync(join(SKILL_DIR, 'references', `${alias}.md`), 'utf8');
    total += md.length;
    assert(md.length <= 10000, `references/${alias}.md 有 ${md.length} 字，超出目录该有的体量——参数表应该留在 describe 里`);
    assert(!/^\| 参数 \| 必填 \|/m.test(md), `references/${alias}.md 混进了参数表，应该只留目录`);
  }
  assert(total <= 42000, `7 份目录合计 ${total} 字，超标`);
});

await checkAsync('describe 可以只取一个参数', async () => {
  const full = await runCli(['describe', 'futures', 'futures_get_basis']);
  const one = await runCli(['describe', 'futures', 'futures_get_basis', 'sector']);
  eq(one.json.param, 'sector');
  assert(one.json.enum?.includes('Non-ferrous metals'), '应给出 enum');
  assert(one.json.enum_aliases?.includes('有色金属'), '应给出等价写法');
  assert(one.text.length < full.text.length, '单字段输出应比整份契约小');
  eq(one.calls.length, 0, '不应发网络请求');
});

await checkAsync('describe 取不存在的参数报 ROUTE_ERROR 并列出合法字段', async () => {
  const r = await runCli(['describe', 'futures', 'futures_get_basis', 'zzz']);
  eq(r.thrown?.code, 'ROUTE_ERROR');
  assert(r.thrown.message.includes('sector'), '应列出合法字段');
});

check('目录的「别选错」列把同类工具区分开了', () => {
  const md = readFileSync(join(SKILL_DIR, 'references', 'company.md'), 'utf8');
  const rows = ['company_get_discredit', 'company_get_final_case', 'company_get_high_consumers', 'company_get_executed_persons']
    .map((n) => md.split('\n').find((l) => l.startsWith(`| \`${n}\` |`)));
  const boundaries = rows.map((r) => r.split('|')[3].trim());
  assert(rows.every(Boolean), '四个司法工具都要在目录里');
  eq(new Set(boundaries).size, 4, `四个司法工具的「别选错」列必须互不相同，实际：${boundaries.join(' / ')}`);
});

check('每份目录都有自己的「最容易选错的」一节，且不串台', () => {
  for (const alias of Object.keys(REG.servers)) {
    const md = readFileSync(join(SKILL_DIR, 'references', `${alias}.md`), 'utf8');
    assert(md.includes('## 本 server 最容易选错的'), `references/${alias}.md 缺「最容易选错的」一节`);
    if (alias !== 'company') {
      const section = md.split('## 本 server 最容易选错的')[1].split('##')[0];
      assert(!section.includes('失信被执行'), `references/${alias}.md 的易混示例串到了 company 的司法工具上`);
    }
  }
});

check('单个工具的 describe 输出足够小，可以按需取', () => {
  for (const [alias, s] of Object.entries(REG.servers)) {
    for (const [name, t] of Object.entries(s.tools)) {
      const req = new Set(t.inputSchema?.required || []);
      const payload = JSON.stringify({
        description: t.description,
        params: Object.entries(t.inputSchema?.properties || {}).map(([k, p]) => ({ k, required: req.has(k), ...p })),
        sample: t.sample,
      });
      assert(payload.length <= 8000, `describe ${alias} ${name} 会输出 ${payload.length} 字，太大`);
    }
  }
});

check('SKILL.md 路由表覆盖 7 个 server 并指向存在的契约', () => {
  const md = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  for (const alias of Object.keys(REG.servers)) {
    assert(md.includes(`\`${alias}\``), `SKILL.md 路由表缺 ${alias}`);
    assert(md.includes(`references/${alias}.md`), `SKILL.md 未指向 references/${alias}.md`);
  }
});

check('已知故障都出现在对应目录的「已知故障」表里', () => {
  for (const [alias, s] of Object.entries(REG.servers)) {
    const md = readFileSync(join(SKILL_DIR, 'references', `${alias}.md`), 'utf8');
    const section = md.split('## 已知故障')[1] || '';
    for (const [name, t] of Object.entries(s.tools)) {
      if (!t.knownIssue) continue;
      assert(section.includes(`\`${name}\``), `${alias}.${name} 的已知故障没进目录的「已知故障」表`);
    }
  }
});

// ---------- 输出 ----------
const total = passed + failures.length;
if (failures.length) {
  console.log(`\n❌ ${failures.length}/${total} 项失败：\n`);
  for (const f of failures) console.log(`  ✗ ${f.name}\n    ${f.message}\n`);
  process.exit(1);
}
console.log(`✅ ${passed}/${total} 项全部通过（未发出任何真实网络请求）`);
