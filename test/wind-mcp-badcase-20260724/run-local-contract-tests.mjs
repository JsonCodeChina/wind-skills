#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SKILL = resolve(REPO, 'skills', 'wind-mcp-skill');
const source = JSON.parse(readFileSync(resolve(HERE, 'badcases.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(SKILL, 'scripts', 'tool-manifest.json'), 'utf8'));
const cli = await import(pathToFileURL(resolve(SKILL, 'scripts', 'cli.mjs')).href);

function routeExists(serverType, toolName) {
  return Array.isArray(manifest[serverType]) && manifest[serverType].includes(toolName);
}

function evaluate(testCase) {
  if (!routeExists(testCase.server_type, testCase.tool_name)) {
    return {
      actual_status: 'route_error',
      normalized: null,
      errors: [{code: 'ROUTE_ERROR', message: 'server_type + tool_name 不在当前 manifest'}],
    };
  }

  if (!testCase.params || typeof testCase.params !== 'object' || Array.isArray(testCase.params)) {
    const errors = cli.validateBasicParams(testCase.params, testCase.tool_name);
    return {actual_status: 'validation_error', normalized: testCase.params, errors};
  }

  const normalized = cli.normalizeCall(testCase.server_type, testCase.tool_name, testCase.params);
  const errors = [
    ...normalized.normalizationErrors,
    ...cli.validateBasicParams(normalized.args, normalized.toolName),
    ...cli.validateToolParams(normalized.toolName, normalized.args),
  ];
  if (errors.length) {
    return {actual_status: 'validation_error', normalized: normalized.args, errors};
  }
  return {
    actual_status: testCase.expected_status === 'accepted_gap' ? 'accepted_gap' : 'accepted',
    normalized: normalized.args,
    errors: [],
  };
}

const results = source.cases.map(testCase => {
  const actual = evaluate(testCase);
  return {
    ...testCase,
    ...actual,
    passed: actual.actual_status === testCase.expected_status,
  };
});

const byStatus = {};
const byCategory = {};
for (const row of results) {
  byStatus[row.actual_status] = (byStatus[row.actual_status] || 0) + 1;
  byCategory[row.category] ??= {total: 0, passed: 0};
  byCategory[row.category].total += 1;
  if (row.passed) byCategory[row.category].passed += 1;
}

const output = {
  generated_at: new Date().toISOString(),
  source: resolve(HERE, 'badcases.json'),
  skill: SKILL,
  summary: {
    total: results.length,
    passed: results.filter(row => row.passed).length,
    failed: results.filter(row => !row.passed).length,
    by_status: byStatus,
    by_category: byCategory,
  },
  results,
};

writeFileSync(resolve(HERE, 'local-contract-results.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(output.summary, null, 2)}\n`);
for (const row of results.filter(item => !item.passed)) {
  process.stdout.write(`${row.id}: expected=${row.expected_status}, actual=${row.actual_status}\n`);
}
