#!/usr/bin/env node
// update-check.mjs — wind-skills 升级感知探活脚本(lock-driven)
// 由 cli.mjs 异步 spawn,读 lock 条目 → 用 sourceUrl 解析 host → 调对应 tree API 比对 hash
// 设计: 完全静默,绝不阻塞主流程,任何异常吞掉
//
// 状态: up_to_date / update_available / unknown / transient_error
// - lock-driven: 真值来自 lock 条目,不再硬编码 owner 白名单
// - schema 兼容: v1 project lock(computedHash) + v3 global lock(skillFolderHash)
// - host 判定: 仅靠 sourceUrl 字符串解析(sourceType 'git' 不能区分 GitHub/Gitee)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_NAME = 'wind-mcp-skill';

const CACHE_DIR = join(homedir(), '.cache', 'wind-aimarket');
const CACHE_FILE = join(CACHE_DIR, 'update-state.json');

const TTL_UP_TO_DATE_MS    = 60 * 60 * 1000;        // 60 min
const TTL_AVAILABLE_MS     = 12 * 60 * 60 * 1000;   // 12 h
const TTL_UNKNOWN_MS       = 24 * 60 * 60 * 1000;   // 24 h(配置类问题,下次大概率仍 unknown)
const TTL_TRANSIENT_MS     =  6 * 60 * 60 * 1000;   //  6 h(网络抖,下次重试)

const NETWORK_TIMEOUT_MS = 5_000;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// ───── cache ─────

function readCache() {
  if (!existsSync(CACHE_FILE)) return null;
  try { return JSON.parse(readFileSync(CACHE_FILE, 'utf8')); } catch { return null; }
}

function writeCache(state) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    const prev = readCache();
    const merged = { ...state, lastCheck: new Date().toISOString() };
    if (prev?.snoozedUntil) merged.snoozedUntil = prev.snoozedUntil;
    if (typeof prev?.snoozeLevel === 'number') merged.snoozeLevel = prev.snoozeLevel;
    writeFileSync(CACHE_FILE, JSON.stringify(merged, null, 2));
  } catch {}
}

function isCacheFresh(cache) {
  if (!cache?.lastCheck || !cache?.ttlMs) return false;
  return Date.now() - new Date(cache.lastCheck).getTime() < cache.ttlMs;
}

// ───── lock 文件探测(4 路径策略)─────

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

  // ① 全局 lock(XDG 优先,fallback HOME)
  const xdg = process.env.XDG_STATE_HOME;
  candidates.add(xdg
    ? join(xdg, 'skills', '.skill-lock.json')
    : join(homedir(), '.agents', '.skill-lock.json'));

  // ② 从 SCRIPT_DIR 向上找项目 lock
  for (const dir of walkUp(SCRIPT_DIR)) {
    candidates.add(join(dir, 'skills-lock.json'));
  }

  // ③ 从 process.cwd() 向上找项目 lock
  for (const dir of walkUp(process.cwd())) {
    candidates.add(join(dir, 'skills-lock.json'));
  }

  return [...candidates].filter(p => existsSync(p));
}

// 从所有 lock 里收集名字 = SKILL_NAME 的条目(可能多份 lock 都装了)
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

// ───── 条目解析 ─────

function getHash(entry) {
  return entry.skillFolderHash || entry.computedHash || null;
}

