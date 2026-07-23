import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SKILL = resolve(REPO, 'skills', 'wind-mcp-skill');
const CLI = resolve(SKILL, 'scripts', 'cli.mjs');
const SOURCE = resolve(REPO, 'test', 'wind_100_cases_1_9_1_results_20260608.json');
const MANIFEST = JSON.parse(readFileSync(resolve(SKILL, 'references', 'tool-manifest.json'), 'utf8'));
const PARAMS_FILE = resolve(HERE, '.current-params.json');

const source = JSON.parse(readFileSync(SOURCE, 'utf8'));
if (!Array.isArray(source.records) || source.records.length !== 100) {
  throw new Error(`500 问基线要求恰好 100 条，实际 ${source.records?.length ?? 'invalid'}`);
}

const variants = [
  { name: 'original', render: question => question },
  { name: 'please_query', render: question => `请帮我查询：${question}` },
  { name: 'want_to_know', render: question => `我想了解，${question}` },
  { name: 'wind_data', render: question => `请使用 Wind 数据回答：${question}` },
  { name: 'accurate_result', render: question => `${question.replace(/[？。]\s*$/, '')}，请返回准确数据。` },
];

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function currentRoute(record, renderedQuestion) {
  if (record.route.server === 'economic_data' && record.route.tool === 'get_economic_data') {
    return {
      server_type: 'economic_data',
      tool_name: 'natural_language_get_edb_data',
      params: {
        executionMode: 'searchFetch',
        question: renderedQuestion,
        observation: '10',
      },
    };
  }

  const params = Object.fromEntries(
    Object.entries(record.route.params || {}).map(([key, value]) => [
      key,
      /^(begin_date|end_date|beginDate|endDate|begin|end|date|tradeDate|afdate)$/.test(key)
        ? isoDate(value)
        : value,
    ]),
  );
  if (typeof params.question === 'string') params.question = renderedQuestion;
  if (typeof params.query === 'string') params.query = renderedQuestion;
  return {
    server_type: record.route.server,
    tool_name: record.route.tool,
    params,
  };
}

const cases = source.records.flatMap(record => variants.map((variant, variantIndex) => {
  const question = variant.render(record.question);
  return {
    id: (record.number - 1) * variants.length + variantIndex + 1,
    base_number: record.number,
    variant: variant.name,
    question,
    ...currentRoute(record, question),
  };
}));

if (cases.length !== 500) throw new Error(`生成问句数错误：${cases.length}`);
for (const testCase of cases) {
  if (!MANIFEST[testCase.server_type]?.includes(testCase.tool_name)) {
    throw new Error(`非法路由：${testCase.server_type}.${testCase.tool_name}（case ${testCase.id}）`);
  }
}

writeFileSync(resolve(HERE, 'cases.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  source: relative(REPO, SOURCE).replaceAll('\\', '/'),
  count: cases.length,
  variants: variants.map(item => item.name),
  cases,
}, null, 2) + '\n');

const retryable = new Set(['NETWORK_ERROR', 'TEMPORARILY_UNAVAILABLE', 'RATE_LIMIT_ERROR', 'CONCURRENCY_LIMIT_ERROR']);
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function runOnce(testCase) {
  writeFileSync(PARAMS_FILE, JSON.stringify(testCase.params), 'utf8');
  const started = Date.now();
  const run = spawnSync(process.execPath, [
    CLI,
    'call',
    testCase.server_type,
    testCase.tool_name,
    `@${PARAMS_FILE}`,
  ], {
    cwd: SKILL,
    encoding: 'utf8',
    timeout: 660_000,
    maxBuffer: 50 * 1024 * 1024,
  });
  let output = null;
  let parse_error = null;
  try {
    output = JSON.parse(run.stdout);
  } catch (error) {
    parse_error = error.message;
  }
  return {
    duration_ms: Date.now() - started,
    exit_code: run.status,
    signal: run.signal,
    output,
    parse_error,
    stderr: run.stderr,
  };
}

const startedAt = new Date().toISOString();
const results = [];
try {
  for (const testCase of cases) {
    process.stderr.write(`[${testCase.id}/500] ${testCase.server_type}.${testCase.tool_name} ${testCase.variant}\n`);
    const attempts = [runOnce(testCase)];
    const first = attempts[0];
    const code = first.output?.error?.code;
    const retry = first.output?.error?.retry;
    if (first.exit_code !== 0 && retryable.has(code) && retry?.allowed) {
      sleep(Math.max(1000, Number(retry.after_ms || 3000)));
      attempts.push(runOnce(testCase));
    }
    const final = attempts.at(-1);
    results.push({
      ...testCase,
      passed: final.exit_code === 0 && !final.parse_error,
      final_error_code: final.output?.error?.code || null,
      attempts,
    });
    sleep(100);
  }
} finally {
  rmSync(PARAMS_FILE, { force: true });
}
const finishedAt = new Date().toISOString();

const passed = results.filter(item => item.passed);
const failed = results.filter(item => !item.passed);
const quotaFailures = failed.filter(item => item.final_error_code === 'DAILY_LIMIT_ERROR');
const functionalResults = results.filter(item => item.final_error_code !== 'DAILY_LIMIT_ERROR');
const functionalPassed = functionalResults.filter(item => item.passed);
const functionalFailed = functionalResults.filter(item => !item.passed);
const firstQuotaFailure = quotaFailures[0] || null;
const byRoute = new Map();
const byVariant = new Map();
const byError = new Map();
for (const item of results) {
  const route = `${item.server_type}.${item.tool_name}`;
  const routeState = byRoute.get(route) || { total: 0, passed: 0, quota: 0 };
  routeState.total += 1;
  routeState.passed += Number(item.passed);
  routeState.quota += Number(item.final_error_code === 'DAILY_LIMIT_ERROR');
  byRoute.set(route, routeState);

  const variantState = byVariant.get(item.variant) || { total: 0, passed: 0, quota: 0 };
  variantState.total += 1;
  variantState.passed += Number(item.passed);
  variantState.quota += Number(item.final_error_code === 'DAILY_LIMIT_ERROR');
  byVariant.set(item.variant, variantState);

  if (!item.passed) {
    const error = item.final_error_code || 'PROCESS_OR_PARSE_ERROR';
    byError.set(error, (byError.get(error) || 0) + 1);
  }
}

