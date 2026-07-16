import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const skillDir = resolve(repo, 'skills', 'wind-mcp-skill');
const cli = resolve(skillDir, 'scripts', 'cli.mjs');

const codes = [
  '600519.SH', '000001.SZ', '300750.SZ', '601318.SH', '600036.SH',
  '000858.SZ', '600276.SH', '601166.SH', '600900.SH', '002594.SZ',
  '601398.SH', '000333.SZ', '600030.SH', '601888.SH', '002415.SZ',
  '600887.SH', '601012.SH', '000725.SZ', '600309.SH', '601088.SH',
  '600104.SH', '600585.SH', '600690.SH', '600703.SH', '600809.SH',
  '601066.SH', '601225.SH', '601288.SH', '601328.SH', '601601.SH',
  '601628.SH', '601668.SH', '601688.SH', '601728.SH', '601857.SH',
  '601899.SH', '601919.SH', '601985.SH', '601988.SH', '601998.SH',
  '000063.SZ', '000100.SZ', '000166.SZ', '000568.SZ', '000651.SZ',
  '000776.SZ', '000895.SZ', '002230.SZ', '002352.SZ', '002475.SZ',
];

const beginDate = '20260701';
const endDate = '20260715';
const levels = [5, 10, 20, 50];

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function parseBackendData(output) {
  const text = output?.content?.[0]?.text;
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text)?.data || null;
  } catch {
    return null;
  }
}

function callKline(windcode) {
  const params = JSON.stringify({
    windcode,
    begin_date: beginDate,
    end_date: endDate,
    period: '10',
  });

  return new Promise(resolveCall => {
    const started = performance.now();
    const child = spawn(process.execPath, [
      cli, 'call', 'stock_data', 'get_stock_kline', params,
    ], {
      cwd: skillDir,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 660_000);

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', exitCode => {
      clearTimeout(timeout);
      const elapsedMs = Math.round(performance.now() - started);
      let output = null;
      try {
        output = JSON.parse(stdout);
      } catch {}

      const backendData = parseBackendData(output);
      const returnedCode = backendData?.windcode ?? null;
      const rows = Array.isArray(backendData?.rows) ? backendData.rows : [];
      const columns = Array.isArray(backendData?.columns) ? backendData.columns : [];
      const dateIndex = columns.findIndex(column => column?.name === '_DATE');
      const dates = dateIndex >= 0 ? rows.map(row => String(row[dateIndex])) : [];
      const codeMatches = returnedCode === windcode;
      const datesInRange = dates.every(date => date >= beginDate && date <= endDate);

      resolveCall({
        windcode,
        exitCode,
        elapsedMs,
        timedOut,
        errorCode: output?.error?.code ?? null,
        errorDetails: output?.error?.details ?? null,
        retry: output?.error?.retry ?? null,
        circuitBreaker: output?.error?.circuit_breaker ?? null,
        correction: output?.error?.correction ?? null,
        returnedCode,
        rowCount: rows.length,
        codeMatches,
        datesInRange,
        stderr: stderr.trim().slice(0, 500),
        parseableJson: output !== null,
      });
    });
  });
}

async function runLevel(concurrency) {
  const selected = codes.slice(0, concurrency);
  const wallStarted = performance.now();
  const results = await Promise.all(selected.map(callKline));
  const wallMs = Math.round(performance.now() - wallStarted);
  const successes = results.filter(result => result.exitCode === 0);
  const failures = results.filter(result => result.exitCode !== 0);
  const latencies = results.map(result => result.elapsedMs);
  const errorCounts = {};
  for (const result of failures) {
    const code = result.errorCode || (result.timedOut ? 'PARENT_TIMEOUT' : 'UNKNOWN');
    errorCounts[code] = (errorCounts[code] || 0) + 1;
  }

  return {
    concurrency,
    wallMs,
    total: results.length,
    succeeded: successes.length,
    failed: failures.length,
    successRate: Number((successes.length / results.length * 100).toFixed(2)),
    latencyMs: {
      min: Math.min(...latencies),
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: Math.max(...latencies),
      average: Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
    },
    errorCounts,
    dataChecks: {
      codeMismatch: successes.filter(result => !result.codeMatches).map(result => result.windcode),
      dateOutOfRange: successes.filter(result => !result.datesInRange).map(result => result.windcode),
      emptyRows: successes.filter(result => result.rowCount === 0).map(result => result.windcode),
      unparseableJson: results.filter(result => !result.parseableJson).map(result => result.windcode),
    },
    results,
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  tool: 'stock_data.get_stock_kline',
  range: { beginDate, endDate, period: '10' },
  levels: [],
};

for (const level of levels) {
  process.stderr.write(`Running concurrency=${level}...\n`);
  report.levels.push(await runLevel(level));
}

const serialized = JSON.stringify(report, null, 2) + '\n';
const outputFile = process.argv[2] || 'raw-results.json';
writeFileSync(resolve(here, outputFile), serialized, 'utf8');
process.stdout.write(serialized);
