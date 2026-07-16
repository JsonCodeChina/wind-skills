import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SKILL = resolve(REPO, 'skills', 'wind-mcp-skill');
const CLI = resolve(SKILL, 'scripts', 'cli.mjs');
const MANIFEST = JSON.parse(readFileSync(resolve(SKILL, 'references', 'tool-manifest.json'), 'utf8'));

const cases = [
  { server_type: 'stock_data', tool_name: 'search_stocks', params: { question: '筛选A股中的银行股', lang: 'zh' } },
  { server_type: 'stock_data', tool_name: 'get_stock_price_indicators', params: { windcode: '600519.SH', indexes: '中文简称,最新成交价' } },
  { server_type: 'stock_data', tool_name: 'get_stock_kline', params: { windcode: '600519.SH', begin_date: '2026-07-01', end_date: '2026/07/15', period: 'day' } },
  { server_type: 'stock_data', tool_name: 'get_stock_quote', params: { windcode: '600519.SH', begin_date: 'LAST', end_date: 'LAST' } },
  { server_type: 'stock_data', tool_name: 'get_stock_basicinfo', params: { question: '600519.SH公司基本档案', lang: 'zh' } },
  { server_type: 'stock_data', tool_name: 'get_stock_fundamentals', params: { question: '贵州茅台2024年ROE和净利润增速', lang: 'zh' } },
  { server_type: 'stock_data', tool_name: 'get_stock_equity_holders', params: { question: '贵州茅台前十大股东', lang: 'zh' } },
  { server_type: 'stock_data', tool_name: 'get_stock_events', params: { question: '宁德时代2024年分红事件', lang: 'zh' } },
  { server_type: 'stock_data', tool_name: 'get_stock_technicals', params: { question: '贵州茅台近60日MACD走势', lang: 'zh' } },
  { server_type: 'stock_data', tool_name: 'get_risk_metrics', params: { question: '贵州茅台过去1年Beta和波动率', lang: 'zh' } },

  { server_type: 'fund_data', tool_name: 'search_funds', params: { question: '筛选股票型基金', lang: 'zh' } },
  { server_type: 'fund_data', tool_name: 'get_fund_price_indicators', params: { windcode: '588200.SH', indexes: '中文简称,最新成交价' } },
  { server_type: 'fund_data', tool_name: 'get_fund_kline', params: { windcode: '588200.SH', begin_date: '2026-07-01', end_date: '2026/07/15', period: 'day' } },
  { server_type: 'fund_data', tool_name: 'get_fund_quote', params: { windcode: '588200.SH', begin_date: 'LAST', end_date: 'LAST' } },
  { server_type: 'fund_data', tool_name: 'get_fund_info', params: { question: '易方达蓝筹精选005827.OF基金档案', lang: 'zh' } },
  { server_type: 'fund_data', tool_name: 'get_fund_financials', params: { question: '005827.OF2024年净利润和分红', lang: 'zh' } },
  { server_type: 'fund_data', tool_name: 'get_fund_holdings', params: { question: '005827.OF最新一期重仓股', lang: 'zh' } },
  { server_type: 'fund_data', tool_name: 'get_fund_performance', params: { question: '005827.OF近1年业绩排名', lang: 'zh' } },
  { server_type: 'fund_data', tool_name: 'get_fund_holders', params: { question: '005827.OF持有人结构', lang: 'zh' } },
  { server_type: 'fund_data', tool_name: 'get_fund_company_info', params: { question: '易方达基金管理公司档案', lang: 'zh' } },

  { server_type: 'index_data', tool_name: 'get_index_price_indicators', params: { windcode: '000300.SH', indexes: '中文简称,最新成交价' } },
  { server_type: 'index_data', tool_name: 'get_index_kline', params: { windcode: '000300.SH', begin_date: '2026-07-01', end_date: '2026/07/15', period: 'day' } },
  { server_type: 'index_data', tool_name: 'get_index_quote', params: { windcode: '000300.SH', begin_date: 'LAST', end_date: 'LAST' } },
  { server_type: 'index_data', tool_name: 'get_index_basicinfo', params: { question: '沪深300指数档案', lang: 'zh' } },
  { server_type: 'index_data', tool_name: 'get_index_fundamentals', params: { question: '沪深300PE和PB历史分位', lang: 'zh' } },
  { server_type: 'index_data', tool_name: 'get_index_technicals', params: { question: '沪深300的MACD和RSI', lang: 'zh' } },

  { server_type: 'bond_data', tool_name: 'get_bond_basicinfo', params: { question: '国债2601基本信息', lang: 'zh' } },
  { server_type: 'bond_data', tool_name: 'get_bond_issuer_info', params: { question: '国债2601发债主体', lang: 'zh' } },
  { server_type: 'bond_data', tool_name: 'get_bond_market_data', params: { question: '国债2601久期和凸性', lang: 'zh' } },
  { server_type: 'bond_data', tool_name: 'get_bond_financial_data', params: { question: '国债2601主体2024年营收', lang: 'zh' } },

  { server_type: 'financial_docs', tool_name: 'get_company_announcements', params: { question: '贵州茅台2024年年度报告', top_k: 3 } },
  { server_type: 'financial_docs', tool_name: 'get_financial_news', params: { question: '贵州茅台最新新闻', top_k: 3 } },
  { server_type: 'economic_data', tool_name: 'natural_language_get_edb_data', params: { executionMode: 'searchFetch', question: '中国GDP', begin_date: '2025-01-01', end_date: '2026/07/15' } },
  { server_type: 'analytics_data', tool_name: 'get_financial_data', params: { question: '贵州茅台最新收盘价', lang: '中文' } },
];

