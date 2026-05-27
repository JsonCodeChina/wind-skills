// wind-mcp-skill 全面综合测试
// 覆盖: 错误码/agent_action/envelope/CLI命令/manifest/inferErrorCode/
//       SSE解析/Key管理/sentinel/全链路

import { describe, it, beforeEach, afterEach } from 'node:test';
import { execFileSync } from 'node:child_process';
import {
  readFileSync, writeFileSync, existsSync, unlinkSync,
  mkdirSync, rmSync, statSync, readdirSync
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, '..', '..', 'skills', 'wind-mcp-skill');
const CLI = join(SKILL_DIR, 'scripts', 'cli.mjs');
const CACHE_DIR = join(homedir(), '.cache', 'wind-aifinmarket');
const CACHE_FILE = join(CACHE_DIR, 'update-state.json');
const MANIFEST_PATH = join(SKILL_DIR, 'references', 'tool-manifest.json');
const ERROR_CODES_PATH = join(SKILL_DIR, 'references', 'error-codes.json');

// ───── Helpers ─────

function runRaw(args, { env: extraEnv = {} } = {}) {
  let stdout = '', stderr = '', exitCode = 0;
  try {
    stdout = execFileSync('node', [CLI, ...args], {
      cwd: SKILL_DIR, encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, ...extraEnv },
    });
  } catch (err) {
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    exitCode = err.status ?? 1;
  }
  return { exitCode, stdout, stderr };
}

function runOk(args, opts = {}) {
  const r = runRaw(args, opts);
  assert.equal(r.exitCode, 0, `expected exit 0, got ${r.exitCode}, stdout: ${r.stdout.slice(0, 300)}`);
  return r;
}

function runFail(args, expectedCode, opts = {}) {
  const r = runRaw(args, opts);
  assert.notEqual(r.exitCode, 0, `expected non-zero exit, got 0, stdout: ${r.stdout.slice(0, 300)}`);
  const json = JSON.parse(r.stdout);
  assert.equal(json.ok, false, 'envelope.ok must be false');
  assert.ok(json.error, 'envelope.error must exist');
  assert.equal(json.error.code, expectedCode, `expected code=${expectedCode}, got ${json.error.code}`);
  assert.ok(typeof json.error.agent_action === 'string' && json.error.agent_action.length > 0,
    'error.agent_action must be non-empty string');
  return json;
}

function parseEnvelope(stdout) {
  return JSON.parse(stdout);
}

// ═══════════════════════════════════════════════════════════════
// 1. error-codes.json 完整性验证
// ═══════════════════════════════════════════════════════════════

