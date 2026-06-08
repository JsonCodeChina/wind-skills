const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const runtimeConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'mcp_config.json'), 'utf-8'));
const accessToken = runtimeConfig.auth_token;

const MCP_ROOT_URL = "https://api-mcp.51ifind.com:8643/ds-mcp-servers";
const SERVER_ENDPOINTS = {
    stock: `${MCP_ROOT_URL}/hexin-ifind-ds-stock-mcp`,
    fund: `${MCP_ROOT_URL}/hexin-ifind-ds-fund-mcp`,
    edb: `${MCP_ROOT_URL}/hexin-ifind-ds-edb-mcp`,
    news: `${MCP_ROOT_URL}/hexin-ifind-ds-news-mcp`,
};

const sessionIds = {};
const requestCounters = {};

function nextRequestId(serverType) {
    requestCounters[serverType] = (requestCounters[serverType] || 0) + 1;
    return requestCounters[serverType];
}

function buildHeaders(serverType = null) {
    const requestHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': accessToken,
    };
    if (serverType && sessionIds[serverType]) {
        requestHeaders['Mcp-Session-Id'] = sessionIds[serverType];
    }
    return requestHeaders;
}

function postJson(serverType, rpcMessage, timeoutSeconds = 60) {
    return new Promise((resolve, reject) => {
        const endpoint = new URL(SERVER_ENDPOINTS[serverType]);
        const requestOptions = {
            hostname: endpoint.hostname,
            port: endpoint.port,
            path: endpoint.pathname,
            method: 'POST',
            headers: buildHeaders(serverType),
            timeout: timeoutSeconds * 1000,
            rejectUnauthorized: false,
        };

        const request = (endpoint.protocol === 'https:' ? https : http).request(requestOptions, (response) => {
            let responseText = '';
            response.on('data', chunk => responseText += chunk);
            response.on('end', () => {
                let responseData = null;
                if (responseText.trim()) {
                    try {
                        responseData = JSON.parse(responseText);
                    } catch {
                        responseData = responseText;
                    }
                }
                resolve({ response, data: responseData });
            });
        });

        request.on('error', reject);
        request.on('timeout', () => {
            request.destroy();
            reject(new Error(`Request timeout after ${timeoutSeconds}s`));
        });

        request.write(JSON.stringify(rpcMessage));
        request.end();
    });
}

async function ensureSession(serverType) {
    if (sessionIds[serverType]) {
        return;
    }

    const initializeMessage = {
        jsonrpc: "2.0",
        id: nextRequestId(serverType),
        method: "initialize",
        params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "http-client", version: "1.0.0" },
        },
    };

    const { response } = await postJson(serverType, initializeMessage, 30);

    const sessionId = response.headers['mcp-session-id'] || response.headers.get?.('mcp-session-id');
    if (!sessionId) {
        throw new Error('MCP 初始化完成，但响应中缺少 Mcp-Session-Id');
    }

    sessionIds[serverType] = sessionId;

    const initializedNotice = { jsonrpc: "2.0", method: "notifications/initialized" };
    await postJson(serverType, initializedNotice, 10);
}

async function call(serverType, toolName, params) {
    if (!SERVER_ENDPOINTS[serverType]) {
        throw new Error(`unknown server_type: ${serverType}`);
    }

    await ensureSession(serverType);

    const callMessage = {
        jsonrpc: "2.0",
        id: nextRequestId(serverType),
        method: "tools/call",
        params: {
            name: toolName,
            arguments: params,
        },
    };

    const { response, data } = await postJson(serverType, callMessage);

    if (data && typeof data === 'object' && 'error' in data) {
        return {
            ok: false,
            status_code: response.statusCode,
            error: data.error,
            raw: data,
        };
    }

    if (response.statusCode >= 400) {
        throw new Error(`HTTP Error: ${response.statusCode}`);
    }

    return {
        ok: true,
        status_code: response.statusCode,
        data: data,
    };
}

async function listTools(serverType) {
    if (!SERVER_ENDPOINTS[serverType]) {
        throw new Error(`unknown server_type: ${serverType}`);
    }

    await ensureSession(serverType);

    const listMessage = {
        jsonrpc: "2.0",
        id: nextRequestId(serverType),
        method: "tools/list",
        params: {},
    };

    const { response, data } = await postJson(serverType, listMessage);

    if (data && typeof data === 'object' && 'error' in data) {
        return {
            ok: false,
            status_code: response.statusCode,
            error: data.error,
            raw: data,
        };
    }

    if (response.statusCode >= 400) {
        throw new Error(`HTTP Error: ${response.statusCode}`);
    }

    console.log(JSON.stringify(data, null, 2));

    return {
        ok: true,
        status_code: response.statusCode,
        data: data,
    };
}

async function main() {
    console.log("该文件提供调用函数，请根据 SKILL.md 选择服务、工具及参数后再执行。");
}

module.exports = { call, listTools };

if (require.main === module) {
    main().catch(console.error);
}