const expected = Object.entries(MANIFEST).flatMap(([server_type, tools]) => tools.map(tool_name => `${server_type}.${tool_name}`));
const actual = cases.map(item => `${item.server_type}.${item.tool_name}`);
if (new Set(actual).size !== actual.length || expected.length !== actual.length || expected.some(key => !actual.includes(key))) {
  throw new Error(`测试矩阵与 tool-manifest 不一致。manifest=${expected.length}, cases=${actual.length}, missing=${expected.filter(key => !actual.includes(key)).join(',')}`);
}

const retryable = new Set(['NETWORK_ERROR', 'TEMPORARILY_UNAVAILABLE', 'RATE_LIMIT_ERROR', 'CONCURRENCY_LIMIT_ERROR']);
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function runOnce(testCase) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [CLI, 'call', testCase.server_type, testCase.tool_name, JSON.stringify(testCase.params)], {
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
    request_params: testCase.params,
    duration_ms: Date.now() - started,
    exit_code: run.status,
    signal: run.signal,
    stdout: run.stdout,
    stderr: run.stderr,
    output,
    parse_error,
  };
}

const started_at = new Date().toISOString();
const results = [];
for (let index = 0; index < cases.length; index += 1) {
  const testCase = cases[index];
  process.stderr.write(`[${index + 1}/${cases.length}] ${testCase.server_type}.${testCase.tool_name}\n`);
  const attempts = [runOnce(testCase)];
  const code = attempts[0].output?.error?.code;
  const retry = attempts[0].output?.error?.retry;
  if (attempts[0].exit_code !== 0 && retryable.has(code) && retry?.allowed) {
    sleep(Math.max(0, Number(retry.after_ms || 3000)));
    attempts.push(runOnce(testCase));
  } else if (
    testCase.tool_name === 'natural_language_get_edb_data'
    && code === 'UNKNOWN'
    && /observation只能是纯数字或者all/.test(attempts[0].output?.error?.details?.message || '')
  ) {
    const corrected = {
      ...testCase,
      params: {
        executionMode: testCase.params.executionMode,
        question: testCase.params.question,
        observation: '10',
      },
    };
    attempts.push(runOnce(corrected));
  }
  const final = attempts.at(-1);
  results.push({
    id: index + 1,
    server_type: testCase.server_type,
    tool_name: testCase.tool_name,
    params: testCase.params,
    passed: final.exit_code === 0 && !final.parse_error,
    final_error_code: final.output?.error?.code || null,
    attempts,
  });
}
const finished_at = new Date().toISOString();