writeFileSync(resolve(HERE, 'raw-results.json'), JSON.stringify({
  test_name: 'Wind MCP 500 条问句真实后端测试',
  started_at: startedAt,
  finished_at: finishedAt,
  execution_mode: 'serial',
  params_transport: '@file',
  source_question_count: source.records.length,
  generated_question_count: cases.length,
  total_attempts: results.reduce((sum, item) => sum + item.attempts.length, 0),
  passed: passed.length,
  failed: failed.length,
  results,
}, null, 2) + '\n');

const routeRows = [...byRoute.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([route, state]) => {
    const evaluable = state.total - state.quota;
    return `| \`${route}\` | ${state.passed}/${state.total} | ${state.quota} | ${evaluable ? `${state.passed}/${evaluable} (${((state.passed / evaluable) * 100).toFixed(1)}%)` : '无有效样本'} |`;
  });
const variantRows = [...byVariant.entries()]
  .map(([variant, state]) => {
    const evaluable = state.total - state.quota;
    return `| \`${variant}\` | ${state.passed}/${state.total} | ${state.quota} | ${evaluable ? `${state.passed}/${evaluable} (${((state.passed / evaluable) * 100).toFixed(1)}%)` : '无有效样本'} |`;
  });
const errorRows = byError.size
  ? [...byError.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => `| \`${code}\` | ${count} |`)
  : ['| — | 0 |'];
const failureRows = failed.length
  ? failed.slice(0, 100).map(item => {
      const final = item.attempts.at(-1);
      const detail = final.output?.error?.details?.message
        || final.output?.error?.details?.[0]?.message
        || final.parse_error
        || final.stderr
        || '';
      return `| ${item.id} | ${item.base_number} | \`${item.variant}\` | \`${item.server_type}.${item.tool_name}\` | \`${item.final_error_code || 'PROCESS_OR_PARSE_ERROR'}\` | ${String(detail).replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 200)} |`;
    })
  : ['| — | — | — | — | — | 无 |'];

const report = `# Wind MCP 500 条问句真实后端测试报告

- 测试时间：${startedAt} 至 ${finishedAt}
- 基线问句：100 条
- 表达变体：5 种
- 实际问句：500 条
- 执行方式：串行，并发数 1
- 参数传递：\`@file\`
- 后端调用尝试：${results.reduce((sum, item) => sum + item.attempts.length, 0)} 次
- 成功：${passed.length}
- 失败：${failed.length}
- 原始通过率：${((passed.length / results.length) * 100).toFixed(2)}%
- 当日额度失败：${quotaFailures.length}
- 排除额度后的有效样本：${functionalResults.length}
- 有效成功：${functionalPassed.length}
- 有效失败：${functionalFailed.length}
- 有效通过率：${((functionalPassed.length / functionalResults.length) * 100).toFixed(2)}%
- 首次额度错误：${firstQuotaFailure ? `ID ${firstQuotaFailure.id}` : '未触发'}

## 表达变体结果

| 变体 | 成功/总数 | 额度失败 | 有效成功率 |
| --- | ---: | ---: | ---: |
${variantRows.join('\n')}

## 路由结果

| 路由 | 成功/总数 | 额度失败 | 有效成功率 |
| --- | ---: | ---: | ---: |
${routeRows.join('\n')}

## 错误码分布

| 错误码 | 数量 |
| --- | ---: |
${errorRows.join('\n')}

## 失败明细

最多展示前 100 条；全部结果见 \`raw-results.json\`。

| ID | 基线 | 变体 | 路由 | 错误码 | 摘要 |
| ---: | ---: | --- | --- | --- | --- |
${failureRows.join('\n')}

## 测试说明

- 500 条问句由历史 100 问基线生成 5 种措辞，完整清单见 \`cases.json\`。
- 历史 K 线日期在执行前转换为 ISO 8601 \`yyyy-MM-dd\`。
- 历史 \`economic_data.get_economic_data\` 路由迁移到当前 \`natural_language_get_edb_data\`。
- 每次调用通过 UTF-8 JSON 参数文件和 \`@file\` 传参。
- 网络、临时不可用、限流和并发错误仅在错误信封允许时原样重试一次。
- \`DAILY_LIMIT_ERROR\` 表示测试账户当日额度耗尽，不计入功能有效样本；额度触发后的路由通过率不能用于判断工具质量。
- 非额度失败共 ${functionalFailed.length} 条；其中 \`MARKET_TARGET_NOT_FOUND\` ${functionalFailed.filter(item => item.final_error_code === 'MARKET_TARGET_NOT_FOUND').length} 条。
`;
writeFileSync(resolve(HERE, 'TEST-REPORT.md'), report);

process.stdout.write(JSON.stringify({
  total: results.length,
  passed: passed.length,
  failed: failed.length,
  pass_rate: Number(((passed.length / results.length) * 100).toFixed(2)),
  total_attempts: results.reduce((sum, item) => sum + item.attempts.length, 0),
  errors: Object.fromEntries(byError),
}, null, 2) + '\n');
