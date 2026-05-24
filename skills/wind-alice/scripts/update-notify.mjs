// wind-alice 更新通知层 — 由 request.js 在每次有效提问时调用。
// spawnUpdateCheck():       提问开始时 detached spawn update-check.mjs 异步探活刷 cache, 不阻塞主流程。
// maybePrintUpdateNotice(): 结果输出后读 cache → 有 pending 则 stderr 通知一次 + 标记已通知; 失败完全静默。
// 行为与 cache schema 对齐 wind-mcp-skill/scripts/cli.mjs 的 triggerUpdateCheck + maybeNotifyUpdate (v1 共享 schema)。
// 原则: 不识别会话 / 远端变了才通知 / 失败静默 / lastNotifiedSha 去重。

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  readCache, computePending, collectEntries, cacheKeyFor,
  deriveSourceUrl, buildUpgradeCommand, mergeCacheEntry,
  shouldShowLongTail, setFallbackShown,
  CACHE_FILE, SKILL_NAME,
} from './update-check.mjs';

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const UPDATE_CHECK_PATH = join(SKILL_DIR, 'scripts', 'update-check.mjs');

// 提问开始调: detached spawn 子进程异步探活刷 cache, 不阻塞主流程
export function spawnUpdateCheck() {
  try {
    if (!existsSync(UPDATE_CHECK_PATH)) return;
    const child = spawn('node', [UPDATE_CHECK_PATH], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {}
}

// 结果输出后调: 读 cache → 有 pending 则 stderr 一次 + 标记已通知 (lastNotifiedSha=latestSha → 同版本不再重复)
// 失败完全静默 (探活失败由子进程吞掉, 这里只读 cache 结果)
export function maybePrintUpdateNotice() {
  try {
    const cache = readCache(CACHE_FILE);
    const entries = collectEntries();
    const now = Date.now();
    const cmds = new Set();
    const toMark = [];
    for (const { entry, lockPath, scope } of entries) {
      const key = cacheKeyFor(SKILL_NAME, lockPath);
      const state = cache.entries[key];
      if (!computePending(state)) continue;
      cmds.add(buildUpgradeCommand({ sourceUrl: deriveSourceUrl(entry) }, scope));
      toMark.push({ key, latestSha: state.latestSha });
    }
    if (cmds.size > 0) {
      const lines = [`[notice] ${SKILL_NAME} 有新版本可用`, '升级命令:'];
      for (const c of cmds) lines.push(`  ${c}`);
      lines.push('本次调用结果不受影响。');
      process.stderr.write(lines.join('\n') + '\n');
      for (const m of toMark) mergeCacheEntry(CACHE_FILE, m.key, { lastNotifiedSha: m.latestSha });
      return;
    }
    // 无 pending: 长尾 fallback (内网长期断 GitHub 时, 整个生命周期最多提示一次)
    if (shouldShowLongTail(cache, now)) {
      process.stderr.write(`[notice] ${SKILL_NAME} 更新检测连续 14 天无成功, 可能是网络问题, 不影响本次调用。\n`);
      setFallbackShown(CACHE_FILE, now);
    }
  } catch {}
}