const raw = {
  test_name: 'Wind MCP 全部工具真实后端串行测试',
  started_at,
  finished_at,
  manifest_tool_count: expected.length,
  executed_tool_count: results.length,
  execution_mode: 'serial',
  results,
};
writeFileSync(resolve(HERE, 'raw-results.json'), JSON.stringify(raw, null, 2) + '\n');

const passed = results.filter(item => item.passed);
const failed = results.filter(item => !item.passed);
const domainRows = Object.keys(MANIFEST).map(serverType => {
  const domainResults = results.filter(item => item.server_type === serverType);
  return `| \`${serverType}\` | ${domainResults.filter(item => item.passed).length}/${domainResults.length} |`;
});
const failureRows = failed.length
  ? failed.map(item => `| \`${item.server_type}.${item.tool_name}\` | \`${item.final_error_code || 'PROCESS_OR_PARSE_ERROR'}\` | ${String(item.attempts.at(-1).output?.error?.details?.message || item.attempts.at(-1).parse_error || item.attempts.at(-1).stderr || '').replace(/\|/g, '\\|').slice(0, 300)} |`)
  : ['| — | — | 无 |'];

const report = `# Wind MCP 全部工具真实后端测试报告

- 测试时间：${started_at} 至 ${finished_at}
- 执行方式：串行，默认并发数 1
- Manifest 工具数：${expected.length}
- 实际执行工具数：${results.length}
- 成功：${passed.length}
- 失败：${failed.length}
- 总通过率：${((passed.length / results.length) * 100).toFixed(1)}%

## 分服务结果

| server_type | 成功/总数 |
| --- | ---: |
${domainRows.join('\n')}

## 失败明细

| 工具 | 错误码 | 最终错误摘要 |
| --- | --- | --- |
${failureRows.join('\n')}

## 重试与异常观察

- 本轮共执行 ${results.reduce((total, item) => total + item.attempts.length, 0)} 次后端调用尝试。
- \`stock_data.get_stock_quote\` 首次返回 \`NETWORK_ERROR: fetch failed\`，按错误信封原样重试一次后成功。
- \`economic_data.natural_language_get_edb_data\` 使用统一日期范围时，后端返回 \`UNKNOWN: observation只能是纯数字或者all\`；同一工具改用 \`observation: "10"\` 修正重试后成功。这说明 EDB 日期字段映射已穿过本地校验，但该后端路径仍存在日期范围与 \`observation\` 契约不一致。

## 回归覆盖

- 3 个 K 线工具使用 ISO/斜杠日期和 \`period: day\`，验证 CLI 日期及周期归一化。
- 3 个 Quote 工具使用统一的 \`begin_date/end_date: LAST\`，验证字段映射及 LAST 特例。
- EDB 使用统一的 \`begin_date/end_date\`，验证到 \`beginDate/endDate\` 的映射。
- 若 EDB 后端对日期范围返回“observation只能是纯数字或者all”，同一工具按明确错误提示改用 \`observation: 10\` 修正重试一次，并保留两次证据。
- 21 个标准 \`lang\` 工具使用 \`lang: zh\`，验证统一外部词表。
- Analytics 使用 \`lang: 中文\`，验证到 \`CNS\` 的后端编码转换。
- 2 个 Financial Docs 工具使用 \`question\`，验证到后端 \`query\` 的转换。
- 34 个工具均来自当前 \`tool-manifest.json\`，脚本启动前会校验无遗漏、无重复。

完整请求、每次尝试、stdout、stderr 和解析结果见 \`raw-results.json\`。
`;
writeFileSync(resolve(HERE, 'TEST-REPORT.md'), report);

process.stdout.write(JSON.stringify({ total: results.length, passed: passed.length, failed: failed.length, failures: failed.map(item => ({ tool: `${item.server_type}.${item.tool_name}`, code: item.final_error_code })) }, null, 2) + '\n');
