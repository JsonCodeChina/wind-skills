// Cross-plan comparison: runs the same wrong-parameter battery against the REAL
// cli.mjs of main / plan-a / plan-c, under the mock backend (scenario=success).
//
//   exit 0  = local validation PASSED → request would reach the backend
//   exit 1  = caught LOCALLY by that plan (shows error.code + guidance)
//
// This isolates each plan's machine-enforced gates from its prose-only gates,
// and shows the quality of the fix-it guidance. No real backend, no quota.
//
// Usage: node tests/compare-plans.mjs   (run from main skill dir)

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = dirname(dirname(TESTS_DIR)); // .../skills
const PRELOAD = join(TESTS_DIR, 'mock-fetch.mjs');

const CLIS = {
  main:    join(SKILLS_ROOT, 'wind-mcp-skill', 'scripts', 'cli.mjs'),
  'plan-a': join(SKILLS_ROOT, 'wind-mcp-skill-plan-a', 'scripts', 'cli.mjs'),
  'plan-c': join(SKILLS_ROOT, 'wind-mcp-skill-plan-c', 'scripts', 'cli.mjs'),
};

// [label, server_type, tool, paramsJson]  — each is a wrong-fill (except the control)
const CASES = [
  ['控制·全合法',       'stock_data', 'get_stock_price_indicators', '{"windcode":"600519.SH","indexes":"中文简称,最新成交价"}'],
  ['字段名拼错(windcod)', 'stock_data', 'get_stock_price_indicators', '{"windcod":"600519.SH","indexes":"最新成交价"}'],
  ['缺必填(无 indexes)',  'stock_data', 'get_stock_price_indicators', '{"windcode":"600519.SH"}'],
  ['日期带横杠',         'stock_data', 'get_stock_kline', '{"windcode":"600519.SH","begin_date":"2026-04-01","end_date":"20260430"}'],
  ['瞎编指标(PEG估值)',  'stock_data', 'get_stock_price_indicators', '{"windcode":"600519.SH","indexes":"PEG估值"}'],
  ['多代码 windcode',    'stock_data', 'get_stock_price_indicators', '{"windcode":"600519.SH,000001.SZ","indexes":"最新成交价"}'],
  ['枚举非法(period 99)', 'stock_data', 'get_stock_kline', '{"windcode":"600519.SH","begin_date":"20260401","end_date":"20260430","period":"99"}'],
  ['工具名不存在',       'stock_data', 'get_stock_pe', '{"windcode":"600519.SH"}'],
  ['越界塞进 analytics', 'analytics_data', 'get_financial_data', '{"question":"美元兑日元汇率走势"}'],
];

function run(cli, server, tool, params) {
  const res = spawnSync('node', ['--import', PRELOAD, cli, 'call', server, tool, params], {
    encoding: 'utf8',
    env: { ...process.env, WIND_MOCK_SCENARIO: 'success', WIND_API_KEY: 'dummy-for-mock' },
  });
  if (res.status === 0) return { verdict: '通过→后端', code: '', action: '' };
  let env = null;
  try { env = JSON.parse(res.stdout); } catch {}
  return {
    verdict: '本地拦截',
    code: env?.error?.code || '(no code)',
    action: (env?.error?.agent_action || '').replace(/\s+/g, ' ').slice(0, 90),
  };
}

const planNames = Object.keys(CLIS);
console.log('案例'.padEnd(22) + planNames.map(p => p.padEnd(26)).join(''));
console.log('-'.repeat(22 + 26 * planNames.length));

const guidance = [];
for (const [label, server, tool, params] of CASES) {
  const cells = [];
  for (const p of planNames) {
    const r = run(CLIS[p], server, tool, params);
    cells.push(r.verdict === '通过→后端' ? '通过→后端' : `拦截:${r.code}`);
    if (p === 'plan-c' && r.verdict === '本地拦截') {
      guidance.push(`  [${label}] ${r.code}: ${r.action}…`);
    }
  }
  console.log(label.padEnd(20) + cells.map(c => c.padEnd(26)).join(''));
}

console.log('\n=== plan-c 本地拦截时给出的引导（节选）===');
console.log(guidance.join('\n'));