// 解析 sourceUrl → { host, owner, repo } 或 null
// 支持: https://github.com/<o>/<r>(.git)?  /  https://gitee.com/<o>/<r>(.git)?
//      git@github.com:<o>/<r>(.git)?       /  git@gitee.com:<o>/<r>(.git)?
function parseSourceUrl(sourceUrl) {
  if (typeof sourceUrl !== 'string' || !sourceUrl) return null;

  let host = null;
  if (sourceUrl.includes('github.com')) host = 'github';
  else if (sourceUrl.includes('gitee.com')) host = 'gitee';
  else return null;

  // 抓 owner/repo
  const m = sourceUrl.match(/(?:github\.com|gitee\.com)[:/]([^/]+)\/([^/]+?)(?:\.git)?(?:$|[/?#])/);
  if (!m) return null;
  return { host, owner: m[1], repo: m[2] };
}

// ───── tree API ─────

async function fetchJson(url) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'wind-mcp-skill-update-check' },
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
    // Gitee 默认分支可能是 main 或 master
    for (const branch of ['main', 'master']) {
      const r = await fetchJson(`https://gitee.com/api/v5/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
      if (r.data && Array.isArray(r.data.tree)) return { tree: r.data };
    }
    return { error: 'shape' };
  }
  return { error: 'unsupported_host' };
}

// 把 skillPath 标准化成目录路径,在 tree 里找同名 tree 节点 SHA
// "skills/X/SKILL.md" / "skills/X/" / "skills/X" 都归一到 "skills/X"
// "SKILL.md" / "" → 根级 skill,返回整棵 tree 的 SHA
function findSkillSha(tree, skillPath) {
  const dir = String(skillPath || '')
    .replace(/\\/g, '/')
    .replace(/\/?SKILL\.md$/i, '')
    .replace(/\/+$/, '');
  if (!dir) return tree.sha || null;
  return tree.tree.find(t => t.type === 'tree' && t.path === dir)?.sha || null;
}

// ───── 终态写入 ─────

function shortHash(h) {
  return typeof h === 'string' ? h.slice(0, 7) : '';
}

// ───── 主逻辑 ─────

async function main() {
  // Step 1. cache 还新鲜 → 不做事
  const cache = readCache();
  if (isCacheFresh(cache)) return;

  // Step 2. 读 lock 找本 skill
  const entries = collectEntries();
  if (entries.length === 0) {
    writeCache({ status: 'unknown', reason: 'lock_missing', ttlMs: TTL_UNKNOWN_MS });
    return;
  }

  // Step 3. 对每条 entry 独立判定(理论上只有一条,但 project + global 同装时可能多条)
  const outdated = [];
  const unknownDetails = [];
  let transientError = null;

  for (const { entry, lockPath } of entries) {
    const hash = getHash(entry);
    if (!hash) {
      unknownDetails.push({ reason: 'no_hash_field', lockPath });
      continue;
    }

    const sourceUrl = entry.sourceUrl;
    if (!sourceUrl) {
      // 典型: project lock + Gitee 装(只有 source 短形式 + sourceType='git')
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
      // 网络层失败 → 标 transient,但继续看其他 entry(也许另一份 lock 能成)
      transientError = { reason: treeResult.error, sourceUrl, host: parsed.host };
      continue;
    }

    const remoteSha = findSkillSha(treeResult.tree, entry.skillPath);
    if (!remoteSha) {
      unknownDetails.push({ reason: 'path_missing', lockPath, sourceUrl, skillPath: entry.skillPath });
      continue;
    }

    if (remoteSha === hash) {
      // 这条 entry 已是最新 — 但下方还会聚合判定,这里先不直接 return
      continue;
    }

    outdated.push({
      name: SKILL_NAME,
      current: shortHash(hash),
      latest: shortHash(remoteSha),
      sourceUrl,
      host: parsed.host,
    });
  }

  // Step 4. 聚合: outdated 有就 available,否则若全 unknown 走 unknown,否则 up_to_date
  if (outdated.length > 0) {
    writeCache({
      status: 'update_available',
      outdated,
      ttlMs: TTL_AVAILABLE_MS,
    });
    return;
  }

  // 没有 outdated。若任何一条成功比对(没进 unknown 也没进 transient)→ up_to_date
  const totalHandled = unknownDetails.length + (transientError ? 1 : 0);
  if (totalHandled < entries.length) {
    writeCache({ status: 'up_to_date', ttlMs: TTL_UP_TO_DATE_MS });
    return;
  }

  // 全军覆没 — 优先报 transient(下次还能重试),否则 unknown
  if (transientError) {
    writeCache({
      status: 'transient_error',
      reason: transientError.reason,
      sourceUrl: transientError.sourceUrl,
      ttlMs: TTL_TRANSIENT_MS,
    });
    return;
  }

  writeCache({
    status: 'unknown',
    reason: unknownDetails[0].reason,
    details: unknownDetails,
    ttlMs: TTL_UNKNOWN_MS,
  });
}

main().catch(() => {});
