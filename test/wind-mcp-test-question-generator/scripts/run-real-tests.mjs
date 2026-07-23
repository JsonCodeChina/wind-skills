#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
if (!args.input || !args.output) {
  throw new Error("用法: node run-real-tests.mjs --input questions.json --output real-results.json [--cli path/to/cli.mjs]");
}

const root = process.cwd();
const inputFile = path.resolve(root, args.input);
const outputFile = path.resolve(root, args.output);
const cliFile = path.resolve(root, args.cli || "skills/wind-mcp-skill/scripts/cli.mjs");
const source = JSON.parse(readFileSync(inputFile, "utf8"));
const results = [];
const routeKey = item => `${item.expected.server_type}.${item.expected.tool_name}`;
const firstByRoute = new Map();
for (const item of source.cases) if (!firstByRoute.has(routeKey(item))) firstByRoute.set(routeKey(item), item);
const probes = [...firstByRoute.values()];
const probeIds = new Set(probes.map(item => item.id));
const orderedCases = [...probes, ...source.cases.filter(item => !probeIds.has(item.id))];
const failedProbeRoutes = new Set();

function parseOutput(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function errorCode(parsed, status) {
  return parsed?.error?.code
    || parsed?.code
    || parsed?.content?.find?.(x => x?.type === "text")?.error?.code
    || (status === 0 ? null : "PROCESS_OR_PARSE_ERROR");
}

function save(stopped = false) {
  const passed = results.filter(x => x.ok).length;
  const failed = results.length - passed;
  writeFileSync(outputFile, `${JSON.stringify({
    source: inputFile,
    cli: cliFile,
    started_at,
    updated_at: new Date().toISOString(),
    stopped,
    summary: {
      planned: source.cases.length,
      executed: results.length,
      passed,
      failed,
      remaining: source.cases.length - results.length,
      failed_probe_routes: [...failedProbeRoutes],
      by_error_code: Object.fromEntries([...new Set(results.map(x => x.error_code).filter(Boolean))].map(code => [code, results.filter(x => x.error_code === code).length]))
    },
    results
  }, null, 2)}\n`, "utf8");
}

const started_at = new Date().toISOString();
let stopped = false;
for (const testCase of orderedCases) {
  const route = routeKey(testCase);
  if (failedProbeRoutes.has(route)) continue;
  const started = Date.now();
  const run = spawnSync(process.execPath, [
    cliFile,
    "call",
    testCase.expected.server_type,
    testCase.expected.tool_name,
    JSON.stringify(testCase.expected.params)
  ], {
    cwd: path.dirname(path.dirname(cliFile)),
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: 120000
  });
  const stdout = (run.stdout || "").trim();
  const stderr = (run.stderr || "").trim();
  const parsed = parseOutput(stdout);
  const code = errorCode(parsed, run.status);
  const ok = run.status === 0 && parsed !== null && parsed.isError !== true && !parsed.error;
  const row = {
    id: testCase.id,
    question: testCase.question,
    server_type: testCase.expected.server_type,
    tool_name: testCase.expected.tool_name,
    params: testCase.expected.params,
    exit_code: run.status,
    signal: run.signal,
    duration_ms: Date.now() - started,
    ok,
    error_code: code,
    stdout,
    stderr,
    parsed
  };
  results.push(row);
  if (probeIds.has(testCase.id) && !ok) failedProbeRoutes.add(route);
  process.stdout.write(`[${testCase.id}/${source.cases.length}] ${row.server_type}.${row.tool_name} ${ok ? "OK" : `FAIL ${code || ""}`} ${row.duration_ms}ms\n`);
  save(false);
  if (parsed?.error?.circuit_breaker?.tripped === true) {
    stopped = true;
    break;
  }
}
save(stopped);
process.stdout.write(`${JSON.stringify(JSON.parse(readFileSync(outputFile, "utf8")).summary)}\n`);
