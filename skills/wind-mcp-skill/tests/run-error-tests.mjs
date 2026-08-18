// Runs the REAL cli.mjs end-to-end against the simulated MCP server (mock-fetch.mjs)
// for interface error shapes, and asserts they all flatten to backend_error.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = dirname(TESTS_DIR);
const CLI = join(SKILL_DIR, 'scripts', 'cli.mjs');
const PRELOAD = join(TESTS_DIR, 'mock-fetch.mjs');

// [scenario, cli args, expectedExit, expectedCode]
const CASES = [
  ['invalid_param_name',
    ['call', 'stock_data', 'get_stock_price_indicators', '{"windcod":"600519.SH"}'],
    1, 'backend_error'],

  ['invalid_param_value',
    ['call', 'stock_data', 'get_stock_kline', '{"windcode":"600519.SH","begin_date":"20260401","end_date":"20260430"}'],
    1, 'backend_error'],

  ['temporarily_unavailable',
    ['call', 'stock_data', 'get_stock_price_indicators', '{"windcode":"600519.SH","indexes":"最新成交价"}'],
    1, 'backend_error'],

  ['invalid_param_name_via_iserror',
    ['call', 'stock_data', 'get_stock_price_indicators', '{"windcode":"600519.SH","indexes":"最新成交价"}'],
    1, 'backend_error'],

  // happy path sanity
  ['success',
    ['call', 'stock_data', 'get_stock_price_indicators', '{"windcode":"600519.SH","indexes":"中文简称,最新成交价"}'],
    0, null],
];

function run(scenario, args) {
  const res = spawnSync('node', ['--import', PRELOAD, CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, WIND_MOCK_SCENARIO: scenario },
  });
  return { exit: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

let pass = 0, fail = 0;
const lines = [];

for (const [scenario, args, wantExit, wantCode] of CASES) {
  const { exit, stdout } = run(scenario, args);
  const checks = [];

  checks.push([`exit==${wantExit}`, exit === wantExit]);

  let envelope = null;
  try { envelope = JSON.parse(stdout); } catch {}

  if (wantCode === null) {
    // success path: no error envelope, stdout is raw MCP result
    checks.push(['no error envelope', !(envelope && envelope.ok === false)]);
  } else {
    const code = envelope?.code;
    checks.push([`code==${wantCode}`, code === wantCode]);
    checks.push(['has message', typeof envelope?.message === 'string' && envelope.message.length > 0]);
  }

  const ok = checks.every(([, v]) => v);
  ok ? pass++ : fail++;
  lines.push(`${ok ? 'PASS' : 'FAIL'}  ${scenario}  (exit=${exit})`);
  for (const [label, v] of checks) {
    if (!v) lines.push(`        ✗ ${label}`);
  }
}

console.log(lines.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
