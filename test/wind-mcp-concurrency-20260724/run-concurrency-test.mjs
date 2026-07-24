#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SKILL = resolve(REPO, 'skills', 'wind-mcp-skill');
const CLI = resolve(SKILL, 'scripts', 'cli.mjs');
const LEVELS = [5, 10, 20, 50];
const CODES = [
  '600519.SH', '000001.SZ', '300750.SZ', '601318.SH', '600036.SH',
  '000858.SZ', '601166.SH', '600900.SH', '002594.SZ', '601398.SH',
];
const COOL_DOWN_MS = 5000;

mkdirSync(HERE, {recursive: true});

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function nestedBackendCode(parsed) {
  const text = parsed?.content?.find?.(item => item?.type === 'text')?.text;
  const inner = typeof text === 'string' ? parseJson(text) : null;
  return inner?.error?.code ?? inner?.data?.code ?? null;
}

function runOne(level, index) {
  return new Promise(resolvePromise => {
    const windcode = CODES[index % CODES.length];
    const params = JSON.stringify({windcode, indexes: '中文简称,最新成交价'});
    const started = Date.now();
    const child = spawn(process.execPath, [
      CLI,
      'call',
      'stock_data',
      'get_stock_price_indicators',
      params,
    ], {
      cwd: SKILL,
      env: {...process.env, WIND_DEBUG: '1'},
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => {
      resolvePromise({
        level,
        index: index + 1,
        windcode,
        ok: false,
        process_error: error.message,
        duration_ms: Date.now() - started,
        stdout,
        stderr,
      });
    });
    child.on('close', (exitCode, signal) => {
      const parsed = parseJson(stdout.trim());
      const ok = exitCode === 0 && parsed && parsed.isError !== true && parsed.ok !== false;
      resolvePromise({
        level,
        index: index + 1,
        windcode,
        ok,
        exit_code: exitCode,
        signal,
        duration_ms: Date.now() - started,
        error_code: parsed?.error?.code || null,
        backend_code: nestedBackendCode(parsed),
        retry_lines: stderr.split(/\r?\n/).filter(line => line.includes('wind-mcp fetch retry')),
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? null;
}

function summarize(level, rows, wallMs) {
  const durations = rows.map(row => row.duration_ms);
  const byError = {};
  for (const row of rows.filter(item => !item.ok)) {
    const key = row.error_code || row.process_error || `EXIT_${row.exit_code}`;
    byError[key] = (byError[key] || 0) + 1;
  }
  return {
    concurrency: level,
    planned: rows.length,
    succeeded: rows.filter(row => row.ok).length,
    failed: rows.filter(row => !row.ok).length,
    success_rate: rows.filter(row => row.ok).length / rows.length,
    wall_ms: wallMs,
    latency_ms: {
      min: Math.min(...durations),
      median: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      max: Math.max(...durations),
    },
    fetch_retry_events: rows.reduce((sum, row) => sum + row.retry_lines.length, 0),
    by_error_code: byError,
  };
}

const startedAt = new Date().toISOString();
const phases = [];
for (const level of LEVELS) {
  const phaseStart = Date.now();
  process.stdout.write(`START concurrency=${level}\n`);
  const rows = await Promise.all(Array.from({length: level}, (_, index) => runOne(level, index)));
  const summary = summarize(level, rows, Date.now() - phaseStart);
  phases.push({summary, rows});
  process.stdout.write(`DONE ${JSON.stringify(summary)}\n`);
  writeFileSync(resolve(HERE, 'concurrency-results.json'), `${JSON.stringify({
    started_at: startedAt,
    updated_at: new Date().toISOString(),
    cli: CLI,
    phases,
  }, null, 2)}\n`, 'utf8');
  if (level !== LEVELS.at(-1)) {
    await new Promise(resolveWait => setTimeout(resolveWait, COOL_DOWN_MS));
  }
}
