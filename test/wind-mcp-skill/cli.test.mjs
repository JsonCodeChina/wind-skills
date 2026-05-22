// wind-mcp-skill cli.mjs 黑盒测试
// 适配新契约:
//   - 成功 (exit 0): stdout 纯数据(无 envelope)
//   - 失败 (exit !=0): stdout = { ok:false, error:{code, agent_action}, notices }

import { describe, it, afterEach } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, '..', '..', 'skills', 'wind-mcp-skill');
const CLI = join(SKILL_DIR, 'scripts', 'cli.mjs');
const MANIFEST_PATH = join(SKILL_DIR, 'references', 'tool-manifest.json');
const CACHE_DIR = join(homedir(), '.cache', 'wind-aifinmarket');
const CACHE_FILE = join(CACHE_DIR, 'update-state.json');

// 跑 cli。返回 { exitCode, stdout, stderr }。stdout 不在这里 JSON.parse, 由测试自行处理。
function runRaw(args, { env: extraEnv = {} } = {}) {
  let stdout = '', stderr = '', exitCode = 0;
  try {
    stdout = execFileSync('node', [CLI, ...args], {
      cwd: SKILL_DIR, encoding: 'utf8', timeout: 15_000,
      env: { ...process.env, ...extraEnv },
    });
  } catch (err) {
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    exitCode = err.status ?? 1;
  }
  return { exitCode, stdout, stderr };
}

// 成功路径: 期望 exit 0; 调用方自行解析 stdout。
function runOk(args, opts = {}) {
  const r = runRaw(args, opts);
  assert.equal(r.exitCode, 0, `expected exit 0, got ${r.exitCode}, stdout: ${r.stdout.slice(0, 200)}`);
  return r.stdout;
}

// 失败路径: 期望 exit !=0; stdout 必须是合法 envelope。
function runFail(args, expectedCode, opts = {}) {
  const r = runRaw(args, opts);
  assert.notEqual(r.exitCode, 0, `expected non-zero exit, got 0`);
  const json = JSON.parse(r.stdout);
  assert.equal(json.ok, false, 'envelope.ok must be false');
  assert.ok(json.error, 'envelope.error must exist');
  assert.equal(json.error.code, expectedCode, `expected code=${expectedCode}, got ${json.error.code}`);
  assert.ok(typeof json.error.agent_action === 'string' && json.error.agent_action.length > 0,
    'error.agent_action must be non-empty string');
  // 新契约: envelope 只有 ok/error 两个顶层字段, 不再有 notices
  return json;
}

// ───── help 路径(纯文本透传) ─────

describe('help command', () => {
  it('无参 → stdout 是 USAGE 纯文本, exit 0, 无 JSON 包裹', () => {
    const out = runOk([]);
    assert.ok(out.includes('wind-mcp-skill'), `USAGE 应含 skill 名`);
    assert.ok(out.includes('用法'), `USAGE 应有用法说明`);
    // 关键: 不能是 envelope (即不是 { ok:..., ...} 的 JSON)
    assert.ok(!out.trim().startsWith('{'), `help 输出不应是 JSON envelope`);
  });
});

// ───── 失败路径 envelope 结构 ─────

describe('failure envelope shape', () => {
  it('未知命令 → USAGE_ERROR', () => {
    const json = runFail(['foobar'], 'USAGE_ERROR');
    // agent_action 应嵌入 USAGE 文本以便 agent 重构命令
    assert.ok(json.error.agent_action.includes('USAGE'),
      `agent_action 应含 USAGE: ${json.error.agent_action.slice(0, 200)}`);
  });

  it('call 缺参数 → USAGE_ERROR', () => {
    runFail(['call'], 'USAGE_ERROR');
  });

  it('call 参数 JSON 非法 → INVALID_PARAMS_JSON', () => {
    runFail(['call', 'stock_data', 'get_stock_basicinfo', 'not-json'], 'INVALID_PARAMS_JSON');
  });

  it('未知 server_type → UNKNOWN_SERVER_TYPE', () => {
    runFail(['call', 'not_a_server', 'foo', '{}'], 'UNKNOWN_SERVER_TYPE');
  });

  it('未知 tool_name → UNKNOWN_TOOL_NAME', () => {
    runFail(['call', 'stock_data', 'nonexistent_tool', '{}'], 'UNKNOWN_TOOL_NAME');
  });

  it('setup-key 缺 scope → USAGE_ERROR', () => {
    runFail(['setup-key', 'fake_key_for_test'], 'USAGE_ERROR');
  });

  it('setup-key 非法 scope → UNKNOWN_SCOPE', () => {
    runFail(['setup-key', 'fake_key', '--scope', 'invalid_scope'], 'UNKNOWN_SCOPE');
  });

  it('envelope 只有 ok/error 两个顶层字段(notices 已移除)', () => {
    const r = runRaw(['foobar']);
    const json = JSON.parse(r.stdout);
    const keys = Object.keys(json).sort();
    assert.deepEqual(keys, ['error', 'ok'],
      `envelope 顶层字段应只有 ok/error, 实际: ${keys.join(',')}`);
  });

  it('error 只有 code/agent_action 两个字段', () => {
    const r = runRaw(['foobar']);
    const json = JSON.parse(r.stdout);
    const keys = Object.keys(json.error).sort();
    assert.deepEqual(keys, ['agent_action', 'code'],
      `error 应只有 code/agent_action, 实际: ${keys.join(',')}`);
  });

  it('agent_action 含原始 detail (用 [...] 标记)', () => {
    const json = runFail(['call', 'stock_data', 'nonexistent_tool', '{}'], 'UNKNOWN_TOOL_NAME');
    assert.ok(json.error.agent_action.startsWith('['),
      `agent_action 应以 [diagnostic] 开头, 实际: ${json.error.agent_action.slice(0, 80)}`);
    assert.ok(json.error.agent_action.includes('nonexistent_tool'),
      `agent_action 应嵌入 backend detail (tool 名)`);
  });
});

