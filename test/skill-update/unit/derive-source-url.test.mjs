// P0 单测: deriveSourceUrl — 从 lock entry 推导探活 URL
// 覆盖测试矩阵 C2(Gitee SSH bug 回归) / C3(v1 GitHub) / C4(v1 Gitee)
// 核心: 修复项目级 + Gitee 的 SSH URL 拼接 bug (见 lock-schema-test-results.md §3.5)
import { test } from 'node:test';
import assert from 'node:assert/strict';

const MOD = new URL('../../../skills/wind-mcp-skill/scripts/update-check.mjs', import.meta.url);
const load = () => import(MOD);

test('deriveSourceUrl 已实现', async () => {
  const { deriveSourceUrl } = await load();
  assert.equal(typeof deriveSourceUrl, 'function', '应 export deriveSourceUrl');
});

test('v3: entry.sourceUrl 直接用 (global GitHub)', async () => {
  const { deriveSourceUrl } = await load();
  const url = deriveSourceUrl({
    sourceUrl: 'https://github.com/Wind-Information-Co-Ltd/wind-skills.git',
    sourceType: 'github',
  });
  assert.equal(url, 'https://github.com/Wind-Information-Co-Ltd/wind-skills.git');
});

test('v3: entry.sourceUrl 是 Gitee SSH 也直接用', async () => {
  const { deriveSourceUrl } = await load();
  const url = deriveSourceUrl({
    sourceUrl: 'git@gitee.com:wind_info/wind-skills.git',
    sourceType: 'git',
  });
  assert.equal(url, 'git@gitee.com:wind_info/wind-skills.git',
    'sourceUrl 存在时直接用, 不做任何拼接');
});

test('🔴 C2 核心: v1 缺 sourceUrl + source 是 Gitee SSH → 直通,不误拼', async () => {
  const { deriveSourceUrl } = await load();
  // 这是 bug 现场: 项目级 Gitee lock 没有 sourceUrl, source 是完整 SSH URL
  const url = deriveSourceUrl({
    source: 'git@gitee.com:wind_info/wind-skills.git',
    sourceType: 'git',
  });
  assert.equal(url, 'git@gitee.com:wind_info/wind-skills.git',
    'SSH URL 必须直通; 旧 bug 会误拼成 https://gitee.com/git@gitee.com:.../.git');
  assert.ok(!url.includes('https://gitee.com/git@'), '绝不能出现 https://gitee.com/git@ 这种垃圾拼接');
});

test('v1: source 短形式 + sourceType github → 拼 https', async () => {
  const { deriveSourceUrl } = await load();
  const url = deriveSourceUrl({
    source: 'Wind-Information-Co-Ltd/wind-skills',
    sourceType: 'github',
  });
  assert.equal(url, 'https://github.com/Wind-Information-Co-Ltd/wind-skills.git');
});

test('v1: source 是完整 https → 直接用', async () => {
  const { deriveSourceUrl } = await load();
  const url = deriveSourceUrl({
    source: 'https://github.com/x/y.git',
    sourceType: 'github',
  });
  assert.equal(url, 'https://github.com/x/y.git');
});

test('缺 source 和 sourceUrl → null', async () => {
  const { deriveSourceUrl } = await load();
  assert.equal(deriveSourceUrl({ sourceType: 'github' }), null);
  assert.equal(deriveSourceUrl({}), null);
});
