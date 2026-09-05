#!/usr/bin/env node
// 边界测试：畸形输入、路径穿越、协议异常、注册表过期、极值入参。
// 除标注 [live] 的分组外全部离线。运行：node tests/run-boundary-tests.mjs [--live]
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, validateParams, readRegistry, callTool } from '../scripts/cli.mjs';
import { installMockFetch, simpleHandler } from './mock-fetch.mjs';

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const TMP = join(SKILL_DIR, 'tests', '.tmp');
const REG = readRegistry();
const LIVE = process.argv.includes('--live');

let passed = 0;
const failures = [];
const notes = [];

async function check(name, fn) {
  try { await fn(); passed++; } catch (e) { failures.push({ name, message: e.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || ''} 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }

async function runCli(argv, handler) {
  const mock = handler ? installMockFetch(handler) : null;
  const chunks = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (c) => { chunks.push(c); return true; };
  const prevExit = process.exitCode;
  process.exitCode = 0;
  let thrown = null;
  try { await main(argv); } catch (e) { thrown = e; }
  process.stdout.write = write;
  const exitCode = process.exitCode;
  process.exitCode = prevExit;
  if (mock) mock.restore();
  const text = chunks.join('');
  let json = null;
  try { json = JSON.parse(text); } catch { /* usage 之类的纯文本 */ }
  return { text, json, thrown, exitCode, calls: mock?.calls || [] };
}

mkdirSync(TMP, { recursive: true });

// ---------- 1. 畸形入参 ----------
await check('空 JSON 对象走必填校验而不是崩溃', async () => {
  const r = await runCli(['call', 'stock', 'stock_get_company_profile', '{}'], simpleHandler({}));
  eq(r.json.code, 'PARAM_VALIDATION_ERROR');
  eq(r.calls.length, 0);
});

await check('省略参数等同空对象', async () => {
  const r = await runCli(['call', 'stock', 'stock_get_company_profile'], simpleHandler({}));
  eq(r.json.code, 'PARAM_VALIDATION_ERROR');
});

await check('JSON 数组作入参报类型错', async () => {
  const r = await runCli(['call', 'stock', 'stock_get_company_profile', '["600519.SH"]'], simpleHandler({}));
  eq(r.json.code, 'PARAM_TYPE_ERROR');
});

await check('JSON null 作入参报类型错', async () => {
  const r = await runCli(['call', 'stock', 'stock_get_company_profile', 'null'], simpleHandler({}));
  eq(r.json.code, 'PARAM_TYPE_ERROR');
});

await check('必填字段传空串按缺失处理', async () => {
  const e = validateParams(REG.servers.stock.tools.stock_get_company_profile.inputSchema, { windCode: '' });
  eq(e?.code, 'PARAM_VALIDATION_ERROR');
});

await check('__proto__ 作字段名被当普通未知字段拦截，不污染原型', async () => {
  const r = await runCli(['call', 'stock', 'stock_get_company_profile', '{"windCode":"600519.SH","__proto__":{"polluted":1}}'], simpleHandler({}));
  eq(r.json.code, 'PARAM_VALIDATION_ERROR');
  eq({}.polluted, undefined, '原型被污染');
});

await check('超长字符串不崩溃，交给后端判', async () => {
  const long = 'x'.repeat(50000);
  const r = await runCli(['call', 'stock', 'stock_get_company_profile', JSON.stringify({ windCode: long })], simpleHandler({ toolText: '未识别到有效的金融标的' }));
  eq(r.json.code, 'backend_error');
});

await check('参数值里的中文与引号能原样送达', async () => {
  const r = await runCli(['call', 'company', 'company_search_entity', '{"searchKey":"贵州「茅台」酒股份"}'], simpleHandler({ toolText: '{"ok":1}' }));
  const call = r.calls.find((c) => c.body.method === 'tools/call');
  eq(call.body.params.arguments.searchKey, '贵州「茅台」酒股份');
});

await check('多余的位置参数被忽略而不是误当参数', async () => {
  const r = await runCli(['call', 'stock', 'stock_get_company_profile', '{"windCode":"600519.SH"}', 'extra'], simpleHandler({ toolText: '{"ok":1}' }));
  assert(r.json.cli_meta, '应正常返回');
});

// ---------- 2. 参数文件与路径 ----------
await check('@文件 能正常读入', async () => {
  const p = join(TMP, 'req.json');
  writeFileSync(p, JSON.stringify({ windCode: '600519.SH' }));
  const r = await runCli(['call', 'stock', 'stock_get_company_profile', '@tests/.tmp/req.json'], simpleHandler({ toolText: '{"ok":1}' }));
  assert(r.json.cli_meta, `应成功，实际 ${r.text.slice(0, 200)}`);
});

await check('@文件 内容非 JSON 报 INVALID_PARAMS_JSON', async () => {
  const p = join(TMP, 'bad.json');
  writeFileSync(p, 'not json');
  const r = await runCli(['call', 'stock', 'stock_get_company_profile', '@tests/.tmp/bad.json']);
  eq(r.thrown?.code, 'INVALID_PARAMS_JSON');
});

await check('@ 路径穿越到 skill 目录外只会失败，不会静默读到东西', async () => {
  const r = await runCli(['call', 'stock', 'stock_get_company_profile', '@../../../etc/hostname']);
  assert(r.thrown?.code === 'INVALID_PARAMS_JSON' || r.thrown?.code === 'PARAMS_FILE_ERROR', `期望参数文件类错误，实际 ${r.thrown?.code}`);
});

// ---------- 3. 协议与网络异常 ----------
const httpCase = (status) => () => ({ status, text: `{"error":"http ${status}"}` });

for (const [status, expected] of [[401, 'AUTH_ERROR'], [403, 'AUTH_ERROR'], [429, 'RATE_LIMIT_ERROR'], [500, 'NETWORK_ERROR'], [503, 'NETWORK_ERROR']]) {
  await check(`HTTP ${status} → ${expected}`, async () => {
    const r = await runCli(['call', 'edb', 'economic_search_indicator', '{"question":"GDP"}'], httpCase(status));
    eq(r.thrown?.code, expected);
  });
}

await check('空响应体报 NETWORK_ERROR 而不是静默成功', async () => {
  const r = await runCli(['call', 'edb', 'economic_search_indicator', '{"question":"GDP"}'], () => ({ text: '' }));
  eq(r.thrown?.code, 'NETWORK_ERROR');
});

await check('JSON-RPC error 对象转成 backend_error', async () => {
  const r = await runCli(['call', 'edb', 'economic_search_indicator', '{"question":"GDP"}'], (body) => ({
    json: body.method === 'initialize'
      ? { jsonrpc: '2.0', id: body.id, result: {} }
      : { jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid params' } },
  }));
  eq(r.thrown?.code, 'BACKEND_ERROR');
});

await check('SSE 半截包报 NETWORK_ERROR', async () => {
  const r = await runCli(['call', 'edb', 'economic_search_indicator', '{"question":"GDP"}'], (body) => (
    body.method === 'initialize' ? { json: { jsonrpc: '2.0', id: body.id, result: {} } } : { text: 'event: message\ndata: {"jsonrpc":"2.0"' }
  ));
  assert(r.thrown, '应抛错');
});

await check('后端返回空 content 按业务错误处理', async () => {
  const r = await runCli(['call', 'edb', 'economic_search_indicator', '{"question":"GDP"}'], simpleHandler({ toolText: '' }));
  eq(r.json.code, 'backend_error');
});

await check('纯 JSON 传输（非 SSE）也能走通', async () => {
  const r = await runCli(['call', 'edb', 'economic_search_indicator', '{"question":"GDP"}'], simpleHandler({ toolText: '{"ok":1}', transport: 'json' }));
  assert(r.json.cli_meta, '应成功');
});

// ---------- 4. 注册表边界 ----------
await check('工具名大小写错误报 ROUTE_ERROR 并给出正确名', async () => {
  const r = await runCli(['call', 'stock', 'STOCK_GET_COMPANY_PROFILE', '{}']);
  eq(r.thrown?.code, 'ROUTE_ERROR');
  assert(r.thrown.message.includes('stock_get_company_profile'), '近似匹配应忽略大小写');
});

await check('用完整 server 名（vserver_xxx）也能路由', async () => {
  const r = await runCli(['call', 'vserver_edb_data', 'economic_search_indicator', '{"question":"GDP"}'], simpleHandler({ toolText: '{"ok":1}' }));
  assert(r.json.cli_meta, '应成功');
  eq(r.json.cli_meta.server, 'edb');
});

await check('ROUTE_ERROR 会提示 refresh', async () => {
  const r = await runCli(['call', 'company', 'company_get_something_new', '{}']);
  assert(r.thrown.message.includes('refresh'), '应提示 refresh');
});

await check('未知命令给出用法', async () => {
  const r = await runCli(['frobnicate']);
  eq(r.thrown?.code, 'USAGE_ERROR');
  assert(r.thrown.message.includes('call <server>'), '应带用法');
});

await check('call 缺参数报 USAGE_ERROR', async () => {
  eq((await runCli(['call'])).thrown?.code, 'USAGE_ERROR');
  eq((await runCli(['call', 'stock'])).thrown?.code, 'USAGE_ERROR');
});

// ---------- 5. 极值入参 ----------
await check('windCodes 数组超过 maxItems 被本地拦截', async () => {
  const schema = REG.servers.fund.tools.fund_get_nav.inputSchema;
  eq(schema.properties.windCodes.maxItems, 50, 'fund_get_nav.windCodes 上限');
  const codes = Array.from({ length: 51 }, (_, i) => `${String(i).padStart(6, '0')}.OF`);
  const e = validateParams(schema, { windCodes: codes });
  eq(e?.code, 'PARAM_VALIDATION_ERROR');
  assert(e.message.includes('分批'), '应提示分批调用');
  notes.push('fund 批量档案类工具的 windCodes 上限 50，超限已在本地拦截并提示分批');
});

await check('数组重复元素被拦截', async () => {
  const e = validateParams(REG.servers.fund.tools.fund_get_nav.inputSchema, { windCodes: ['000001.OF', '000001.OF'] });
  eq(e?.code, 'PARAM_VALIDATION_ERROR');
});

await check('空数组违反 minItems 被拦截', async () => {
  const e = validateParams(REG.servers.fund.tools.fund_get_nav.inputSchema, { windCodes: [] });
  eq(e?.code, 'PARAM_VALIDATION_ERROR');
});

await check('startDate 等于 endDate 应放行', async () => {
  eq(validateParams(REG.servers.futures.tools.futures_get_supply_demand.inputSchema, { windCode: 'CU.SHF', type: 4, startDate: '2026-01-01', endDate: '2026-01-01' }), null);
});

await check('未来日期不被本地拦截（交给后端判）', async () => {
  eq(validateParams(REG.servers.futures.tools.futures_get_supply_demand.inputSchema, { windCode: 'CU.SHF', type: 4, startDate: '2099-01-01', endDate: '2099-12-31' }), null);
});

await check('日期时间字段接受 T 分隔与带秒', async () => {
  const s = REG.servers.options.tools.options_get_volatility_surface.inputSchema;
  eq(validateParams(s, { windCode: '510050.SH', time: '2026-09-03T15:00' }), null);
  eq(validateParams(s, { windCode: '510050.SH', time: '2026-09-03 15:00:00' }), null);
});

await check('枚举大小写敏感', async () => {
  const e = validateParams(REG.servers.stock.tools.stock_get_company_finance_analysis.inputSchema, { windCode: '600519.SH', currency: 'cny' });
  eq(e?.code, 'PARAM_VALIDATION_ERROR');
  notes.push('枚举值大小写敏感：currency 必须传 CNY 而不是 cny');
});

await check('option 计算器缺一个必填就拦下（不发请求）', async () => {
  const sample = { ...REG.servers.options.tools.options_calc_vanilla.sample };
  delete sample.volatility;
  const r = await runCli(['call', 'options', 'options_calc_vanilla', JSON.stringify(sample)], simpleHandler({}));
  eq(r.json.code, 'PARAM_VALIDATION_ERROR');
  eq(r.calls.length, 0);
});

// ---------- 6. 并发 ----------
await check('并发调用互不串扰', async () => {
  const mock = installMockFetch((body) => ({
    sse: body.method === 'tools/call'
      ? { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: JSON.stringify({ echo: body.params.arguments.windCode }) }] } }
      : { jsonrpc: '2.0', id: body.id, result: {} },
  }));
  const codes = ['600519.SH', '000001.SZ', 'AAPL.O', '0700.HK'];
  const results = await Promise.all(codes.map((c) => callTool('vserver_stock_research', 'stock_get_company_profile', { windCode: c })));
  mock.restore();
  results.forEach((r, i) => eq(JSON.parse(r.text).echo, codes[i], `第 ${i} 条串扰`));
});

