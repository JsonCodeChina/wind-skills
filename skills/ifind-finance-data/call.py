import json
from pathlib import Path
import requests

runtime_config = json.loads(Path("mcp_config.json").read_text(encoding="utf-8"))
access_token = runtime_config["auth_token"]

MCP_ROOT_URL = "https://api-mcp.51ifind.com:8643/ds-mcp-servers"
SERVER_ENDPOINTS = {
    "stock": f"{MCP_ROOT_URL}/hexin-ifind-ds-stock-mcp",
    "fund": f"{MCP_ROOT_URL}/hexin-ifind-ds-fund-mcp",
    "edb": f"{MCP_ROOT_URL}/hexin-ifind-ds-edb-mcp",
    "news": f"{MCP_ROOT_URL}/hexin-ifind-ds-news-mcp",
}

_session_ids = {}
_request_counters = {}


def _next_request_id(server_type):
    _request_counters[server_type] = _request_counters.get(server_type, 0) + 1
    return _request_counters[server_type]


def _build_headers(server_type=None):
    request_headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": access_token,
    }
    if server_type in _session_ids:
        request_headers["Mcp-Session-Id"] = _session_ids[server_type]
    return request_headers


def _post_json(server_type, rpc_message, timeout=60):
    response = requests.post(
        SERVER_ENDPOINTS[server_type],
        json=rpc_message,
        headers=_build_headers(server_type),
        verify=False,
        timeout=timeout,
    )
    response_data = None
    if response.text.strip():
        try:
            response_data = response.json()
        except Exception:
            response_data = response.text
    return response, response_data


def _ensure_session(server_type):
    if server_type in _session_ids:
        return

    initialize_message = {
        "jsonrpc": "2.0",
        "id": _next_request_id(server_type),
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "http-client", "version": "1.0.0"},
        },
    }

    response, response_data = _post_json(server_type, initialize_message, timeout=30)
    response.raise_for_status()

    session_id = response.headers.get("Mcp-Session-Id")
    if not session_id:
        raise RuntimeError(f"MCP 初始化响应缺少 Mcp-Session-Id: {response_data}")

    _session_ids[server_type] = session_id

    initialized_notice = {"jsonrpc": "2.0", "method": "notifications/initialized"}
    requests.post(
        SERVER_ENDPOINTS[server_type],
        json=initialized_notice,
        headers=_build_headers(server_type),
        verify=False,
        timeout=10,
    )


def call(server_type, tool_name, params):
    if server_type not in SERVER_ENDPOINTS:
        raise ValueError(f"unknown server_type: {server_type}")

    _ensure_session(server_type)

    call_message = {
        "jsonrpc": "2.0",
        "id": _next_request_id(server_type),
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": params,
        },
    }

    response, response_data = _post_json(server_type, call_message)

    if isinstance(response_data, dict) and "error" in response_data:
        return {
            "ok": False,
            "status_code": response.status_code,
            "error": response_data["error"],
            "raw": response_data,
        }

    response.raise_for_status()
    return {
        "ok": True,
        "status_code": response.status_code,
        "data": response_data,
    }


def list_tools(server_type):
    if server_type not in SERVER_ENDPOINTS:
        raise ValueError(f"unknown server_type: {server_type}")

    _ensure_session(server_type)

    list_message = {
        "jsonrpc": "2.0",
        "id": _next_request_id(server_type),
        "method": "tools/list",
        "params": {},
    }

    response, response_data = _post_json(server_type, list_message)

    if isinstance(response_data, dict) and "error" in response_data:
        return {
            "ok": False,
            "status_code": response.status_code,
            "error": response_data["error"],
            "raw": response_data,
        }

    response.raise_for_status()
    
    print(json.dumps(response_data, indent=2, ensure_ascii=False))
    
    return {
        "ok": True,
        "status_code": response.status_code,
        "data": response_data,
    }


if __name__ == "__main__":
    print("本模块仅提供调用入口，请按照 SKILL.md 传入服务、工具和查询参数。")
