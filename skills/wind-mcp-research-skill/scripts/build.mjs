#!/usr/bin/env node
// 构建时脚本：重建 scripts/registry.json，并由它生成 references/*.md。
//
// 取数路径（cli.mjs call）不会加载本文件——只有 `cli.mjs refresh` 会动态 import 它。
// 分界：registry.json 与 references/*.md 是**生成物**，后端改了就重跑本脚本；
// 人工写的东西全部在 annotations.json 里（server 说明、领域关键词、样例入参、已知故障），本脚本只读不覆盖。
//
// 用法：
//   node scripts/build.mjs                重建全部 7 个 server 的注册表 + 契约文档
//   node scripts/build.mjs company        只重建一个 server（文档仍全量重生成）
//   node scripts/build.mjs --docs-only    不联网，只用现有 registry.json 重新生成文档
import { existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  listTools,
  endpointOf,
  readAnnotations,
  readRegistry,
  diffTools,
  enumAliases,
  REGISTRY_PATH,
} from './cli.mjs';

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REF_DIR = join(SKILL_DIR, 'references');

// #region 注册表：线上 tools/list 的全量 schema + annotations.json 的人工注解
export async function buildRegistry({ only = null, fetchFn } = {}) {
  const ann = readAnnotations();
  const prev = existsSync(REGISTRY_PATH) ? readRegistry() : { servers: {} };
  const registry = {
    schema_version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    transport: 'MCP Streamable HTTP (JSON-RPC 2.0 over POST, stateless, 每次请求前先 initialize)',
    servers: { ...prev.servers },
  };
  const report = [];
  const aliases = only ? [only] : Object.keys(ann.servers);
  for (const alias of aliases) {
    const meta = ann.servers[alias];
    if (!meta) throw new Error(`annotations.json 中没有 server: ${alias}`);
    const live = await listTools(meta.full, { fetchFn });
    const changes = diffTools(prev.servers?.[alias]?.tools, live);
    const tools = {};
    for (const t of live) {
      const a = meta.tools[t.name] || {};
      tools[t.name] = {
        description: t.description || '',
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
        ...(a.sample ? { sample: a.sample } : {}),
        ...(a.knownIssue ? { knownIssue: a.knownIssue } : {}),
      };
    }
    registry.servers[alias] = {
      full: meta.full,
      endpoint: endpointOf(meta.full),
      title: meta.title,
      scope: meta.scope,
      guidance: meta.guidance,
      keywords: meta.keywords || [],
      toolCount: live.length,
      paramCount: live.reduce((n, t) => n + Object.keys(t.inputSchema?.properties || {}).length, 0),
      tools,
    };
    const orphanSamples = Object.keys(meta.tools).filter((n) => !(n in tools));
    report.push({ alias, count: live.length, ...changes, orphanSamples });
  }
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
  return { registry, report };
}
// #endregion 注册表

// #region 契约文档：由 registry.json 渲染 references/<server>.md
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

// 后端把说明写成【功能】【适用场景】【返回】【边界】四段，拆开排版比整段更好读。
function formatDescription(desc) {
  const text = String(desc || '').trim();
  if (!text.includes('【')) return text;
  return text
    .split(/(?=【)/)
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => {
      const m = seg.match(/^【([^】]+)】([\s\S]*)$/);
      return m ? `- **${m[1]}**：${m[2].trim()}` : seg;
    })
    .join('\n');
}

function enumCell(p) {
  if (!p.enum) return '—';
  const vals = p.enum.map((v) => `\`${v}\``);
  const shown = vals.length > 8 ? `${vals.slice(0, 8).join(' / ')} …（共 ${vals.length} 项，用 describe 看全）` : vals.join(' / ');
  const aliases = enumAliases(p);
  return aliases.size ? `${shown}（另收等价写法 ${[...aliases].slice(0, 4).map((a) => `\`${a}\``).join(' / ')}${aliases.size > 4 ? ' …' : ''}）` : shown;
}

function paramTable(tool) {
  const props = tool.inputSchema?.properties || {};
  const req = new Set(tool.inputSchema?.required || []);
  if (!Object.keys(props).length) return '_无入参。_';
  const rows = Object.entries(props).map(([k, p]) => {
    const dft = p.default !== undefined ? `默认 \`${JSON.stringify(p.default)}\`` : '—';
    return `| \`${k}\` | ${req.has(k) ? '是' : '否'} | ${p.type || '—'} | ${enumCell(p)} | ${dft} | ${esc(p.description || p.title)} |`;
  });
  return ['| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |', '| --- | --- | --- | --- | --- | --- |', ...rows].join('\n');
}

// 若若干工具共用**完全相同**的单参数 schema（同名、同类型、同说明），把参数表提成一节公共入参，
// 各工具小节只留说明——避免几十张一模一样的六列表格淹没真正要读的边界。
// 必须连说明也一致才合并：stock 里 sector 工具的 windCode 指板块代码、company 工具的指股票代码，合并会写错契约。
const SHARED_PARAM_MIN = 5;

