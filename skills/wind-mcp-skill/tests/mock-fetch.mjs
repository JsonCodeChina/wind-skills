// Preload module: replaces globalThis.fetch so the REAL cli.mjs runs end-to-end
// against a simulated Wind MCP server. cli.mjs calls bare `fetch(...)`, which
// resolves to globalThis.fetch — so overriding it here intercepts every call
// without touching cli.mjs. Scenario is chosen via WIND_MOCK_SCENARIO.
//
// Each scenario reproduces a different shape the backend can use to deliver the
// three new structured error codes, so we prove cli.mjs maps ALL shapes -> code.

const SCENARIO = process.env.WIND_MOCK_SCENARIO || '';

// How each scenario delivers its payload for the tools/call response.
// shape: where in the JSON-RPC envelope the error lands (mirrors cli.mjs parsing).
const SCENARIOS = {
  // ── the three NEW MCP-server structured codes ──
  invalid_param_name: {
    shape: 'inner_error',          // result.content[0].text = JSON {error:{code,message}}
    code: 'INVALID_PARAM_NAME',
    message: "字段 'windcod' 不存在，正确字段名为 'windcode'；'indexes' 为必填但缺失",
  },
  invalid_param_value: {
    shape: 'jsonrpc_error',        // payload.error.message
    code: 'INVALID_PARAM_VALUE',
    message: "begin_date 值 '2026-04-01' 不合法，必须为 yyyyMMdd（如 20260401）",
  },
  temporarily_unavailable: {
    shape: 'mcp_tool_error',       // result.content[0].text = JSON {mcp_tool_error_code,mcp_tool_error_msg}
    code: 'TEMPORARILY_UNAVAILABLE',
    message: '后端服务偶发抖动，请稍后重试（temporarily_unavailable）',
  },
  // ── cross-check: same code via a different envelope shape ──
  invalid_param_name_via_iserror: {
    shape: 'iserror',              // result.isError + content[0].text raw
    code: 'INVALID_PARAM_NAME',
    message: 'invalid_param_name: 缺少必填字段 windcode',
  },
  // ── happy path sanity (proves success branch + no false error) ──
  success: { shape: 'success' },
  // ── undefined / never-defined backend codes ──
  undefined_clean: {
    shape: 'inner_error',
    code: 'GALACTIC_FLUX_2026',
    message: '后端冒出一个文档里从未定义过的全新错误码（纯新词，无已知关键词）',
  },
  undefined_keyworded: {
    shape: 'jsonrpc_error',
    code: 'GALACTIC_FLUX_2026',
    message: '参数无效：后端某个新子系统报错',
  },
};

function sse(obj) {
  // Frame as a Server-Sent-Events body to also exercise cli.mjs parseSSE().
  return `event: message\ndata: ${JSON.stringify(obj)}\n\n`;
}

function makeResponse(bodyText, { ok = true, status = 200, statusText = 'OK' } = {}) {
  return {
    ok,
    status,
    statusText,
    text: async () => bodyText,
  };
}

function toolCallPayload(scn) {
  const id = Date.now();
  switch (scn.shape) {
    case 'jsonrpc_error':
      return { jsonrpc: '2.0', id, error: { code: -32000, message: `${scn.code}: ${scn.message}` } };
    case 'iserror':
      return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: scn.message }] } };
    case 'inner_error':
      return {
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: JSON.stringify({ error: { code: scn.code, message: scn.message } }) }] },
      };
    case 'mcp_tool_error':
      return {
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: JSON.stringify({ mcp_tool_error_code: 503, mcp_tool_error_msg: scn.message }) }] },
      };
    case 'success':
      return {
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: JSON.stringify({ 中文简称: '贵州茅台', 最新成交价: 1688.0 }) }] },
      };
    default:
      throw new Error(`unknown shape: ${scn.shape}`);
  }
}

globalThis.fetch = async (url, opts = {}) => {
  let method = '';
  try { method = JSON.parse(opts.body || '{}').method; } catch {}

  // initialize handshake always succeeds
  if (method === 'initialize') {
    return makeResponse(sse({
      jsonrpc: '2.0', id: 1,
      result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'mock-wind', version: '0' } },
    }));
  }

  const scn = SCENARIOS[SCENARIO];
  if (!scn) throw new Error(`WIND_MOCK_SCENARIO not set or unknown: '${SCENARIO}'`);
  return makeResponse(sse(toolCallPayload(scn)));
};
