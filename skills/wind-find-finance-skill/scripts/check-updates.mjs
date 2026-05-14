#!/usr/bin/env node
// check-updates.mjs - wind-skills 升级感知探活脚本(lock-driven)
// 与 wind-mcp-skill/scripts/update-check.mjs 保持同一套逻辑:
// 读 lock 条目 -> 用 sourceUrl 解析 host -> 调对应 tree API 比对 hash。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_NAME = 'wind-find-finance-skill';


const CACHE_DIR = join(homedir(), '.cache', 'wind-aimarket');
const CACHE_FILE = join(CACHE_DIR, 'wind-find-update-state.json');
const BASELINE_FILE = join(CACHE_DIR, 'wind-find-update-baseline.json');
const CACHE_SCHEMA_VERSION = 2;

const TTL_UP_TO_DATE_MS    = 60 * 60 * 1000;
const TTL_AVAILABLE_MS     = 12 * 60 * 60 * 1000;
const TTL_UNKNOWN_MS       = 24 * 60 * 60 * 1000;
const TTL_TRANSIENT_MS     =  6 * 60 * 60 * 1000;

const NETWORK_TIMEOUT_MS = 5_000;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function readCache() {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    const data = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    if (data?.schemaVersion !== CACHE_SCHEMA_VERSION) return null;
    return data;
  } catch { return null; }
}

function writeCache(state) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    const prev = readCache();
    const merged = { ...state, schemaVersion: CACHE_SCHEMA_VERSION, lastCheck: new Date().toISOString() };
    if (prev?.snoozedUntil) merged.snoozedUntil = prev.snoozedUntil;
    if (typeof prev?.snoozeLevel === 'number') merged.snoozeLevel = prev.snoozeLevel;
    writeFileSync(CACHE_FILE, JSON.stringify(merged, null, 2));
  } catch {}
}

function readBaseline() {
  if (!existsSync(BASELINE_FILE)) return {};
  try {
    const data = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
    return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
  } catch { return {}; }
}

function writeBaseline(baseline) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
  } catch {}
}

function isCacheFresh(cache) {
  if (!cache?.lastCheck || !cache?.ttlMs) return false;
  return Date.now() - new Date(cache.lastCheck).getTime() < cache.ttlMs;
}

function walkUp(startDir) {
  const dirs = [];
  let dir = resolve(startDir);
  while (true) {
    dirs.push(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirs;
}

function findLockFiles() {
  const candidates = new Set();

  const xdg = process.env.XDG_STATE_HOME;
  candidates.add(xdg
    ? join(xdg, 'skills', '.skill-lock.json')
    : join(homedir(), '.agents', '.skill-lock.json'));

  for (const dir of walkUp(SCRIPT_DIR)) {
    candidates.add(join(dir, 'skills-lock.json'));
  }

  for (const dir of walkUp(process.cwd())) {
    candidates.add(join(dir, 'skills-lock.json'));
  }

  return [...candidates].filter(p => existsSync(p));
}

function collectEntries() {
  const found = [];
  for (const lockPath of findLockFiles()) {
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
      const entry = lock?.skills?.[SKILL_NAME];
      if (entry) found.push({ entry, lockPath });
    } catch {}
  }
  return found;
}

function parseSourceUrl(sourceUrl) {
  if (typeof sourceUrl !== 'string' || !sourceUrl) return null;

  let host = null;
  if (sourceUrl.includes('github.com')) host = 'github';
  else if (sourceUrl.includes('gitee.com')) host = 'gitee';
  else return null;

  const m = sourceUrl.match(/(?:github\.com|gitee\.com)[:/]([^/]+)\/([^/]+?)(?:\.git)?(?:$|[/?#])/);
  if (!m) return null;
  return { host, owner: m[1], repo: m[2] };
}

async function fetchJson(url) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'wind-find-finance-skill-update-check' },
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    });
    if (!resp.ok) return { error: `http_${resp.status}` };
    return { data: await resp.json() };
  } catch (e) {
    return { error: e?.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}

async function fetchTree({ host, owner, repo }) {
  if (host === 'github') {
    const r = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`);
    if (r.data && Array.isArray(r.data.tree)) return { tree: r.data };
    return { error: r.error || 'shape' };
  }
  if (host === 'gitee') {
    for (const branch of ['main', 'master']) {
      const r = await fetchJson(`https://gitee.com/api/v5/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
      if (r.data && Array.isArray(r.data.tree)) return { tree: r.data };
    }
    return { error: 'shape' };
  }
  return { error: 'unsupported_host' };
}

function findSkillSha(tree, skillPath) {
  const dir = String(skillPath || '')
    .replace(/\\/g, '/')
    .replace(/\/?SKILL\.md$/i, '')
    .replace(/\/+$/, '');
  if (!dir) return tree.sha || null;
  return tree.tree.find(t => t.type === 'tree' && t.path === dir)?.sha || null;
}