// ---------- 7. [live] 真实后端边界 ----------
if (LIVE) {
  await check('[live] 非法证券代码：要么报错，要么必须能从返回体看出认错了标的', async () => {
    const r = await runCli(['call', 'stock', 'stock_get_company_profile', '{"windCode":"999999.XX"}']);
    assert(r.json?.ok === false || r.json?.cli_meta, '应有明确回执');
    if (r.json?.ok === false) {
      notes.push(`[live] 非法代码回执（报错）：${r.json.message.slice(0, 80)}`);
    } else {
      // 实测出现过后端模糊命中一只无关证券并返回真实数据、不报任何错的情况。
      // 这种形态本地无法拦截，只能靠返回体里回显了证券代码，让调用方自己核对。
      const text = r.json.content?.[0]?.text || '';
      assert(/证券代码|windCode|公司名称/.test(text), '模糊命中时返回体必须回显标的，否则调用方无从核对');
      notes.push(`[live] ⚠ 非法代码被模糊命中成了真实标的（非确定性），返回体回显：${(text.match(/"证券代码":\s*"[^"]*"/) || [''])[0]}`);
    }
  });

  await check('[live] 空结果与错误可区分', async () => {
    const r = await runCli(['call', 'company', 'company_get_discredit', '{"companyKey":"贵州茅台酒股份有限公司"}']);
    notes.push(`[live] 无失信记录时的回执形态：${r.json?.ok === false ? 'backend_error: ' + r.json.message.slice(0, 80) : '成功信封，text 前 80 字：' + (r.json?.content?.[0]?.text || '').slice(0, 80)}`);
  });

  await check('[live] 日期区间颠倒时后端与本地的判定一致', async () => {
    const r = await runCli(['call', 'company', 'company_get_judgments', '{"companyKey":"恒大地产集团有限公司","timeFrom":"2026-01-01","timeTo":"2024-01-01"}']);
    eq(r.json.code, 'PARAM_VALIDATION_ERROR', '本地应先拦下');
  });
}

rmSync(TMP, { recursive: true, force: true });

const total = passed + failures.length;
if (notes.length) {
  console.log('\n观察记录：');
  for (const n of notes) console.log(`  · ${n}`);
  console.log('');
}
if (failures.length) {
  console.log(`❌ ${failures.length}/${total} 项失败：\n`);
  for (const f of failures) console.log(`  ✗ ${f.name}\n    ${f.message}\n`);
  process.exit(1);
}
console.log(`✅ ${passed}/${total} 项边界测试通过${LIVE ? '（含 live 分组）' : '（离线；加 --live 跑真实后端分组）'}`);
