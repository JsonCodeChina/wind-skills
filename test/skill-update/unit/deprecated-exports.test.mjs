// P0 单测: 废弃函数不再 export (修正验证, 测试矩阵 C26)
// 防止重写时漏删旧架构代码 — sentinel / sid / snooze / filterAlreadyUpgraded 必须彻底切干净
// 注: 现在跑此测试会 FAIL (这些函数当前还 export), 这正是 RED → 重写后变 GREEN
import { test } from 'node:test';
import assert from 'node:assert/strict';

const UC = new URL('../../../skills/wind-mcp-skill/scripts/update-check.mjs', import.meta.url);
const CLI = new URL('../../../skills/wind-mcp-skill/scripts/cli.mjs', import.meta.url);

test('update-check.mjs 不再 export sentinel 清理函数', async () => {
  const mod = await import(UC);
  assert.equal(mod.cleanupStaleSentinels, undefined, 'cleanupStaleSentinels 应随 sentinel 系统删除');
});

test('cli.mjs 不再 export sid 系统', async () => {
  const mod = await import(CLI);
  assert.equal(mod.getSessionId, undefined, 'getSessionId 应删除 (不再依赖会话识别)');
});

test('cli.mjs 不再 export sentinel 路径函数', async () => {
  const mod = await import(CLI);
  assert.equal(mod.failureSentinelPath, undefined, 'failureSentinelPath 应删除');
  assert.equal(mod.updateSentinelPath, undefined, 'updateSentinelPath 应删除');
});

test('cli.mjs 不再 export 失败通知 (失败一律静默)', async () => {
  const mod = await import(CLI);
  assert.equal(mod.maybeNotifyFailureOnce, undefined, 'maybeNotifyFailureOnce 应删除, 探活失败完全静默');
});

test('cli.mjs 不再 export filterAlreadyUpgraded (hash 跨空间 bug, 删)', async () => {
  const mod = await import(CLI);
  assert.equal(mod.filterAlreadyUpgraded, undefined, 'filterAlreadyUpgraded 应删除');
});

test('cli.mjs 不再 export collectUpdateFailureMeta (早已废弃)', async () => {
  const mod = await import(CLI);
  assert.equal(mod.collectUpdateFailureMeta, undefined);
});

test('新接口替代品已 export', async () => {
  const cli = await import(CLI);
  assert.equal(typeof cli.maybeNotifyUpdate, 'function', 'maybeNotifyUpdate 取代旧的 maybeNotifyUpdateOnce');
  assert.equal(typeof cli.triggerUpdateCheck, 'function', 'triggerUpdateCheck 取代旧的 spawnUpdateCheck');
});
