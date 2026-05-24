// P0 单测: computePending + computeStale — 通知与探活的两个核心判定
// 覆盖测试矩阵 C1(首次静默写基线) / C25(同版本去重) / C9-C10(TTL 边界)
import { test } from 'node:test';
import assert from 'node:assert/strict';

const MOD = new URL('../../../skills/wind-mcp-skill/scripts/update-check.mjs', import.meta.url);
const load = () => import(MOD);

const SIX_H = 6 * 60 * 60 * 1000;

test('computePending / computeStale 已实现', async () => {
  const { computePending, computeStale } = await load();
  assert.equal(typeof computePending, 'function', '应 export computePending');
  assert.equal(typeof computeStale, 'function', '应 export computeStale');
});

// ── computePending: 必须"三都有 + 不等"才通知 ──

test('C1: 首次 (无 lastNotifiedSha) → 不 pending (静默写基线)', async () => {
  const { computePending } = await load();
  assert.equal(computePending({ latestSha: 'abc123' }), false,
    '首次见 latestSha 不通知, 只写基线');
});

test('C25: latestSha == lastNotifiedSha → 不 pending (已通知/已升级)', async () => {
  const { computePending } = await load();
  assert.equal(computePending({ latestSha: 'abc', lastNotifiedSha: 'abc' }), false);
});

test('pending: latestSha != lastNotifiedSha → true', async () => {
  const { computePending } = await load();
  assert.equal(computePending({ latestSha: 'def456', lastNotifiedSha: 'abc123' }), true);
});

test('pending: 空 entry → false', async () => {
  const { computePending } = await load();
  assert.equal(computePending({}), false);
  assert.equal(computePending(null), false);
});

// ── computeStale: TTL 6h + signature 变化 ──

test('stale: 无 lastCheckedAt → true (从未探活)', async () => {
  const { computeStale } = await load();
  const now = Date.now();
  assert.equal(computeStale({ lockSignature: 's' }, now, SIX_H, 's'), true);
});

test('C9: lastCheckedAt = now-5h59m → 不 stale (TTL 内)', async () => {
  const { computeStale } = await load();
  const now = Date.now();
  const entry = {
    lastCheckedAt: new Date(now - (5 * 60 + 59) * 60 * 1000).toISOString(),
    lockSignature: 's',
  };
  assert.equal(computeStale(entry, now, SIX_H, 's'), false);
});

test('C10: lastCheckedAt = now-6h01m → stale (TTL 外)', async () => {
  const { computeStale } = await load();
  const now = Date.now();
  const entry = {
    lastCheckedAt: new Date(now - (6 * 60 + 1) * 60 * 1000).toISOString(),
    lockSignature: 's',
  };
  assert.equal(computeStale(entry, now, SIX_H, 's'), true);
});

test('stale: lockSignature 变化 (客户升级后) → true, 无视 TTL', async () => {
  const { computeStale } = await load();
  const now = Date.now();
  const entry = {
    lastCheckedAt: new Date(now - 60_000).toISOString(), // 1min 前, TTL 内
    lockSignature: 'old-sig',
  };
  assert.equal(computeStale(entry, now, SIX_H, 'new-sig'), true,
    'signature 变 = 客户 update 过, 立即重探');
});