function sharedSingleParam(entries) {
  const byShape = new Map();
  for (const [name, t] of entries) {
    const props = t.inputSchema?.properties || {};
    const keys = Object.keys(props);
    if (keys.length !== 1 || (t.inputSchema?.required || []).length !== 1) continue;
    const key = keys[0];
    const prop = props[key];
    const shape = JSON.stringify([key, prop.type, prop.description || prop.title || '', prop.enum || null]);
    if (!byShape.has(shape)) byShape.set(shape, { key, prop, names: [] });
    byShape.get(shape).names.push(name);
  }
  let best = null;
  for (const group of byShape.values()) {
    if (group.names.length >= SHARED_PARAM_MIN && (!best || group.names.length > best.names.length)) best = group;
  }
  return best ? { key: best.key, prop: best.prop, names: new Set(best.names) } : null;
}

const firstLine = (d) => String(d || '').replace(/【功能】/, '').split(/\n|【/)[0].trim();

export function renderServer(alias, server) {
  const lines = [];
  lines.push(`# \`${alias}\` 工具契约 —— ${server.title}`);
  lines.push('');
  lines.push(`> 由 \`scripts/registry.json\` 生成（${server.full}，${server.toolCount} 个工具 / ${server.paramCount} 个参数）。`);
  lines.push('> 参数名、类型、枚举和必填项**以本文件为准**，不要凭记忆填；本地 CLI 会按同一份 schema 拦截不合法入参。');
  lines.push('');
  lines.push(`**覆盖**：${server.scope}`);
  lines.push('');
  lines.push('## 调用要点');
  lines.push('');
  for (const g of server.guidance || []) lines.push(`- ${g}`);
  lines.push('');

  const entries = Object.entries(server.tools);
  const shared = sharedSingleParam(entries);

  lines.push('## 工具目录');
  lines.push('');
  lines.push('| 工具 | 用途 | 入参 |');
  lines.push('| --- | --- | --- |');
  for (const [name, t] of entries) {
    const props = t.inputSchema?.properties || {};
    const req = new Set(t.inputSchema?.required || []);
    const sig = Object.keys(props).map((k) => (req.has(k) ? `**${k}**` : k)).join(', ') || '（无）';
    lines.push(`| [\`${name}\`](#${name}) | ${esc(firstLine(t.description))} | ${sig} |`);
  }
  lines.push('');
  lines.push('_加粗为必填。_');
  lines.push('');

  if (shared) {
    lines.push('## 公共入参');
    lines.push('');
    lines.push(`下列 ${shared.names.size} 个工具**只接受一个必填参数 \`${shared.key}\`**（${shared.prop.type}）：${esc(shared.prop.description || shared.prop.title)}`);
    lines.push('');
    lines.push(`\`${[...shared.names].join('`、`')}\``);
    lines.push('');
    lines.push('这些工具的小节里不再重复参数表。');
    lines.push('');
  }

  lines.push('## 工具契约');
  lines.push('');
  for (const [name, t] of entries) {
    lines.push(`### \`${name}\``);
    lines.push('');
    lines.push(formatDescription(t.description));
    lines.push('');
    if (t.knownIssue) {
      lines.push(`> ⚠ **已知问题**：${t.knownIssue}`);
      lines.push('');
    }
    if (shared && shared.names.has(name)) {
      lines.push(`入参：\`${shared.key}\`（必填，见[公共入参](#公共入参)）。`);
    } else {
      lines.push(paramTable(t));
    }
    lines.push('');
    if (t.sample) {
      lines.push(`样例：\`${JSON.stringify(t.sample)}\``);
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
export function generateReferences(registry) {
  const written = [];
  for (const [alias, server] of Object.entries(registry.servers)) {
    const path = join(REF_DIR, `${alias}.md`);
    const md = renderServer(alias, server);
    writeFileSync(path, md);
    written.push({ server: alias, tools: server.toolCount, chars: md.length, path: `references/${alias}.md` });
  }
  return written;
}
// #endregion 契约文档

const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  const args = process.argv.slice(2);
  const docsOnly = args.includes('--docs-only');
  const only = args.find((a) => !a.startsWith('--')) || null;

  let registry;
  if (docsOnly) {
    registry = readRegistry();
    console.log('只重新生成文档，未联网。\n');
  } else {
    const built = await buildRegistry({ only });
    registry = built.registry;
    for (const r of built.report) {
      const bits = [];
      if (r.added.length) bits.push(`新增 ${r.added.join(',')}`);
      if (r.removed.length) bits.push(`删除 ${r.removed.join(',')}`);
      if (r.changed.length) bits.push(`入参变化 ${r.changed.map((c) => c.name).join(',')}`);
      if (r.orphanSamples.length) bits.push(`注解已失效 ${r.orphanSamples.join(',')}`);
      console.log(`${r.alias.padEnd(9)} ${String(r.count).padStart(3)} 工具${bits.length ? '  ⚠ ' + bits.join('；') : ''}`);
    }
    const tools = Object.values(registry.servers).reduce((n, s) => n + s.toolCount, 0);
    const params = Object.values(registry.servers).reduce((n, s) => n + s.paramCount, 0);
    console.log(`\n注册表：${tools} 工具 / ${params} 参数 → scripts/registry.json\n`);
  }

  for (const w of generateReferences(registry)) {
    console.log(`${w.server.padEnd(9)} ${String(w.tools).padStart(3)} 工具  ${String(w.chars).padStart(6)} 字  → ${w.path}`);
  }
  console.log('\n改完记得跑：node tests/run-offline-tests.mjs（会点名因 schema 变动而失效的样例）');
}
