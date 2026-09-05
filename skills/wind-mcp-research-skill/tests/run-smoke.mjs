#!/usr/bin/env node
// 冒烟测试：用 annotations.json 里的实测样例逐个真实调用工具。
// 放在 tests/ 而不是 cli.mjs 里，是因为它会打满 132 次真实请求——不该出现在 agent 的命令面上。
// 用法：node tests/run-smoke.mjs [server]
import { readRegistry, validateParams, callTool } from '../scripts/cli.mjs';

const only = process.argv[2] || null;
const reg = readRegistry();
const targets = only ? [only] : Object.keys(reg.servers);
for (const t of targets) {
  if (!reg.servers[t]) {
    console.error(`未知 server '${t}'。可用：${Object.keys(reg.servers).join(' / ')}`);
    process.exit(1);
  }
}

const results = [];
let pass = 0; let fail = 0; let skipped = 0;

for (const alias of targets) {
  const server = reg.servers[alias];
  for (const [name, tool] of Object.entries(server.tools)) {
    if (!tool.sample) {
      skipped++;
      results.push({ alias, name, status: 'skipped', detail: '无样例入参' });
      continue;
    }
    const invalid = validateParams(tool.inputSchema, tool.sample);
    if (invalid) {
      fail++;
      results.push({ alias, name, status: 'invalid_sample', detail: invalid.message });
      continue;
    }
    try {
      const r = await callTool(server.full, name, tool.sample);
      const bad = r.isError || r.suspectError || !r.text.length;
      bad ? fail++ : pass++;
      results.push({
        alias, name,
        status: bad ? 'fail' : 'pass',
        detail: bad ? `${r.text.slice(0, 120).replace(/\s+/g, ' ')}${tool.knownIssue ? '  [已知故障]' : ''}` : `${r.text.length} 字`,
      });
    } catch (e) {
      fail++;
      results.push({ alias, name, status: 'error', detail: String(e.message).slice(0, 120) });
    }
  }
}

const ICON = { pass: '✅', fail: '❌', error: '💥', skipped: '⏭', invalid_sample: '⚠' };
let current = null;
for (const r of results) {
  if (r.alias !== current) { current = r.alias; console.log(`\n=== ${current} ===`); }
  console.log(`${ICON[r.status]} ${r.name.padEnd(40)} ${r.detail}`);
}
console.log(`\n通过 ${pass} / 失败 ${fail} / 跳过 ${skipped}  合计 ${pass + fail + skipped}`);
if (fail) {
  console.log('\n失败项里带 [已知故障] 的是已记录的服务端问题，不是本 skill 的回归。');
  process.exit(1);
}