// ───── tool-manifest.json 一致性 ─────

describe('tool-manifest.json', () => {
  it('manifest 合法 + 涵盖所有 server_type', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const servers = ['stock_data', 'global_stock_data', 'fund_data', 'index_data',
      'bond_data', 'financial_docs', 'economic_data', 'analytics_data'];
    for (const s of servers) {
      assert.ok(Array.isArray(manifest[s]) && manifest[s].length > 0,
        `manifest 中 ${s} 应是非空数组`);
    }
  });
});

// ───── error-codes.json 一致性 ─────

describe('error-codes.json', () => {
  it('schema_version + codes 完备', () => {
    const ec = JSON.parse(readFileSync(join(SKILL_DIR, 'references', 'error-codes.json'), 'utf8'));
    assert.ok(ec.schema_version, 'schema_version 必须存在');
    assert.ok(ec.codes && typeof ec.codes === 'object', 'codes 必须是对象');
    // 每条 code 必须有 agent_action 描述
    for (const [code, desc] of Object.entries(ec.codes)) {
      assert.ok(typeof desc === 'string' && desc.length > 0,
        `${code} 必须有非空 agent_action 描述`);
    }
  });

  it('CLI 实际产生的 code 都在字典里', () => {
    const ec = JSON.parse(readFileSync(join(SKILL_DIR, 'references', 'error-codes.json'), 'utf8'));
    // 抽样几个最常见错误,确认它们的 code 都在字典里
    const samples = [
      [['foobar'], 'USAGE_ERROR'],
      [['call', 'bad_server', 'foo', '{}'], 'UNKNOWN_SERVER_TYPE'],
      [['call', 'stock_data', 'bad_tool', '{}'], 'UNKNOWN_TOOL_NAME'],
      [['call', 'stock_data', 'get_stock_basicinfo', 'not-json'], 'INVALID_PARAMS_JSON'],
      [['setup-key', 'fake', '--scope', 'wrong'], 'UNKNOWN_SCOPE'],
    ];
    for (const [args, code] of samples) {
      const r = runRaw(args);
      const json = JSON.parse(r.stdout);
      assert.equal(json.error.code, code);
      assert.ok(ec.codes[code], `code ${code} 应在 error-codes.json 中`);
    }
  });
});

// ───── envelope 不携带任何 notice 类信号 (验证 notices 字段已彻底移除) ─────

describe('envelope has no notices field', () => {
  afterEach(() => {
    try { if (existsSync(CACHE_FILE)) unlinkSync(CACHE_FILE); } catch {}
  });

  it('任何 cache 状态下,失败 envelope 都不含 notices 字段', () => {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    // 试遍 update_available / transient_error / unknown 三种状态
    const states = [
      { status: 'transient_error', reason: 'network', ttlMs: 300000 },
      { status: 'unknown', reason: 'lock_missing', ttlMs: 86400000 },
      { status: 'update_available',
        outdated: [{ name: 'wind-mcp-skill', current: 'a', latest: 'b',
          sourceUrl: 'https://github.com/x/y.git' }],
        ttlMs: 43200000 },
    ];
    for (const s of states) {
      writeFileSync(CACHE_FILE, JSON.stringify({
        schemaVersion: 3,
        skills: { 'wind-mcp-skill': { ...s, lockSignature: 'fake', lastCheck: new Date().toISOString() } },
      }, null, 2));
      const json = runFail(['foobar'], 'USAGE_ERROR');
      assert.equal(json.notices, undefined,
        `cache=${s.status} 时 envelope 不应有 notices 字段: ${JSON.stringify(json)}`);
    }
  });
});
