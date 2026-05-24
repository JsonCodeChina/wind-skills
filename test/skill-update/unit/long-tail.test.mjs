// P1 单测: shouldShowLongTail — 内网长期断网的兜底提示 (测试矩阵 C14)
// 条件: 14d 无成功探活 + 累计 ≥10 次调用 + 整个生命周期未提示过
import { test } from 'node:test';
import assert from 'node:assert/strict';

const MOD = new URL('../../../skills/wind-mcp-skill/scripts/update-check.mjs', import.meta.url);
const load = () => import(MOD);

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

test('shouldShowLongTail 已实现', async () => {
  const { shouldShowLongTail } = await load();
  assert.equal(typeof shouldShowLongTail, 'function');
});

test('C14: 14d 无成功 + callCount>=10 + 未提示 → true', async () => {
  const { shouldShowLongTail } = await load();
  const cache = {
    meta: { callCount: 10, fallbackShownAt: null },
    entries: { 'wind-mcp-skill|/a': { lastSuccessAt: iso(now - 15 * DAY) } },
  };
  assert.equal(shouldShowLongTail(cache, now), true);
});

test('callCount < 10 → false (调用次数不够)', async () => {
  const { shouldShowLongTail } = await load();
  const cache = {
    meta: { callCount: 5 },
    entries: { 'wind-mcp-skill|/a': { lastSuccessAt: iso(now - 15 * DAY) } },
  };
  assert.equal(shouldShowLongTail(cache, now), false);
});

test('已提示过 (fallbackShownAt) → false (生命周期一次)', async () => {
  const { shouldShowLongTail } = await load();
  const cache = {
    meta: { callCount: 50, fallbackShownAt: iso(now - DAY) },
    entries: { 'wind-mcp-skill|/a': { lastSuccessAt: iso(now - 30 * DAY) } },
  };
  assert.equal(shouldShowLongTail(cache, now), false);
});

test('最近成功过 (lastSuccessAt 在 14d 内) → false', async () => {
  const { shouldShowLongTail } = await load();
  const cache = {
    meta: { callCount: 20 },
    entries: { 'wind-mcp-skill|/a': { lastSuccessAt: iso(now - 2 * DAY) } },
  };
  assert.equal(shouldShowLongTail(cache, now), false);
});

test('从未成功过 (无 lastSuccessAt) → false (不误报)', async () => {
  const { shouldShowLongTail } = await load();
  const cache = { meta: { callCount: 20 }, entries: { 'wind-mcp-skill|/a': {} } };
  assert.equal(shouldShowLongTail(cache, now), false);
});
