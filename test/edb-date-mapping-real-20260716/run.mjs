import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SKILL = resolve(REPO, 'skills', 'wind-mcp-skill');
const CLI = resolve(SKILL, 'scripts', 'cli.mjs');

const cases = [
  {
    name: 'canonical_date_fields',
    params: {
      executionMode: 'searchFetch',
      question: '中国GDP',
      begin_date: '2025-01-01',
      end_date: '2026/07/15',
    },
  },
  {
    name: 'backend_native_date_fields',
    params: {
      executionMode: 'searchFetch',
      question: '中国GDP',
      beginDate: '20250101',
      endDate: '20260715',
    },
  },
  {
    name: 'observation_control',
    params: {
      executionMode: 'searchFetch',
      question: '中国GDP',
      observation: '10',
    },
  },
];

const results = cases.map(testCase => {
  const started = Date.now();
  const run = spawnSync(process.execPath, [CLI, 'call', 'economic_data', 'natural_language_get_edb_data', JSON.stringify(testCase.params)], {
    cwd: SKILL,
    encoding: 'utf8',
    timeout: 660_000,
    maxBuffer: 30 * 1024 * 1024,
  });
  let output = null;
  let parse_error = null;
  try {
    output = JSON.parse(run.stdout);
  } catch (error) {
    parse_error = error.message;
  }
  return {
    ...testCase,
    duration_ms: Date.now() - started,
    exit_code: run.status,
    signal: run.signal,
    stdout: run.stdout,
    stderr: run.stderr,
    output,
    parse_error,
    passed: run.status === 0 && !parse_error,
    error_code: output?.error?.code || null,
    error_message: output?.error?.details?.message || null,
  };
});

writeFileSync(resolve(HERE, 'raw-results.json'), JSON.stringify({
  test_name: 'natural_language_get_edb_data 日期字段真实后端对照测试',
  executed_at: new Date().toISOString(),
  execution_mode: 'serial',
  results,
}, null, 2) + '\n');

const rows = results.map(item => `| ${item.name} | \`${JSON.stringify(item.params)}\` | ${item.exit_code} | ${item.passed ? '成功' : `失败：\`${item.error_code}\``} | ${item.error_message || ''} |`);
const report = `# natural_language_get_edb_data 日期字段真实后端测试

| 用例 | 参数 | exit | 结果 | 错误摘要 |
| --- | --- | ---: | --- | --- |
${rows.join('\n')}

## 判定

- 该脚本记录统一字段、后端原生字段和 \`observation\` 对照的实际结果，不把网络错误判定为业务失败。
- \`begin_date/end_date → beginDate/endDate\` 的确定性转换结论由静态 CLI 回归覆盖；真实后端用例用于补充端到端观察。
- 完整原始响应见 \`raw-results.json\`。
`;
writeFileSync(resolve(HERE, 'TEST-REPORT.md'), report);
process.stdout.write(JSON.stringify(results.map(item => ({ name: item.name, exit_code: item.exit_code, passed: item.passed, error_code: item.error_code, error_message: item.error_message })), null, 2) + '\n');
