// CLI 契约测试：覆盖 argv / exit / code 行为。
// Usage: node tests/run-cli-contract-tests.mjs   (任意 cwd 均可)

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = dirname(TESTS_DIR);
const CLI = join(SKILL_DIR, 'scripts', 'cli.mjs');
const MOCK_FETCH = join(TESTS_DIR, 'mock-fetch.mjs');
const CAPTURE_FETCH = join(TESTS_DIR, 'capture-fetch.mjs');

const ISOLATED_HOME = mkdtempSync(join(tmpdir(), 'wind-cli-home-'));
const WORK_DIR = mkdtempSync(join(tmpdir(), 'wind-cli-work-'));

function spawnCli(args, { mock = false, capture = null, extraEnv = {} } = {}) {
  const nodeArgs = [];
  if (mock) nodeArgs.push('--import', MOCK_FETCH);
  if (capture) nodeArgs.push('--import', CAPTURE_FETCH);
  nodeArgs.push(CLI, ...args);
  const res = spawnSync(process.execPath, nodeArgs, {
    encoding: 'utf8',
    cwd: WORK_DIR,
    env: {
      ...process.env,
      HOME: ISOLATED_HOME,
      WIND_API_KEY: extraEnv.WIND_API_KEY ?? '',
      WIND_MOCK_SCENARIO: extraEnv.WIND_MOCK_SCENARIO || '',
      WIND_MOCK_CAPTURE: extraEnv.WIND_MOCK_CAPTURE || '',
      ...extraEnv,
    },
  });
  return { exit: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

const checks = [];

function test(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (err) {
    checks.push({ name, ok: false, detail: err.message || String(err) });
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// 1. 无参数：纯文本 USAGE，exit 0
test('help: no args prints USAGE and exits 0', () => {
  const { exit, stdout } = spawnCli([]);
  assertEqual(exit, 0, 'exit');
  assert(stdout.includes('cli.mjs call'), 'USAGE should mention call');
  assert(!stdout.trimStart().startsWith('{'), 'help must be plain text, not JSON');
});

// 2. 未知命令
test('unknown command -> USAGE_ERROR', () => {
  const { exit, stdout } = spawnCli(['foobar']);
  const body = parseJson(stdout);
  assertEqual(exit, 1, 'exit');
  assertEqual(body?.ok, false, 'ok');
  assertEqual(body?.code, 'USAGE_ERROR', 'code');
});

// 3. call 缺参
test('call missing args -> USAGE_ERROR', () => {
  const { exit, stdout } = spawnCli(['call', 'stock_data']);
  const body = parseJson(stdout);
  assertEqual(exit, 1, 'exit');
  assertEqual(body?.code, 'USAGE_ERROR', 'code');
});

// 4. 非法 JSON
test('invalid params json -> INVALID_PARAMS_JSON', () => {
  const { exit, stdout } = spawnCli(['call', 'stock_data', 'get_stock_price_indicators', 'not-json']);
  const body = parseJson(stdout);
  assertEqual(exit, 1, 'exit');
  assertEqual(body?.code, 'INVALID_PARAMS_JSON', 'code');
});

// 5. params 不是 object
test('params array -> PARAM_TYPE_ERROR', () => {
  const { exit, stdout } = spawnCli(['call', 'stock_data', 'get_stock_price_indicators', '[]']);
  const body = parseJson(stdout);
  assertEqual(exit, 1, 'exit');
  assertEqual(body?.code, 'PARAM_TYPE_ERROR', 'code');
});

// 6. 未知 server_type（本地路由，不发网络）
test('unknown server_type -> ROUTE_ERROR', () => {
  const { exit, stdout } = spawnCli(['call', 'crypto_data', 'get_stock_price_indicators', '{"windcode":"600519.SH"}']);
  const body = parseJson(stdout);
  assertEqual(exit, 1, 'exit');
  assertEqual(body?.code, 'ROUTE_ERROR', 'code');
  assert(typeof body?.message === 'string' && body.message.length > 0, 'message');
});

// 7. 工具不属于该 server
test('wrong tool for server -> ROUTE_ERROR', () => {
  const { exit, stdout } = spawnCli(['call', 'stock_data', 'search_funds', '{"question":"筛选股票型基金"}']);
  const body = parseJson(stdout);
  assertEqual(exit, 1, 'exit');
  assertEqual(body?.code, 'ROUTE_ERROR', 'code');
  assert(typeof body?.message === 'string' && body.message.length > 0, 'message');
});

// 8. 空白 windcode
test('blank windcode -> PARAM_VALIDATION_ERROR', () => {
  const { exit, stdout } = spawnCli(['call', 'stock_data', 'get_stock_kline', '{"windcode":"  ","begin_date":"20260401","end_date":"20260430"}']);
  const body = parseJson(stdout);
  assertEqual(exit, 1, 'exit');
  assertEqual(body?.code, 'PARAM_VALIDATION_ERROR', 'code');
});

// 9. K 线日期顺序
test('quote begin after end -> PARAM_VALIDATION_ERROR', () => {
  const { exit, stdout } = spawnCli(['call', 'stock_data', 'get_stock_quote', '{"windcode":"600519.SH","begin":"2026-04-30","end":"2026-04-01"}']);
  const body = parseJson(stdout);
  assertEqual(exit, 1, 'exit');
  assertEqual(body?.code, 'PARAM_VALIDATION_ERROR', 'code');
});

// 10. @file 不存在
test('@missing-file -> PARAMS_FILE_ERROR', () => {
  const { exit, stdout } = spawnCli(['call', 'stock_data', 'get_stock_price_indicators', '@missing-params.json']);
  const body = parseJson(stdout);
  assertEqual(exit, 1, 'exit');
  assertEqual(body?.code, 'PARAMS_FILE_ERROR', 'code');
});

// 11. @file 合法 JSON，缺 Key（隔离 HOME）
test('@file valid json + no key -> AUTH_ERROR', () => {
  const file = join(WORK_DIR, 'params.json');
  writeFileSync(file, JSON.stringify({ windcode: '600519.SH' }) + '\n');
  const { exit, stdout } = spawnCli(['call', 'stock_data', 'get_stock_price_indicators', '@params.json']);
  const body = parseJson(stdout);
  assertEqual(exit, 1, 'exit');
  assertEqual(body?.code, 'AUTH_ERROR', 'code');
});

// 12. setup-key 缺 scope
test('setup-key without --scope -> USAGE_ERROR', () => {
  const { exit, stdout } = spawnCli(['setup-key', 'faketestkey']);
  const body = parseJson(stdout);
  assertEqual(exit, 1, 'exit');
  assertEqual(body?.code, 'USAGE_ERROR', 'code');
});

// 13. diagnose 不依赖网络
test('diagnose returns update_scope json', () => {
  const { exit, stdout } = spawnCli(['diagnose']);
  const body = parseJson(stdout);
  assertEqual(exit, 0, 'exit');
  assert(body && typeof body.update_scope === 'string', 'update_scope');
  assertEqual(body.ok, undefined, 'diagnose is not an error envelope');
});

// 14. mock 成功：cli_meta 存在，不是 {ok:false}
test('mock success returns cli_meta and data', () => {
  const { exit, stdout } = spawnCli(
    ['call', 'stock_data', 'get_stock_price_indicators', '{"windcode":"600519.SH","indexes":"中文简称,最新成交价"}'],
    { mock: true, extraEnv: { WIND_API_KEY: 'test-key-xxxxxxxx', WIND_MOCK_SCENARIO: 'success' } },
  );
  const body = parseJson(stdout);
  assertEqual(exit, 0, 'exit');
  assertEqual(body?.ok, undefined, 'success is raw MCP result');
  assertEqual(body?.cli_meta?.server_type, 'stock_data', 'cli_meta.server_type');
  assertEqual(body?.cli_meta?.tool_name, 'get_stock_price_indicators', 'cli_meta.tool_name');
  assert(Array.isArray(body?.content), 'content array');
});

// 15. mock 接口错误：统一 backend_error，message 为接口原文
test('mock interface error returns backend_error', () => {
  const { exit, stdout } = spawnCli(
    ['call', 'stock_data', 'get_stock_price_indicators', '{"windcode":"600519.SH","indexes":"最新成交价"}'],
    { mock: true, extraEnv: { WIND_API_KEY: 'test-key-xxxxxxxx', WIND_MOCK_SCENARIO: 'temporarily_unavailable' } },
  );
  const body = parseJson(stdout);
  assertEqual(exit, 1, 'exit');
  assertEqual(body?.code, 'backend_error', 'code');
  assert(typeof body?.message === 'string' && body.message.length > 0, 'message');
});

// 16. 规范化：港股前导 0、K 线默认 period、EDB 提数参数透传
test('normalize windcode / period, pass through EDB params before MCP call', () => {
  const klineCapture = join(WORK_DIR, 'captured-kline.json');
  const edbCapture = join(WORK_DIR, 'captured-edb.json');
  const kline = spawnCli(
    ['call', 'stock_data', 'get_stock_kline', '{"windcode":"07000.HK","begin_date":"20260401","end_date":"20260430"}'],
    { capture: true, extraEnv: { WIND_API_KEY: 'test-key-xxxxxxxx', WIND_MOCK_CAPTURE: klineCapture } },
  );
  assertEqual(kline.exit, 0, 'kline exit');
  assertEqual(parseJson(kline.stdout)?.cli_meta?.tool_name, 'get_stock_kline', 'kline tool');

  const edb = spawnCli(
    ['call', 'economic_data', 'economic_indicator_data_query', '{"question":"中国GDP","observation":"10"}'],
    { capture: true, extraEnv: { WIND_API_KEY: 'test-key-xxxxxxxx', WIND_MOCK_CAPTURE: edbCapture } },
  );
  assertEqual(edb.exit, 0, 'edb exit');

  const klineArgs = parseJson(readFileSync(klineCapture, 'utf8'))?.[0]?.params?.arguments;
  const edbCall = parseJson(readFileSync(edbCapture, 'utf8'))?.[0]?.params;
  assertEqual(klineArgs?.windcode, '7000.HK', 'HK leading zero stripped');
  assertEqual(klineArgs?.period, '10', 'default 1d mapped to backend period');
  assertEqual(edbCall?.name, 'economic_indicator_data_query', 'EDB tool routed');
  assertEqual(edbCall?.arguments?.question, '中国GDP', 'EDB question passed through');
  assertEqual(edbCall?.arguments?.observation, 10, 'EDB observation coerced to integer');
});

const pass = checks.filter((item) => item.ok).length;
const fail = checks.filter((item) => !item.ok);
for (const item of checks) {
  process.stdout.write(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}\n`);
  if (!item.ok) process.stdout.write(`        ✗ ${item.detail}\n`);
}
process.stdout.write(`\n${pass} passed, ${fail.length} failed\n`);

rmSync(ISOLATED_HOME, { recursive: true, force: true });
rmSync(WORK_DIR, { recursive: true, force: true });
process.exit(fail.length === 0 ? 0 : 1);
