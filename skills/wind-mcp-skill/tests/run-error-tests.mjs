// Runs the REAL cli.mjs end-to-end against the simulated MCP server (mock-fetch.mjs)
// for each of the three new structured error codes, and asserts:
//   1. exit code is 1 (failure envelope)
//   2. error.code is the expected stable code (mapping works across envelope shapes)
//   3. error.agent_action carries the guidance keywords the agent is meant to act on
//
// Usage: node tests/run-error-tests.mjs   (run from the skill dir)

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = dirname(TESTS_DIR);
const CLI = join(SKILL_DIR, 'scripts', 'cli.mjs');
const PRELOAD = join(TESTS_DIR, 'mock-fetch.mjs');

// [scenario, cli args, expectedExit, expectedCode, guidance keywords that must appear]
const CASES = [
  ['invalid_param_name',
    ['call', 'stock_data', 'get_stock_price_indicators', '{"windcod":"600519.SH"}'],
    1, 'INVALID_PARAM_NAME',
    ['tool-contracts.md', '字段名', '必填', '发明字段名']],

  ['invalid_param_value',
    ['call', 'stock_data', 'get_stock_kline', '{"windcode":"600519.SH","begin_date":"20260401","end_date":"20260430"}'],
    1, 'INVALID_PARAM_VALUE',
    ['tool-contracts.md', 'yyyyMMdd', 'indicators.md', '禁止改字段名']],

  ['temporarily_unavailable',
    ['call', 'stock_data', 'get_stock_price_indicators', '{"windcode":"600519.SH","indexes":"最新成交价"}'],
    1, 'TEMPORARILY_UNAVAILABLE',
    ['原样重试一次', '不得修改参数']],

  // cross-check: same code, different backend envelope shape
  ['invalid_param_name_via_iserror',
    ['call', 'stock_data', 'get_stock_price_indicators', '{"windcode":"600519.SH","indexes":"最新成交价"}'],
    1, 'INVALID_PARAM_NAME',
    ['字段名', '发明字段名']],

  // happy path sanity
  ['success',
    ['call', 'stock_data', 'get_stock_price_indicators', '{"windcode":"600519.SH","indexes":"中文简称,最新成交价"}'],
    0, null,
    []],
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

for (const [scenario, args, wantExit, wantCode, keywords] of CASES) {
  const { exit, stdout } = run(scenario, args);
  const checks = [];

  checks.push([`exit==${wantExit}`, exit === wantExit]);

  let envelope = null;
  try { envelope = JSON.parse(stdout); } catch {}

  if (wantCode === null) {
    // success path: no error envelope, stdout is raw MCP result
    checks.push(['no error envelope', !(envelope && envelope.ok === false)]);
  } else {
    const code = envelope?.error?.code;
    const action = envelope?.error?.agent_action || '';
    checks.push([`code==${wantCode}`, code === wantCode]);
    for (const kw of keywords) {
      checks.push([`action⊇"${kw}"`, action.includes(kw)]);
    }
  }

  const ok = checks.every(([, v]) => v);
  ok ? pass++ : fail++;
  lines.push(`${ok ? 'PASS' : 'FAIL'}  ${scenario}  (exit=${exit})`);
  for (const [label, v] of checks) {
    if (!v) lines.push(`        ✗ ${label}`);
  }
  if (wantCode && envelope?.error?.agent_action) {
    lines.push(`        agent_action: ${envelope.error.agent_action.slice(0, 160)}…`);
  }
}

console.log(lines.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
