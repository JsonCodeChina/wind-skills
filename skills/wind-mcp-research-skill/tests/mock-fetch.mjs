// 离线测试用的 fetch 替身：按 JSON-RPC method 返回预置响应，并记录每次请求供断言用。
export function installMockFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, headers: options.headers, body });
    const reply = await handler(body, { url, calls });
    if (reply instanceof Response) return reply;
    const { status = 200, text = '', sse = null, json = null } = reply || {};
    let payload = text;
    if (json !== null) payload = JSON.stringify(json);
    if (sse !== null) payload = `event: message\ndata: ${JSON.stringify(sse)}\n\n`;
    return new Response(payload, { status, headers: { 'Content-Type': sse ? 'text/event-stream' : 'application/json' } });
  };
  return {
    calls,
    restore() { globalThis.fetch = original; },
  };
}

// 最常见的场景：initialize 成功，tools/call 返回一段文本。
export function simpleHandler({ toolText = 'ok', isError = false, transport = 'sse', toolsList = null } = {}) {
  return (body) => {
    const wrap = (result) => (transport === 'sse' ? { sse: { jsonrpc: '2.0', id: body.id, result } } : { json: { jsonrpc: '2.0', id: body.id, result } });
    if (body.method === 'initialize') return wrap({ protocolVersion: '2025-03-26', capabilities: {} });
    if (body.method === 'tools/list') return wrap({ tools: toolsList || [] });
    if (body.method === 'tools/call') return wrap({ content: [{ type: 'text', text: toolText }], isError });
    return wrap({});
  };
}