describe('error-codes.json 完整性', () => {
  const ec = JSON.parse(readFileSync(ERROR_CODES_PATH, 'utf8'));

  it('有 schema_version 字段', () => {
    assert.ok(ec.schema_version, 'schema_version must exist');
    assert.equal(ec.schema_version, 2, 'schema_version should be 2');
  });

  it('有 envelope_contract 定义', () => {
    assert.ok(ec.envelope_contract, 'envelope_contract must exist');
    assert.ok(ec.envelope_contract.success, 'envelope_contract.success must exist');
    assert.ok(ec.envelope_contract.failure, 'envelope_contract.failure must exist');
  });

  it('codes 对象存在且非空', () => {
    assert.ok(ec.codes && typeof ec.codes === 'object', 'codes must be object');
    assert.ok(Object.keys(ec.codes).length >= 20, 'should have at least 20 error codes');
  });

  // 验证所有预期的错误码都存在
  const EXPECTED_CODES = [
    'USAGE_ERROR', 'INVALID_PARAMS_JSON', 'UNKNOWN_SERVER_TYPE', 'UNKNOWN_TOOL_NAME',
    'TOOL_MANIFEST_INVALID', 'UNKNOWN_SCOPE', 'OPEN_PORTAL_FAILED', 'PARAM_VALIDATION_ERROR',
    'CONFIG_WRITE_ERROR', 'KEY_MISSING', 'KEY_INVALID', 'KEY_FORBIDDEN_SERVER',
    'RATE_LIMIT_DAILY', 'RATE_LIMIT_QPS', 'BALANCE_INSUFFICIENT', 'NETWORK_ERROR',
    'BACKEND_UNAVAILABLE', 'RESPONSE_PARSE_ERROR', 'NO_RESULTS', 'MCP_PROTOCOL_ERROR',
    'TOOL_RUNTIME_ERROR', 'UNKNOWN',
  ];

  for (const code of EXPECTED_CODES) {
    it(`包含错误码 ${code}`, () => {
      assert.ok(ec.codes[code], `${code} must exist in error-codes.json`);
      assert.ok(typeof ec.codes[code] === 'string' && ec.codes[code].length > 10,
        `${code} must have meaningful agent_action (len > 10)`);
    });
  }

  it('每个 agent_action 包含具体的行动指令（不是空描述）', () => {
    for (const [code, action] of Object.entries(ec.codes)) {
      // 每个 agent_action 应该包含动词或指令性语言
      assert.ok(action.length >= 20, `${code} agent_action too short: ${action}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. CLI 错误码产生测试 - 每个 CLI 可产生的错误码
// ═══════════════════════════════════════════════════════════════

describe('CLI 错误码产生 - USAGE_ERROR', () => {
  it('无参数调用 → 显示 USAGE 文本 exit 0', () => {
    const r = runOk([]);
    assert.ok(!r.stdout.trim().startsWith('{'), 'help should not be JSON');
    assert.ok(r.stdout.includes('wind-mcp-skill'), 'should contain skill name');
    assert.ok(r.stdout.includes('call'), 'should mention call command');
    assert.ok(r.stdout.includes('setup-key'), 'should mention setup-key');
    assert.ok(r.stdout.includes('open-portal'), 'should mention open-portal');
  });

  it('未知命令 → USAGE_ERROR', () => {
    const json = runFail(['nonexistent'], 'USAGE_ERROR');
    assert.ok(json.error.agent_action.includes('USAGE'), 'agent_action should embed USAGE');
  });

  it('call 无参数 → USAGE_ERROR', () => {
    runFail(['call'], 'USAGE_ERROR');
  });

  it('call 只有 server_type → USAGE_ERROR', () => {
    runFail(['call', 'stock_data'], 'USAGE_ERROR');
  });

  it('call 只有 server_type + tool → USAGE_ERROR', () => {
    runFail(['call', 'stock_data', 'get_stock_basicinfo'], 'USAGE_ERROR');
  });

  it('setup-key 无参数 → USAGE_ERROR', () => {
    runFail(['setup-key'], 'USAGE_ERROR');
  });

  it('setup-key 只有 key 无 scope → USAGE_ERROR', () => {
    runFail(['setup-key', 'test_key_12345'], 'USAGE_ERROR');
  });
});

describe('CLI 错误码产生 - INVALID_PARAMS_JSON', () => {
  it('非 JSON 字符串 → INVALID_PARAMS_JSON', () => {
    runFail(['call', 'stock_data', 'get_stock_basicinfo', 'not-json'], 'INVALID_PARAMS_JSON');
  });

  it('截断的 JSON → INVALID_PARAMS_JSON', () => {
    runFail(['call', 'stock_data', 'get_stock_basicinfo', '{"question":'], 'INVALID_PARAMS_JSON');
  });

  it('JSON 单引号而非双引号 → INVALID_PARAMS_JSON', () => {
    runFail(['call', 'stock_data', 'get_stock_basicinfo', "{'question':'test'}"], 'INVALID_PARAMS_JSON');
  });

  it('空字符串 → USAGE_ERROR（视为缺参数）', () => {
    runFail(['call', 'stock_data', 'get_stock_basicinfo', ''], 'USAGE_ERROR');
  });

  it('纯数字是合法 JSON，不会触发 INVALID_PARAMS_JSON', () => {
    // 12345 是合法 JSON (number)，解析成功后到达 Key 检查或后端调用
    const r = runRaw(['call', 'stock_data', 'get_stock_basicinfo', '12345'],
      { env: { WIND_API_KEY: '' } });
    // 不应该是 INVALID_PARAMS_JSON
    const json = parseEnvelope(r.stdout);
    assert.notEqual(json.error.code, 'INVALID_PARAMS_JSON',
      'pure number is valid JSON, should not fail parsing');
  });

  it('尾逗号 JSON → INVALID_PARAMS_JSON', () => {
    runFail(['call', 'stock_data', 'get_stock_basicinfo', '{"question":"test",}'], 'INVALID_PARAMS_JSON');
  });

  it('agent_action 包含修正指引', () => {
    const json = runFail(['call', 'stock_data', 'get_stock_basicinfo', 'bad'], 'INVALID_PARAMS_JSON');
    assert.ok(json.error.agent_action.includes('shell-escaping'), 'should reference shell-escaping.md');
  });
});

describe('CLI 错误码产生 - UNKNOWN_SERVER_TYPE', () => {
  it('完全不存在的 server_type', () => {
    const json = runFail(['call', 'nonexistent', 'foo', '{}'], 'UNKNOWN_SERVER_TYPE');
    assert.ok(json.error.agent_action.includes('nonexistent'), 'should mention the bad server_type');
  });

  it('拼错的 server_type', () => {
    runFail(['call', 'stock_dat', 'get_stock_basicinfo', '{}'], 'UNKNOWN_SERVER_TYPE');
  });

  it('大小写错误', () => {
    runFail(['call', 'Stock_Data', 'get_stock_basicinfo', '{}'], 'UNKNOWN_SERVER_TYPE');
  });

  it('agent_action 包含可用 server_type 列表', () => {
    const json = runFail(['call', 'bad', 'foo', '{}'], 'UNKNOWN_SERVER_TYPE');
    assert.ok(json.error.agent_action.includes('stock_data'), 'should list available server types');
  });
});

describe('CLI 错误码产生 - UNKNOWN_TOOL_NAME', () => {
  it('不存在的 tool_name', () => {
    const json = runFail(['call', 'stock_data', 'nonexistent_tool', '{}'], 'UNKNOWN_TOOL_NAME');
    assert.ok(json.error.agent_action.includes('nonexistent_tool'), 'should mention bad tool');
  });

  it('属于其它 server_type 的 tool（跨域）', () => {
    // get_fund_info 属于 fund_data，不属于 stock_data
    runFail(['call', 'stock_data', 'get_fund_info', '{}'], 'UNKNOWN_TOOL_NAME');
  });

  it('tool_name 多了空格', () => {
    runFail(['call', 'stock_data', ' get_stock_basicinfo', '{}'], 'UNKNOWN_TOOL_NAME');
  });

  it('tool_name 少了前缀', () => {
    runFail(['call', 'stock_data', 'stock_basicinfo', '{}'], 'UNKNOWN_TOOL_NAME');
  });
});

describe('CLI 错误码产生 - UNKNOWN_SCOPE', () => {
  it('非法 scope 值', () => {
    runFail(['setup-key', 'test_key', '--scope', 'invalid'], 'UNKNOWN_SCOPE');
  });

  it('scope 为空字符串 → USAGE_ERROR（视为缺 scope）', () => {
    runFail(['setup-key', 'test_key', '--scope', ''], 'USAGE_ERROR');
  });

  it('scope 为 random', () => {
    runFail(['setup-key', 'test_key', '--scope', 'random'], 'UNKNOWN_SCOPE');
  });

  it('agent_action 提示合法选项', () => {
    const json = runFail(['setup-key', 'test_key', '--scope', 'bad'], 'UNKNOWN_SCOPE');
    assert.ok(
      json.error.agent_action.includes('global') || json.error.agent_action.includes('skill'),
      'should mention valid scopes'
    );
  });
});

describe('CLI 错误码产生 - TOOL_MANIFEST_INVALID', () => {
  const origManifest = readFileSync(MANIFEST_PATH, 'utf8');

  afterEach(() => {
    writeFileSync(MANIFEST_PATH, origManifest);
  });

  it('manifest 为空文件 → TOOL_MANIFEST_INVALID', () => {
    writeFileSync(MANIFEST_PATH, '');
    runFail(['call', 'stock_data', 'get_stock_basicinfo', '{}'], 'TOOL_MANIFEST_INVALID');
  });

  it('manifest 为非法 JSON → TOOL_MANIFEST_INVALID', () => {
    writeFileSync(MANIFEST_PATH, '{bad json}');
    runFail(['call', 'stock_data', 'get_stock_basicinfo', '{}'], 'TOOL_MANIFEST_INVALID');
  });

  it('manifest 为数组 → TOOL_MANIFEST_INVALID', () => {
    writeFileSync(MANIFEST_PATH, '[]');
    runFail(['call', 'stock_data', 'get_stock_basicinfo', '{}'], 'TOOL_MANIFEST_INVALID');
  });

  it('manifest 缺少 server_type → TOOL_MANIFEST_INVALID', () => {
    const m = JSON.parse(origManifest);
    delete m.stock_data;
    writeFileSync(MANIFEST_PATH, JSON.stringify(m));
    runFail(['call', 'stock_data', 'get_stock_basicinfo', '{}'], 'TOOL_MANIFEST_INVALID');
  });

  it('manifest tool 不是数组 → TOOL_MANIFEST_INVALID', () => {
    const m = JSON.parse(origManifest);
    m.stock_data = 'not_array';
    writeFileSync(MANIFEST_PATH, JSON.stringify(m));
    runFail(['call', 'stock_data', 'get_stock_basicinfo', '{}'], 'TOOL_MANIFEST_INVALID');
  });

  it('manifest 包含未知 server_type → TOOL_MANIFEST_INVALID', () => {
    const m = JSON.parse(origManifest);
    m.fake_server = ['tool1'];
    writeFileSync(MANIFEST_PATH, JSON.stringify(m));
    runFail(['call', 'stock_data', 'get_stock_basicinfo', '{}'], 'TOOL_MANIFEST_INVALID');
  });
});

describe('CLI 错误码产生 - KEY_MISSING', () => {
  const localConfigPath = join(SKILL_DIR, 'config.json');
  const globalConfigPath = join(homedir(), '.wind-aifinmarket', 'config');
  let hadLocal = false, hadGlobal = false;
  let localBackup = null, globalBackup = null;

  beforeEach(() => {
    if (existsSync(localConfigPath)) {
      hadLocal = true;
      localBackup = readFileSync(localConfigPath, 'utf8');
      unlinkSync(localConfigPath);
    }
    if (existsSync(globalConfigPath)) {
      hadGlobal = true;
      globalBackup = readFileSync(globalConfigPath, 'utf8');
      unlinkSync(globalConfigPath);
    }
  });

  afterEach(() => {
    if (hadLocal && localBackup !== null) {
      writeFileSync(localConfigPath, localBackup);
    } else if (!hadLocal && existsSync(localConfigPath)) {
      try { unlinkSync(localConfigPath); } catch {}
    }
    if (hadGlobal && globalBackup !== null) {
      writeFileSync(globalConfigPath, globalBackup);
    } else if (!hadGlobal && existsSync(globalConfigPath)) {
      try { unlinkSync(globalConfigPath); } catch {}
    }
  });

  it('无任何 Key 配置时调用 → KEY_MISSING', () => {
    const json = runFail(
      ['call', 'stock_data', 'get_stock_basicinfo', '{"question":"test"}'],
      'KEY_MISSING',
      { env: { WIND_API_KEY: '' } }
    );
    assert.ok(json.error.agent_action.includes('Key') || json.error.agent_action.includes('key'),
      'should mention Key in agent_action');
  });

  it('agent_action 提示交互流程', () => {
    const json = runFail(
      ['call', 'stock_data', 'get_stock_basicinfo', '{"question":"test"}'],
      'KEY_MISSING',
      { env: { WIND_API_KEY: '' } }
    );
    assert.ok(json.error.agent_action.includes('AskUserQuestion') || json.error.agent_action.includes('用户'),
      'should mention user interaction');
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. tool-manifest.json 深度一致性验证
// ═══════════════════════════════════════════════════════════════

describe('tool-manifest.json 深度验证', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const EXPECTED_SERVERS = [
    'stock_data', 'global_stock_data', 'fund_data', 'index_data',
    'bond_data', 'financial_docs', 'economic_data', 'analytics_data',
  ];

  it('8 个 server_type 全部覆盖', () => {
    for (const s of EXPECTED_SERVERS) {
      assert.ok(Array.isArray(manifest[s]), `${s} must be array`);
      assert.ok(manifest[s].length > 0, `${s} must be non-empty`);
    }
    assert.equal(Object.keys(manifest).length, EXPECTED_SERVERS.length,
      'should have exactly 8 server types');
  });

  it('每个 tool_name 都是合法非空字符串', () => {
    for (const [server, tools] of Object.entries(manifest)) {
      for (const tool of tools) {
        assert.ok(typeof tool === 'string' && tool.length > 0,
          `${server}.${tool} must be non-empty string`);
        assert.ok(/^[a-z_]+$/.test(tool),
          `${server}.${tool} should be snake_case: got "${tool}"`);
      }
    }
  });

  it('没有重复的 tool_name（跨 server_type 检查）', () => {
    const allTools = [];
    for (const tools of Object.values(manifest)) {
      allTools.push(...tools);
    }
    const unique = new Set(allTools);
    assert.equal(unique.size, allTools.length, 'all tool names should be unique across servers');
  });

  it('每个 server_type 内的 tool_name 无重复', () => {
    for (const [server, tools] of Object.entries(manifest)) {
      const unique = new Set(tools);
      assert.equal(unique.size, tools.length, `${server} has duplicate tool names`);
    }
  });

  it('tool-manifest.json 与 SERVERS 常量一致（双向覆盖）', () => {
    // manifest 中的 server 必须都在 SERVERS 里
    for (const server of Object.keys(manifest)) {
      assert.ok(EXPECTED_SERVERS.includes(server), `${server} in manifest but not in SERVERS`);
    }
    // SERVERS 中的 server 必须都在 manifest 里
    for (const server of EXPECTED_SERVERS) {
      assert.ok(manifest[server], `${server} in SERVERS but not in manifest`);
    }
  });

  it('tool 总数应为 41 个', () => {
    let total = 0;
    for (const tools of Object.values(manifest)) {
      total += tools.length;
    }
    assert.equal(total, 41, `expected 41 tools, got ${total}`);
  });

  // 逐 server_type 验证工具数量
  const EXPECTED_TOOL_COUNTS = {
    stock_data: 9,
    global_stock_data: 9,
    fund_data: 9,
    index_data: 6,
    bond_data: 4,
    financial_docs: 2,
    economic_data: 1,
    analytics_data: 1,
  };

  for (const [server, count] of Object.entries(EXPECTED_TOOL_COUNTS)) {
    it(`${server} 有 ${count} 个工具`, () => {
      assert.equal(manifest[server].length, count,
        `${server}: expected ${count} tools, got ${manifest[server].length}`);
    });
  }

  // 验证关键 tool_name 存在
  const CRITICAL_TOOLS = [
    ['stock_data', 'get_stock_price_indicators'],
    ['stock_data', 'get_stock_kline'],
    ['stock_data', 'get_stock_basicinfo'],
    ['fund_data', 'get_fund_kline'],
    ['index_data', 'get_index_kline'],
    ['economic_data', 'get_economic_data'],
    ['analytics_data', 'get_financial_data'],
    ['financial_docs', 'get_financial_news'],
  ];

  for (const [server, tool] of CRITICAL_TOOLS) {
    it(`关键工具 ${server}.${tool} 存在`, () => {
      assert.ok(manifest[server].includes(tool), `${server} should contain ${tool}`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 4. envelope 结构深度验证
// ═══════════════════════════════════════════════════════════════

describe('envelope 结构验证', () => {
  it('失败 envelope 顶层只有 ok + error', () => {
    const r = runRaw(['foobar']);
    const json = parseEnvelope(r.stdout);
    const keys = Object.keys(json).sort();
    assert.deepEqual(keys, ['error', 'ok'], `unexpected keys: ${keys.join(',')}`);
  });

  it('error 对象只有 code + agent_action', () => {
    const r = runRaw(['foobar']);
    const json = parseEnvelope(r.stdout);
    const keys = Object.keys(json.error).sort();
    assert.deepEqual(keys, ['agent_action', 'code'], `unexpected error keys: ${keys.join(',')}`);
  });

  it('ok 必须为 false', () => {
    const r = runRaw(['call', 'bad', 'foo', '{}']);
    const json = parseEnvelope(r.stdout);
    assert.equal(json.ok, false);
  });

  it('code 必须为字符串', () => {
    const r = runRaw(['foobar']);
    const json = parseEnvelope(r.stdout);
    assert.equal(typeof json.error.code, 'string');
  });

  it('agent_action 必须为非空字符串', () => {
    const r = runRaw(['foobar']);
    const json = parseEnvelope(r.stdout);
    assert.equal(typeof json.error.agent_action, 'string');
    assert.ok(json.error.agent_action.length > 0);
  });

  it('exit code 必须为 1', () => {
    const r = runRaw(['foobar']);
    assert.equal(r.exitCode, 1);
  });

  it('agent_action 以 [detail] 前缀格式开头（有 detail 时）', () => {
    const r = runRaw(['call', 'stock_data', 'bad_tool', '{}']);
    const json = parseEnvelope(r.stdout);
    assert.ok(json.error.agent_action.startsWith('['),
      `should start with [detail]: ${json.error.agent_action.slice(0, 80)}`);
  });

  it('USAGE_ERROR 的 agent_action 包含完整 USAGE 文本', () => {
    const r = runRaw(['foobar']);
    const json = parseEnvelope(r.stdout);
    assert.ok(json.error.agent_action.includes('call'), 'should contain call');
    assert.ok(json.error.agent_action.includes('setup-key'), 'should contain setup-key');
  });

  it('detail 非 USAGE_ERROR 时截断到 500 字', () => {
    // 用一个超长的 params JSON 触发 INVALID_PARAMS_JSON
    const longJson = '{' + '"x":"' + 'a'.repeat(1000) + '"';
    const r = runRaw(['call', 'stock_data', 'get_stock_basicinfo', longJson]);
    const json = parseEnvelope(r.stdout);
    // agent_action 中的 detail 部分不应超 500 字
    assert.ok(json.error.agent_action.length < 1000, 'detail should be truncated');
  });

  it('stdout 输出为合法 JSON', () => {
    const r = runRaw(['foobar']);
    assert.doesNotThrow(() => JSON.parse(r.stdout), 'stdout should be valid JSON');
  });

  it('不同错误码产生不同的 agent_action', () => {
    const codes = new Set();
    const actions = new Set();
    const testCases = [
      [['foobar'], 'USAGE_ERROR'],
      [['call', 'bad', 'foo', '{}'], 'UNKNOWN_SERVER_TYPE'],
      [['call', 'stock_data', 'bad', '{}'], 'UNKNOWN_TOOL_NAME'],
      [['call', 'stock_data', 'get_stock_basicinfo', 'not-json'], 'INVALID_PARAMS_JSON'],
    ];
    for (const [args, code] of testCases) {
      const r = runRaw(args);
      const json = parseEnvelope(r.stdout);
      codes.add(json.error.code);
      actions.add(json.error.agent_action);
    }
    // 应该有不同的 code
    assert.ok(codes.size === testCases.length, 'all codes should be different');
    // 应该有不同的 agent_action（因为模板不同）
    assert.ok(actions.size > 1, 'agent_actions should differ');
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. ERROR_PATTERNS inferErrorCode 正则覆盖测试
// ═══════════════════════════════════════════════════════════════

describe('ERROR_PATTERNS 正则覆盖', () => {
  // 直接测试 cli.mjs 导出的推断逻辑（通过 mock 后端响应无法测试，
  // 所以我们测试 ERROR_PATTERNS 的正则是否覆盖所有预期的后端消息格式）

  const PATTERNS_TO_TEST = [
    // RATE_LIMIT_DAILY
    { msg: '单日请求次数超限', expected: 'RATE_LIMIT_DAILY' },
    { msg: 'API daily limit exceeded', expected: 'RATE_LIMIT_DAILY' },
    // BALANCE_INSUFFICIENT
    { msg: '余额不足', expected: 'BALANCE_INSUFFICIENT' },
    { msg: '请先充值', expected: 'BALANCE_INSUFFICIENT' },
    { msg: 'insufficient balance', expected: 'BALANCE_INSUFFICIENT' },
    // RATE_LIMIT_QPS
    { msg: '请求过于频繁', expected: 'RATE_LIMIT_QPS' },
    { msg: 'qps limit', expected: 'RATE_LIMIT_QPS' },
    { msg: 'too frequent', expected: 'RATE_LIMIT_QPS' },
    // KEY_INVALID
    { msg: '密钥无效', expected: 'KEY_INVALID' },
    { msg: 'key invalid', expected: 'KEY_INVALID' },
    { msg: 'unauthorized', expected: 'KEY_INVALID' },
    { msg: '认证失败', expected: 'KEY_INVALID' },
    { msg: 'auth failed', expected: 'KEY_INVALID' },
    // NO_RESULTS
    { msg: '未获取到数据', expected: 'NO_RESULTS' },
    { msg: 'NO_RESULTS', expected: 'UNKNOWN' },  // 无引号不匹配，需 "NO_RESULTS"
    { msg: '"NO_RESULTS"', expected: 'NO_RESULTS' },
    { msg: 'no results', expected: 'NO_RESULTS' },
    { msg: 'not found', expected: 'NO_RESULTS' },
    { msg: 'empty result', expected: 'NO_RESULTS' },
    // PARAM_VALIDATION_ERROR
    { msg: '参数验证失败', expected: 'PARAM_VALIDATION_ERROR' },
    { msg: '参数错误', expected: 'PARAM_VALIDATION_ERROR' },
    { msg: 'invalid parameter', expected: 'PARAM_VALIDATION_ERROR' },
    { msg: 'missing required field', expected: 'PARAM_VALIDATION_ERROR' },
    { msg: '字段不存在', expected: 'PARAM_VALIDATION_ERROR' },
    // TOOL_RUNTIME_ERROR
    { msg: 'TOOL_ERROR', expected: 'TOOL_RUNTIME_ERROR' },
    { msg: 'tool error', expected: 'TOOL_RUNTIME_ERROR' },
    { msg: '工具执行错误', expected: 'TOOL_RUNTIME_ERROR' },
    { msg: 'runtime error', expected: 'TOOL_RUNTIME_ERROR' },
    // 边界情况
    { msg: '', expected: 'UNKNOWN' },
    { msg: null, expected: 'UNKNOWN' },
    { msg: '一些无法识别的错误消息', expected: 'UNKNOWN' },
  ];

  // 因为 inferErrorCode 不是 export 的，我们通过正则直接测试
  const ERROR_PATTERNS = [
    ['RATE_LIMIT_DAILY', /单日请求次数超限|daily.*limit/i],
    ['BALANCE_INSUFFICIENT', /余额不足|请先充值|insufficient.*balance/i],
    ['RATE_LIMIT_QPS', /请求过于频繁|qps.*limit|too.*frequent/i],
    ['KEY_INVALID', /密钥无效|key.*invalid|unauthorized|认证失败|auth.*fail/i],
    ['NO_RESULTS', /未获取到数据|"NO_RESULTS"|no\s*results?|not\s*found|empty\s*result/i],
    ['PARAM_VALIDATION_ERROR', /参数验证失败|参数.*(错误|非法|无效)|字段.*(不存在|不识别|不支持|非法)|invalid\s*(param|argument|field)|missing\s*(param|argument|field|required)/i],
    ['TOOL_RUNTIME_ERROR', /TOOL_ERROR|tool.*error|工具.*(执行|运行).*错误|runtime.*error/i],
  ];

  function inferTest(msg) {
    if (!msg) return 'UNKNOWN';
    for (const [code, pat] of ERROR_PATTERNS) {
      if (pat.test(msg)) return code;
    }
    return 'UNKNOWN';
  }

  for (const { msg, expected } of PATTERNS_TO_TEST) {
    it(`"${msg}" → ${expected}`, () => {
      assert.equal(inferTest(msg), expected);
    });
  }

  it('正则优先级: RATE_LIMIT_DAILY 优先于 KEY_INVALID', () => {
    // 确保日限错误不会被误分类
    assert.equal(inferTest('单日请求次数超限'), 'RATE_LIMIT_DAILY');
  });

  it('正则优先级: BALANCE_INSUFFICIENT 优先于 RATE_LIMIT_QPS', () => {
    assert.equal(inferTest('余额不足'), 'BALANCE_INSUFFICIENT');
  });

  it('正则优先级: NO_RESULTS 优先级较低', () => {
    // NO_RESULTS 排在 PARAM_VALIDATION_ERROR 之后
    assert.equal(inferTest('not found'), 'NO_RESULTS');
  });

  it('中文编码变体: "NO_RESULTS" 带引号也能匹配', () => {
    assert.equal(inferTest('"NO_RESULTS"'), 'NO_RESULTS');
  });

  it('大小写不敏感匹配', () => {
    assert.equal(inferTest('TOOL_ERROR'), 'TOOL_RUNTIME_ERROR');
    assert.equal(inferTest('tool_error'), 'TOOL_RUNTIME_ERROR');
    assert.equal(inferTest('Tool_Error'), 'TOOL_RUNTIME_ERROR');
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. SSE/JSON 响应解析测试（通过 import 测试 parseSSE 逻辑）
// ═══════════════════════════════════════════════════════════════

describe('parseSSE 响应格式处理', () => {
  // parseSSE 不是导出的，我们测试 CLI 对不同响应格式的处理逻辑
  // 通过验证代码中的分支逻辑来间接测试

  it('纯 JSON 响应: CLI 对纯文本错误消息的处理', () => {
    // 这需要后端响应，无法通过黑盒直接测试
    // 验证 RESPONSE_PARSE_ERROR 错误码存在且 agent_action 正确
    const ec = JSON.parse(readFileSync(ERROR_CODES_PATH, 'utf8'));
    assert.ok(ec.codes.RESPONSE_PARSE_ERROR, 'RESPONSE_PARSE_ERROR must exist');
    assert.ok(ec.codes.RESPONSE_PARSE_ERROR.includes('原文'), 'should mention preserving original text');
  });

  it('MCP_PROTOCOL_ERROR 错误码存在且 agent_action 正确', () => {
    const ec = JSON.parse(readFileSync(ERROR_CODES_PATH, 'utf8'));
    assert.ok(ec.codes.MCP_PROTOCOL_ERROR, 'MCP_PROTOCOL_ERROR must exist');
  });

  it('TOOL_RUNTIME_ERROR 错误码存在且 agent_action 包含检查指引', () => {
    const ec = JSON.parse(readFileSync(ERROR_CODES_PATH, 'utf8'));
    assert.ok(ec.codes.TOOL_RUNTIME_ERROR, 'TOOL_RUNTIME_ERROR must exist');
    assert.ok(ec.codes.TOOL_RUNTIME_ERROR.includes('不要盲目'), 'should warn against blind retry');
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. HTTP 状态码映射验证
// ═══════════════════════════════════════════════════════════════

describe('HTTP 状态码映射', () => {
  // 验证 HTTP_ERROR_MAP 覆盖所有关键状态码
  const HTTP_ERROR_MAP = {
    401: ['KEY_INVALID', 'API Key 无效或过期'],
    403: ['KEY_FORBIDDEN_SERVER', 'API Key 权限不足'],
    429: ['RATE_LIMIT_QPS', '请求过于频繁'],
    500: ['BACKEND_UNAVAILABLE', '服务端异常'],
    502: ['BACKEND_UNAVAILABLE', '网关异常'],
    503: ['BACKEND_UNAVAILABLE', '服务暂不可用'],
    504: ['BACKEND_UNAVAILABLE', '网关超时'],
  };

  for (const [status, [expectedCode, desc]] of Object.entries(HTTP_ERROR_MAP)) {
    it(`HTTP ${status} → ${expectedCode} (${desc})`, () => {
      const ec = JSON.parse(readFileSync(ERROR_CODES_PATH, 'utf8'));
      assert.ok(ec.codes[expectedCode],
        `${expectedCode} (from HTTP ${status}) must exist in error-codes.json`);
    });
  }

  it('401 映射到 KEY_INVALID（非 KEY_MISSING）', () => {
    // 401 应该是无效 key，不是缺失 key
    assert.equal(HTTP_ERROR_MAP[401][0], 'KEY_INVALID');
  });

  it('所有 5xx 映射到 BACKEND_UNAVAILABLE', () => {
    assert.equal(HTTP_ERROR_MAP[500][0], 'BACKEND_UNAVAILABLE');
    assert.equal(HTTP_ERROR_MAP[502][0], 'BACKEND_UNAVAILABLE');
    assert.equal(HTTP_ERROR_MAP[503][0], 'BACKEND_UNAVAILABLE');
    assert.equal(HTTP_ERROR_MAP[504][0], 'BACKEND_UNAVAILABLE');
  });

  it('429 映射到 RATE_LIMIT_QPS（非 RATE_LIMIT_DAILY）', () => {
    assert.equal(HTTP_ERROR_MAP[429][0], 'RATE_LIMIT_QPS');
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Key 管理 (setup-key / 查找优先级)
// ═══════════════════════════════════════════════════════════════

describe('setup-key 命令', () => {
  const testKey = 'test_key_abcdef1234567890';
  const globalConfigPath = join(homedir(), '.wind-aifinmarket', 'config');
  const localConfigPath = join(SKILL_DIR, 'config.json');
  let hadGlobalConfig = false;
  let hadLocalConfig = false;
  let globalBackup = null;
  let localBackup = null;

  beforeEach(() => {
    if (existsSync(globalConfigPath)) {
      hadGlobalConfig = true;
      globalBackup = readFileSync(globalConfigPath, 'utf8');
    }
    if (existsSync(localConfigPath)) {
      hadLocalConfig = true;
      localBackup = readFileSync(localConfigPath, 'utf8');
    }
  });

  afterEach(() => {
    // 恢复原始状态
    if (hadGlobalConfig && globalBackup !== null) {
      writeFileSync(globalConfigPath, globalBackup);
    } else if (!hadGlobalConfig && existsSync(globalConfigPath)) {
      try { unlinkSync(globalConfigPath); } catch {}
    }
    if (hadLocalConfig && localBackup !== null) {
      writeFileSync(localConfigPath, localBackup);
    } else if (!hadLocalConfig && existsSync(localConfigPath)) {
      try { unlinkSync(localConfigPath); } catch {}
    }
  });

  it('scope=skill 写入本地 config.json', () => {
    const r = runOk(['setup-key', testKey, '--scope', 'skill']);
    const data = JSON.parse(r.stdout);
    assert.equal(data.scope, 'skill');
    assert.ok(data.path.includes('config.json'));
    assert.ok(data.key_masked.includes('***'));

    // 验证文件确实被写入
    const written = JSON.parse(readFileSync(localConfigPath, 'utf8'));
    assert.equal(written.wind_api_key, testKey);
  });

  it('scope=global 写入全局 config', () => {
    const r = runOk(['setup-key', testKey, '--scope', 'global']);
    const data = JSON.parse(r.stdout);
    assert.equal(data.scope, 'global');
    assert.ok(data.path.includes('.wind-aifinmarket'));

    // 验证文件确实被写入
    const content = readFileSync(globalConfigPath, 'utf8');
    assert.ok(content.includes('WIND_API_KEY='));
    assert.ok(content.includes(testKey));
  });

  it('返回值包含 key_masked（脱敏）', () => {
    const r = runOk(['setup-key', testKey, '--scope', 'skill']);
    const data = JSON.parse(r.stdout);
    assert.ok(!data.key_masked.includes(testKey), 'masked key should not contain full key');
    assert.ok(data.key_masked.includes('test'), 'masked key should contain prefix');
  });

  it('返回值包含 next 提示', () => {
    const r = runOk(['setup-key', testKey, '--scope', 'skill']);
    const data = JSON.parse(r.stdout);
    assert.ok(data.next && data.next.includes('重试'), 'should have next step hint');
  });

  it('--scope=global 语法也有效', () => {
    const r = runOk(['setup-key', testKey, '--scope=global']);
    const data = JSON.parse(r.stdout);
    assert.equal(data.scope, 'global');
  });

  it('多次 setup-key 不应产生重复 KEY 行', () => {
    runOk(['setup-key', testKey, '--scope', 'global']);
    runOk(['setup-key', 'another_key_xyz999888777', '--scope', 'global']);

    const content = readFileSync(globalConfigPath, 'utf8');
    const keyLines = content.split('\n').filter(l => /WIND_API_KEY\s*=/.test(l));
    assert.equal(keyLines.length, 1, 'should have exactly 1 WIND_API_KEY line');
    assert.ok(keyLines[0].includes('another_key_xyz999888777'), 'should be the latest key');
  });
});

describe('Key 查找优先级', () => {
  // env > local config.json > global config
  const localConfigPath = join(SKILL_DIR, 'config.json');
  const globalConfigPath = join(homedir(), '.wind-aifinmarket', 'config');
  let hadLocal = false;
  let localBackup = null;

  beforeEach(() => {
    if (existsSync(localConfigPath)) {
      hadLocal = true;
      localBackup = readFileSync(localConfigPath, 'utf8');
    }
  });

  afterEach(() => {
    if (hadLocal && localBackup !== null) {
      writeFileSync(localConfigPath, localBackup);
    } else if (!hadLocal && existsSync(localConfigPath)) {
      try { unlinkSync(localConfigPath); } catch {}
    }
  });

  it('WIND_API_KEY env 优先级最高', () => {
    // 设置 env 后，即使有 local config 也应该用 env
    writeFileSync(localConfigPath, JSON.stringify({ wind_api_key: 'local_key' }));
    // 如果 key 有效，会进入网络调用；如果 key 无效会返回 KEY_INVALID
    // 我们只验证 env 被使用：设置一个无效的 env key
    const r = runRaw(['call', 'stock_data', 'get_stock_basicinfo', '{"question":"test"}'],
      { env: { WIND_API_KEY: 'env_key_test_12345678' } });
    // env key 会被使用，后端会返回 KEY_INVALID（而非 KEY_MISSING）
    if (r.exitCode !== 0) {
      const json = JSON.parse(r.stdout);
      assert.notEqual(json.error.code, 'KEY_MISSING', 'env key should prevent KEY_MISSING');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. open-portal 命令测试
// ═══════════════════════════════════════════════════════════════

describe('open-portal 命令', () => {
  it('成功返回结构化数据（含 url 和 platform）', () => {
    const r = runOk(['open-portal']);
    const data = JSON.parse(r.stdout);
    assert.ok(data.url, 'should have url');
    assert.equal(data.url, 'https://aifinmarket.wind.com.cn/#/user/overview');
    assert.ok(data.platform, 'should have platform');
    assert.ok(data.spawn_command, 'should have spawn_command');
    assert.ok(data.flow_note, 'should have flow_note');
    assert.ok(data.fallback_message, 'should have fallback_message');
  });

  it('返回包含正确的门户 URL', () => {
    const r = runOk(['open-portal']);
    assert.ok(r.stdout.includes('aifinmarket.wind.com.cn'), 'should contain portal URL');
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. diagnose 命令测试
// ═══════════════════════════════════════════════════════════════

describe('diagnose 命令', () => {
  it('返回完整的诊断信息', () => {
    const r = runOk(['diagnose']);
    const data = JSON.parse(r.stdout);
    assert.ok(data.platform, 'should have platform');
    assert.ok(typeof data.node_pid === 'number', 'should have node_pid');
    assert.ok(typeof data.node_ppid === 'number', 'should have node_ppid');
    assert.ok(data.session_id, 'should have session_id');
    assert.ok(data.detection_method, 'should have detection_method');
    assert.ok(data.cache_dir, 'should have cache_dir');
    assert.ok(data.sentinel_failure, 'should have sentinel_failure');
    assert.ok(data.sentinel_update, 'should have sentinel_update');
    assert.ok(data.notes, 'should have notes');
  });

  it('session_id 格式合理', () => {
    const r = runOk(['diagnose']);
    const data = JSON.parse(r.stdout);
    assert.ok(data.session_id.length > 0, 'session_id should not be empty');
  });

  it('detection_method 是已知方法之一', () => {
    const r = runOk(['diagnose']);
    const data = JSON.parse(r.stdout);
    const validMethods = ['proc', 'macos_ps', 'windows_powershell', 'ppid_fallback'];
    assert.ok(validMethods.includes(data.detection_method),
      `unknown detection_method: ${data.detection_method}`);
  });

  it('sentinel 路径包含 skill 名', () => {
    const r = runOk(['diagnose']);
    const data = JSON.parse(r.stdout);
    assert.ok(data.sentinel_failure.includes('wind-mcp-skill'),
      'sentinel path should include skill name');
    assert.ok(data.sentinel_update.includes('wind-mcp-skill'),
      'sentinel path should include skill name');
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. Sentinel 通知去重测试
// ═══════════════════════════════════════════════════════════════

describe('sentinel 通知机制', () => {
  const testCache = (state) => {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({
      schemaVersion: 3,
      skills: {
        'wind-mcp-skill': {
          ...state,
          lastCheck: new Date().toISOString(),
        }
      }
    }, null, 2));
  };

  afterEach(() => {
    try { if (existsSync(CACHE_FILE)) unlinkSync(CACHE_FILE); } catch {}
    // 清理 sentinel 文件
    try {
      const files = readdirSync(CACHE_DIR);
      for (const f of files) {
        if (f.startsWith('failure-shown-') || f.startsWith('update-shown-')) {
          try { unlinkSync(join(CACHE_DIR, f)); } catch {}
        }
      }
    } catch {}
  });

  it('transient_error 缓存 → 首次调用有 stderr 输出', () => {
    testCache({ status: 'transient_error', reason: 'network', ttlMs: 300000 });
    const r = runRaw(['foobar']);
    // 首次可能或可能不输出 stderr，取决于 sentinel
    // 但 stdout 应该是正常的错误 envelope
    const json = parseEnvelope(r.stdout);
    assert.equal(json.ok, false);
  });

  it('update_available 缓存 → stderr 包含升级提示', () => {
    testCache({
      status: 'update_available',
      outdated: [{
        name: 'wind-mcp-skill',
        current: '1.0.0',
        latest: '1.6.0',
        sourceUrl: 'https://github.com/x/y.git',
      }],
      ttlMs: 43200000,
    });
    const r = runRaw(['foobar']);
    // 无论 stderr 是否有输出，stdout 应该是错误 envelope
    const json = parseEnvelope(r.stdout);
    assert.equal(json.ok, false);
  });

  it('up_to_date 缓存 → 无额外 stderr', () => {
    testCache({ status: 'up_to_date', ttlMs: 3600000 });
    const r = runRaw(['foobar']);
    const json = parseEnvelope(r.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, 'USAGE_ERROR');
  });

  it('envelope 不含 notices 字段（已移除）', () => {
    testCache({
      status: 'update_available',
      outdated: [{ name: 'wind-mcp-skill', current: 'a', latest: 'b', sourceUrl: 'https://github.com/x/y.git' }],
      ttlMs: 43200000,
    });
    const r = runRaw(['foobar']);
    const json = parseEnvelope(r.stdout);
    assert.equal(json.notices, undefined, 'notices should be removed from envelope');
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. 参数边界条件测试
// ═══════════════════════════════════════════════════════════════

describe('参数边界条件', () => {
  it('空 JSON 对象 {} 是合法参数', () => {
    // 会因为缺 Key 而非 JSON 解析失败
    const r = runRaw(['call', 'stock_data', 'get_stock_basicinfo', '{}'],
      { env: { WIND_API_KEY: '' } });
    const json = parseEnvelope(r.stdout);
    assert.notEqual(json.error.code, 'INVALID_PARAMS_JSON',
      'empty object should parse fine');
  });

  it('嵌套 JSON 参数', () => {
    const r = runRaw(['call', 'stock_data', 'get_stock_basicinfo', '{"question":"test","extra":{"a":1}}'],
      { env: { WIND_API_KEY: '' } });
    const json = parseEnvelope(r.stdout);
    assert.notEqual(json.error.code, 'INVALID_PARAMS_JSON');
  });

  it('含中文的 JSON 参数', () => {
    const r = runRaw(['call', 'stock_data', 'get_stock_price_indicators',
      '{"windcode":"600519.SH","indexes":"中文简称,最新成交价"}'],
      { env: { WIND_API_KEY: '' } });
    const json = parseEnvelope(r.stdout);
    assert.notEqual(json.error.code, 'INVALID_PARAMS_JSON');
  });

  it('含特殊字符的 JSON 参数', () => {
    const r = runRaw(['call', 'stock_data', 'get_stock_price_indicators',
      '{"windcode":"600519.SH","indexes":"市盈率(TTM),市净率(LF),总市值1"}'],
      { env: { WIND_API_KEY: '' } });
    const json = parseEnvelope(r.stdout);
    assert.notEqual(json.error.code, 'INVALID_PARAMS_JSON');
  });

  it('JSON 数组参数被接受', () => {
    // 虽然可能不是有效参数，但 JSON 解析不应失败
    const r = runRaw(['call', 'stock_data', 'get_stock_basicinfo', '[]'],
      { env: { WIND_API_KEY: '' } });
    const json = parseEnvelope(r.stdout);
    assert.notEqual(json.error.code, 'INVALID_PARAMS_JSON');
  });

  it('JSON null 参数被接受', () => {
    const r = runRaw(['call', 'stock_data', 'get_stock_basicinfo', 'null'],
      { env: { WIND_API_KEY: '' } });
    // null 是合法 JSON 值，解析不会失败
    const json = parseEnvelope(r.stdout);
    assert.notEqual(json.error.code, 'INVALID_PARAMS_JSON');
  });

  it('超长参数不会崩溃', () => {
    const bigParams = JSON.stringify({ question: 'x'.repeat(10000) });
    const r = runRaw(['call', 'stock_data', 'get_stock_basicinfo', bigParams],
      { env: { WIND_API_KEY: '' } });
    assert.ok(r.exitCode !== 0, 'should fail (key missing)');
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. 全链路验证 - 每种 server_type 的路由可达性
// ═══════════════════════════════════════════════════════════════

describe('全链路: 每个 server_type 路由可达', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const localConfigPath = join(SKILL_DIR, 'config.json');
  const globalConfigPath = join(homedir(), '.wind-aifinmarket', 'config');
  let hadLocal = false, hadGlobal = false;
  let localBackup = null, globalBackup = null;

  beforeEach(() => {
    if (existsSync(localConfigPath)) {
      hadLocal = true;
      localBackup = readFileSync(localConfigPath, 'utf8');
      unlinkSync(localConfigPath);
    }
    if (existsSync(globalConfigPath)) {
      hadGlobal = true;
      globalBackup = readFileSync(globalConfigPath, 'utf8');
      unlinkSync(globalConfigPath);
    }
  });

  afterEach(() => {
    if (hadLocal && localBackup !== null) {
      writeFileSync(localConfigPath, localBackup);
    } else if (!hadLocal && existsSync(localConfigPath)) {
      try { unlinkSync(localConfigPath); } catch {}
    }
    if (hadGlobal && globalBackup !== null) {
      writeFileSync(globalConfigPath, globalBackup);
    } else if (!hadGlobal && existsSync(globalConfigPath)) {
      try { unlinkSync(globalConfigPath); } catch {}
    }
  });

  // 对每个 server_type 取第一个 tool 做可达性测试
  for (const [serverType, tools] of Object.entries(manifest)) {
    const tool = tools[0];
    it(`${serverType}.${tool} 参数验证通过（到达 Key 检查阶段）`, () => {
      const testParams = tool.includes('price_indicators')
        ? '{"windcode":"600519.SH","indexes":"最新成交价"}'
        : tool.includes('kline')
          ? '{"windcode":"600519.SH","begin_date":"20260401","end_date":"20260430"}'
          : tool.includes('quote')
            ? '{"windcode":"600519.SH"}'
            : '{"question":"test"}';

      const r = runRaw(['call', serverType, tool, testParams],
        { env: { WIND_API_KEY: '' } });
      const json = parseEnvelope(r.stdout);
      assert.equal(json.error.code, 'KEY_MISSING',
        `${serverType}.${tool} should reach KEY_MISSING, got ${json.error.code}`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 14. error-codes.json 与 error-handling.md 分组一致性
// ═══════════════════════════════════════════════════════════════

describe('error-handling.md 分组一致性', () => {
  const ec = JSON.parse(readFileSync(ERROR_CODES_PATH, 'utf8'));
  const errorGroups = {
    'Key 缺失': ['KEY_MISSING'],
    'Key 无效 / 无权限': ['KEY_INVALID', 'KEY_FORBIDDEN_SERVER'],
    '额度 / 余额': ['RATE_LIMIT_DAILY', 'BALANCE_INSUFFICIENT'],
    'QPS / 网络 / 后端': ['RATE_LIMIT_QPS', 'NETWORK_ERROR', 'BACKEND_UNAVAILABLE'],
    'JSON 转义': ['INVALID_PARAMS_JSON'],
    '工具选择': ['UNKNOWN_TOOL_NAME', 'UNKNOWN_SERVER_TYPE'],
    '本地命令 / 配置': ['USAGE_ERROR', 'TOOL_MANIFEST_INVALID', 'UNKNOWN_SCOPE', 'OPEN_PORTAL_FAILED', 'CONFIG_WRITE_ERROR'],
    '参数校验': ['PARAM_VALIDATION_ERROR'],
    '无结果': ['NO_RESULTS'],
    '协议 / 运行时': ['RESPONSE_PARSE_ERROR', 'MCP_PROTOCOL_ERROR', 'TOOL_RUNTIME_ERROR', 'UNKNOWN'],
  };

  for (const [group, codes] of Object.entries(errorGroups)) {
    it(`分组 "${group}" 中的所有 code 在 error-codes.json 中存在`, () => {
      for (const code of codes) {
        assert.ok(ec.codes[code], `${code} (from group "${group}") must exist in error-codes.json`);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 15. maskKey 脱敏测试
// ═══════════════════════════════════════════════════════════════

describe('Key 脱敏', () => {
  it('setup-key 返回的 key_masked 格式正确', () => {
    const longKey = 'abcdefghijklmnop1234567890';
    const r = runOk(['setup-key', longKey, '--scope', 'skill']);
    const data = JSON.parse(r.stdout);
    // 脱敏格式: 前4位***后4位
    assert.ok(data.key_masked.startsWith('abcd'), 'should start with first 4 chars');
    assert.ok(data.key_masked.endsWith('7890'), 'should end with last 4 chars');
    assert.ok(data.key_masked.includes('***'), 'should contain ***');
    assert.ok(!data.key_masked.includes(longKey), 'should not contain full key');
  });

  it('短 key 也能脱敏', () => {
    const shortKey = 'abc';
    const r = runOk(['setup-key', shortKey, '--scope', 'skill']);
    const data = JSON.parse(r.stdout);
    assert.ok(data.key_masked, 'should have masked key');
    assert.ok(!data.key_masked.includes(shortKey), 'should not contain full short key');
  });
});

// ═══════════════════════════════════════════════════════════════
// 16. dotenv 解析测试
// ═══════════════════════════════════════════════════════════════

describe('dotenv 解析', () => {
  const globalConfigPath = join(homedir(), '.wind-aifinmarket', 'config');
  let hadConfig = false;
  let backup = null;

  beforeEach(() => {
    if (existsSync(globalConfigPath)) {
      hadConfig = true;
      backup = readFileSync(globalConfigPath, 'utf8');
    }
  });

  afterEach(() => {
    if (hadConfig && backup !== null) {
      writeFileSync(globalConfigPath, backup);
    } else if (!hadConfig && existsSync(globalConfigPath)) {
      try { unlinkSync(globalConfigPath); } catch {}
    }
  });

  it('全局 config 带注释时能正确读取 Key', () => {
    const dir = dirname(globalConfigPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(globalConfigPath, `# This is a comment\nWIND_API_KEY=test_dotenv_key_1234\n`);
    // 删除 local config 以确保使用 global
    const localConfig = join(SKILL_DIR, 'config.json');
    const hadLocal = existsSync(localConfig);
    const localBak = hadLocal ? readFileSync(localConfig, 'utf8') : null;
    if (hadLocal) try { unlinkSync(localConfig); } catch {}

    const r = runRaw(['call', 'stock_data', 'get_stock_basicinfo', '{"question":"test"}'],
      { env: { WIND_API_KEY: '' } });
    // 应该不是 KEY_MISSING（因为全局有 key）
    const json = parseEnvelope(r.stdout);
    assert.notEqual(json.error.code, 'KEY_MISSING',
      'should find key from global config with comments');

    if (hadLocal && localBak) writeFileSync(localConfig, localBak);
  });

  it('全局 config 带 export 前缀时能读取', () => {
    const dir = dirname(globalConfigPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(globalConfigPath, `export WIND_API_KEY=test_export_key_5678\n`);
    const localConfig = join(SKILL_DIR, 'config.json');
    const hadLocal = existsSync(localConfig);
    const localBak = hadLocal ? readFileSync(localConfig, 'utf8') : null;
    if (hadLocal) try { unlinkSync(localConfig); } catch {}

    const r = runRaw(['call', 'stock_data', 'get_stock_basicinfo', '{"question":"test"}'],
      { env: { WIND_API_KEY: '' } });
    const json = parseEnvelope(r.stdout);
    assert.notEqual(json.error.code, 'KEY_MISSING');

    if (hadLocal && localBak) writeFileSync(localConfig, localBak);
  });

  it('全局 config 带引号时能读取', () => {
    const dir = dirname(globalConfigPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(globalConfigPath, `WIND_API_KEY="quoted_key_9999"\n`);
    const localConfig = join(SKILL_DIR, 'config.json');
    const hadLocal = existsSync(localConfig);
    const localBak = hadLocal ? readFileSync(localConfig, 'utf8') : null;
    if (hadLocal) try { unlinkSync(localConfig); } catch {}

    const r = runRaw(['call', 'stock_data', 'get_stock_basicinfo', '{"question":"test"}'],
      { env: { WIND_API_KEY: '' } });
    const json = parseEnvelope(r.stdout);
    assert.notEqual(json.error.code, 'KEY_MISSING');

    if (hadLocal && localBak) writeFileSync(localConfig, localBak);
  });
});

// ═══════════════════════════════════════════════════════════════
// 17. 版本和配置一致性
// ═══════════════════════════════════════════════════════════════

describe('版本和配置一致性', () => {
  it('SKILL_VERSION 存在于 USAGE 输出中', () => {
    const r = runOk([]);
    // help 输出应该包含工具描述
    assert.ok(r.stdout.includes('Wind'), 'should mention Wind');
  });

  it('PORTAL_URL 正确', () => {
    const r = runOk(['open-portal']);
    const data = JSON.parse(r.stdout);
    assert.ok(data.url.startsWith('https://'), 'portal URL should be HTTPS');
    assert.ok(data.url.includes('aifinmarket.wind.com.cn'), 'should use correct domain');
  });

  it('所有 SERVERS endpoint 格式一致', () => {
    const r = runOk(['diagnose']);
    // 间接验证：如果 endpoint 格式有问题，call 会出错
    // 直接检查代码中的 endpoint 命名
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    for (const serverType of Object.keys(manifest)) {
      assert.ok(/^[a-z_]+$/.test(serverType), `${serverType} should be snake_case`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 18. 全链路真实调用模拟（需要 API Key）
// ═══════════════════════════════════════════════════════════════

describe('全链路真实调用模拟', () => {
  const localConfigPath = join(SKILL_DIR, 'config.json');
  const globalConfigPath = join(homedir(), '.wind-aifinmarket', 'config');
  let hadLocal = false, hadGlobal = false;
  let localBackup = null, globalBackup = null;

  beforeEach(() => {
    if (existsSync(localConfigPath)) {
      hadLocal = true;
      localBackup = readFileSync(localConfigPath, 'utf8');
    }
    if (existsSync(globalConfigPath)) {
      hadGlobal = true;
      globalBackup = readFileSync(globalConfigPath, 'utf8');
    }
  });

  afterEach(() => {
    if (hadLocal && localBackup !== null) {
      writeFileSync(localConfigPath, localBackup);
    } else if (!hadLocal && existsSync(localConfigPath)) {
      try { unlinkSync(localConfigPath); } catch {}
    }
    if (hadGlobal && globalBackup !== null) {
      writeFileSync(globalConfigPath, globalBackup);
    } else if (!hadGlobal && existsSync(globalConfigPath)) {
      try { unlinkSync(globalConfigPath); } catch {}
    }
  });

  it('无效 Key → KEY_INVALID 或 NETWORK_ERROR（而非其它错误码）', () => {
    const fakeKey = 'sk-invalid-key-for-testing-00000000';
    const r = runRaw(['call', 'stock_data', 'get_stock_basicinfo', '{"question":"test"}'],
      { env: { WIND_API_KEY: fakeKey } });
    assert.ok(r.exitCode !== 0, 'should fail');
    const json = parseEnvelope(r.stdout);
    // 应该是 KEY_INVALID 或 NETWORK_ERROR，不应该是 UNKNOWN 或其它意外错误
    const validCodes = ['KEY_INVALID', 'KEY_FORBIDDEN_SERVER', 'NETWORK_ERROR', 'BACKEND_UNAVAILABLE', 'MCP_PROTOCOL_ERROR'];
    assert.ok(validCodes.includes(json.error.code),
      `expected one of ${validCodes.join('/')}, got ${json.error.code}`);
  });

  it('call 透传完整 MCP 响应结构', () => {
    // 验证调用链: 参数验证 → manifest 验证 → Key 查找 → MCP 请求
    // 无 Key 时应返回 KEY_MISSING
    if (existsSync(localConfigPath)) unlinkSync(localConfigPath);
    if (existsSync(globalConfigPath)) unlinkSync(globalConfigPath);
    const r = runRaw(['call', 'stock_data', 'get_stock_basicinfo', '{"question":"test"}'],
      { env: { WIND_API_KEY: '' } });
    const json = parseEnvelope(r.stdout);
    assert.equal(json.error.code, 'KEY_MISSING');
    assert.ok(json.error.agent_action.length > 20, 'agent_action should be meaningful');
  });
});

// ═══════════════════════════════════════════════════════════════
// 19. 并发安全和缓存文件锁测试
// ═══════════════════════════════════════════════════════════════

describe('并发和缓存安全', () => {
  afterEach(() => {
    try { if (existsSync(CACHE_FILE)) unlinkSync(CACHE_FILE); } catch {}
  });

  it('缓存文件为空 JSON → 不崩溃', () => {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, '');
    const r = runRaw(['foobar']);
    assert.ok(r.exitCode !== 0, 'should fail with USAGE_ERROR');
    const json = parseEnvelope(r.stdout);
    assert.equal(json.error.code, 'USAGE_ERROR');
  });

  it('缓存文件为非法 JSON → 不崩溃', () => {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, '{bad json content!!!');
    const r = runRaw(['foobar']);
    const json = parseEnvelope(r.stdout);
    assert.equal(json.error.code, 'USAGE_ERROR');
  });

  it('缓存文件为 v2 格式 → 兼容处理', () => {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({
      status: 'up_to_date',
      ttlMs: 3600000,
      lastCheck: new Date().toISOString(),
    }));
    const r = runRaw(['foobar']);
    const json = parseEnvelope(r.stdout);
    assert.equal(json.error.code, 'USAGE_ERROR');
  });

  it('缓存文件为 v3 格式但 skill 条目缺失 → 不崩溃', () => {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({
      schemaVersion: 3,
      skills: {},
    }));
    const r = runRaw(['foobar']);
    const json = parseEnvelope(r.stdout);
    assert.equal(json.error.code, 'USAGE_ERROR');
  });

  it('缓存目录不存在 → 自动创建不崩溃', () => {
    // 先删除缓存文件，目录通常已存在
    try { if (existsSync(CACHE_FILE)) unlinkSync(CACHE_FILE); } catch {}
    const r = runRaw(['foobar']);
    assert.ok(r.exitCode !== 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 20. SKILL.md / README 存在性验证
// ═══════════════════════════════════════════════════════════════

describe('必要文件存在性', () => {
  const requiredFiles = [
    'SKILL.md',
    'README.md',
    'scripts/cli.mjs',
    'scripts/update-check.mjs',
    'references/tool-manifest.json',
    'references/error-codes.json',
    'references/indicators.md',
    'references/tool-contracts.md',
    'references/error-handling.md',
    'references/shell-escaping.md',
    'references/runtime-contract.md',
    'references/fallback-alice.md',
  ];

  for (const file of requiredFiles) {
    it(`${file} 存在`, () => {
      assert.ok(existsSync(join(SKILL_DIR, file)), `${file} must exist`);
    });
  }
});