function shortHash(h) {
  return typeof h === 'string' ? h.slice(0, 7) : '';
}

function printNotice(state) {
  if (state.snoozedUntil && new Date(state.snoozedUntil) > new Date()) return;

  if (state.status === 'update_available') {
    const lines = ['', `[wind-skills] 检测到 ${state.outdated.length} 个 skill 有新版:`];
    for (const o of state.outdated) {
      const isGitee = typeof o.sourceUrl === 'string' && o.sourceUrl.includes('gitee.com');
      const upgradeCmd = isGitee
        ? `npx skills add ${o.sourceUrl} --skill ${o.name} -g -y  # Gitee 源不支持 update,需重装`
        : `npx skills update ${o.name} -g -y`;
      lines.push(`  • ${o.name.padEnd(34)} ${o.current || '?'} → ${o.latest}`);
      lines.push(`    升级: ${upgradeCmd}`);
    }
    lines.push('');
    process.stderr.write(lines.join('\n') + '\n');
    return;
  }

  if (state.status === 'transient_error') {
    process.stderr.write(`\n[wind-skills] 检查更新失败,可能是网络问题(reason=${state.reason || 'unknown'})\n\n`);
    return;
  }

  if (state.status === 'unknown') {
    process.stderr.write(`\n[wind-skills] 无法确认是否最新(reason=${state.reason || 'unknown'})\n\n`);
  }
}

async function main() {
  const cache = readCache();
  if (isCacheFresh(cache)) {
    printNotice(cache);
    return;
  }

  const entries = collectEntries();
  if (entries.length === 0) {
    const state = { status: 'unknown', reason: 'lock_missing', ttlMs: TTL_UNKNOWN_MS };
    writeCache(state);
    printNotice(state);
    return;
  }

  const oldBaseline = readBaseline();
  const newBaseline = {};
  const outdated = [];
  const unknownDetails = [];
  let transientError = null;

  for (const { entry, lockPath } of entries) {
    const sourceUrl = entry.sourceUrl;
    if (!sourceUrl) {
      unknownDetails.push({ reason: 'no_source_url', lockPath, source: entry.source });
      continue;
    }

    const parsed = parseSourceUrl(sourceUrl);
    if (!parsed) {
      unknownDetails.push({ reason: 'unsupported_host', lockPath, sourceUrl });
      continue;
    }

    const treeResult = await fetchTree(parsed);
    if (treeResult.error) {
      transientError = { reason: treeResult.error, sourceUrl, host: parsed.host };
      continue;
    }

    const remoteSha = findSkillSha(treeResult.tree, entry.skillPath);
    if (!remoteSha) {
      unknownDetails.push({ reason: 'path_missing', lockPath, sourceUrl, skillPath: entry.skillPath });
      continue;
    }

    const lockUpdatedAt = entry.updatedAt || entry.installedAt || null;
    const key = lockPath;
    const existing = oldBaseline[key];

    // 情况 1: 没基准 / 用户重装升级了 → 重置基准,不报
    if (!existing || existing.lockUpdatedAt !== lockUpdatedAt) {
      newBaseline[key] = { lockUpdatedAt, baselineRemoteSha: remoteSha, sourceUrl };
      continue;
    }

    // 情况 2: 基准一致 → up_to_date
    if (existing.baselineRemoteSha === remoteSha) {
      newBaseline[key] = existing;
      continue;
    }

    // 情况 3: 远端真有新 commit → 报(保留旧 baseline,等用户升级才重置)
    newBaseline[key] = existing;
    outdated.push({
      name: SKILL_NAME,
      current: shortHash(existing.baselineRemoteSha),
      latest: shortHash(remoteSha),
      sourceUrl,
      host: parsed.host,
    });
  }

  writeBaseline(newBaseline);

  if (outdated.length > 0) {
    const state = { status: 'update_available', outdated, ttlMs: TTL_AVAILABLE_MS };
    writeCache(state);
    printNotice(state);
    return;
  }

  const totalHandled = unknownDetails.length + (transientError ? 1 : 0);
  if (totalHandled < entries.length) {
    writeCache({ status: 'up_to_date', ttlMs: TTL_UP_TO_DATE_MS });
    return;
  }

  if (transientError) {
    const state = {
      status: 'transient_error',
      reason: transientError.reason,
      sourceUrl: transientError.sourceUrl,
      ttlMs: TTL_TRANSIENT_MS,
    };
    writeCache(state);
    printNotice(state);
    return;
  }

  const state = {
    status: 'unknown',
    reason: unknownDetails[0].reason,
    details: unknownDetails,
    ttlMs: TTL_UNKNOWN_MS,
  };
  writeCache(state);
  printNotice(state);
}

main().catch(() => {});
