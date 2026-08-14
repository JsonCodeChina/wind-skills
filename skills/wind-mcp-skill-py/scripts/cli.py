#!/usr/bin/env python3
# wind-mcp-skill CLI: thin JSON-envelope wrapper around Wind MCP servers
from __future__ import annotations

import copy
import errno as errno_mod
import importlib.util
import json
import os
import re
# import shutil  # 仅自动更新使用；扣子由平台部署/商店更新，已停用
import subprocess
import sys
import time
import traceback
import urllib.error
import urllib.request
# from datetime import datetime, timezone  # 仅被已停用的自动更新使用
from pathlib import Path

SKILL_VERSION = "2.0.2"
DEFAULT_TOOL_CONCURRENCY = 1
MAX_TOOL_CONCURRENCY = 10

# 本地 registry: 工具选择可在任何网络调用前失败
SERVERS = {
    "stock_data": {
        "endpoint": "https://mcp.wind.com.cn/vserver_stock_data/mcp/",
        "label": "Wind 股票（选股筛选 + 档案/财务/股本/事件/技术/风险 + 行情/K线/分钟）",
    },
    "fund_data": {
        "endpoint": "https://mcp.wind.com.cn/vserver_fund_data/mcp/",
        "label": "Wind 基金（基金筛选 + 档案/财务/持仓/业绩/持有人/公司 + 行情/K线/分钟）",
    },
    "index_data": {
        "endpoint": "https://mcp.wind.com.cn/vserver_index_data/mcp/",
        "label": "Wind 指数/板块（档案/基本面/技术 + 行情/K线/分钟）",
    },
    "bond_data": {
        "endpoint": "https://mcp.wind.com.cn/vserver_bond_data/mcp/",
        "label": "Wind 债券（基本档案/发债主体/行情估值/主体财务）",
    },
    "financial_docs": {
        "endpoint": "https://mcp.wind.com.cn/vserver_financial_docs/mcp/",
        "label": "Wind 金融文档 RAG（公告 / 新闻）",
    },
    "economic_data": {
        "endpoint": "https://mcp.wind.com.cn/vserver_economic_data/mcp/",
        "label": "Wind EDB 宏观/行业经济指标",
    },
    "analytics_data": {
        "endpoint": "https://mcp.wind.com.cn/vserver_analytics_data/mcp/",
        "label": "Wind 通用分析数据（NL → Wind 数据）",
    },
}

PORTAL_URL = "https://aifinmarket.wind.com.cn/#/user/overview"

SKILL_DIR = Path(__file__).resolve().parent.parent

# 扣子技能更新走平台部署/商店，不在 CLI 里跑 npx skills update。
# UPDATE_CHECK_PATH = SKILL_DIR / "scripts" / "update_check.py"
TOOL_MANIFEST_PATH = SKILL_DIR / "scripts" / "tool-manifest.json"
CALL_RULES_PATH = SKILL_DIR / "scripts" / "call-rules.json"

INTERNAL_WARNINGS_KEY = "__wind_cli_warnings"
SKILL_NAME = SKILL_DIR.name

CALL_EXAMPLES = [
    """cli.py call stock_data search_stocks '{"question":"筛选沪深市场市值超500亿且连续5日上涨的股票"}'""",
    """cli.py call stock_data search_stocks '{"question":"筛选港股中市值超1000亿港元的科技股"}'""",
    """cli.py call fund_data search_funds '{"question":"筛选股票型基金中近一年收益率超20%的产品"}'""",
    """cli.py call stock_data get_stock_basicinfo '{"question":"600519.SH公司基本档案"}'""",
    """cli.py call stock_data get_stock_price_indicators '{"windcode":"600519.SH","indexes":"中文简称,最新成交价,涨跌幅"}'""",
    """cli.py call fund_data get_fund_kline '{"windcode":"588200.SH","begin_date":"2026-04-01","end_date":"2026-04-30"}'""",
    """cli.py call stock_data get_stock_quote '{"windcode":"AAPL.O","begin":"2026-08-05","end":"2026-08-05"}'""",
    """cli.py call index_data get_index_kline '{"windcode":"000300.SH","begin_date":"2026-04-01","end_date":"2026-04-30"}'""",
    """cli.py call financial_docs get_financial_news '{"question":"美联储利率政策","top_k":3}'""",
    """cli.py call economic_data natural_language_get_edb_data '{"executionMode":"searchFetch","question":"中国GDP","observation":"10"}'""",
    """cli.py call analytics_data get_financial_data '{"question":"查询中国A股市场过去一年的平均成交量"}'""",
]


def js_json_sanitize(value):
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            return None
        if value == 0 or value.is_integer():
            return int(value)
        return value
    if isinstance(value, dict):
        return {k: js_json_sanitize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [js_json_sanitize(v) for v in value]
    return value


def dumps_pretty(obj):
    return json.dumps(js_json_sanitize(obj), ensure_ascii=False, indent=2, allow_nan=False)


def dumps_compact(obj):
    return json.dumps(js_json_sanitize(obj), ensure_ascii=False, separators=(",", ":"), allow_nan=False)


# iso_now 仅被已停用的自动更新使用
# def iso_now():
#     return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def meta_get(metadata, key, default):
    if key in metadata and metadata[key] is not None:
        return metadata[key]
    return default


def js_typeof(value):
    if value is None:
        return "object"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, (list, dict)):
        return "object"
    return "undefined"


def js_string(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, dict):
        return "[object Object]"
    if isinstance(value, list):
        return ",".join(js_string(x) for x in value)
    return str(value)


def js_truthy(value):
    if value is None or value is False:
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool) and value == 0:
        return False
    if isinstance(value, str) and value == "":
        return False
    return True


def write_file(path, text, mode=None):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = text.encode("utf-8")
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    fd = os.open(str(path), flags, mode if mode is not None else 0o666)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(encoded)
            fd = None
    finally:
        if fd is not None:
            os.close(fd)
    if mode is not None:
        os.chmod(path, mode)


def popen_kwargs():
    kwargs = {
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "start_new_session": True,
    }
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    return kwargs


# ───── 自动更新（扣子已停用）─────
# 原逻辑：每天首次 call 后异步执行 npx skills update。
# 扣子技能版本由平台部署 / 技能商店发布，不能在运行时改本地文件，故整段注释。
#
# def today_key():
#     return datetime.now(timezone.utc).strftime("%Y-%m-%d")
#
#
# def normalize_path(value):
#     normalized = str(Path(value).resolve()).replace("\\", "/")
#     return normalized.lower() if sys.platform == "win32" else normalized
#
#
# def update_scope():
#     global_root = normalize_path(Path.home() / ".agents" / "skills")
#     skill_dir = normalize_path(SKILL_DIR)
#     return "global" if skill_dir.startswith(global_root + "/") else "project"
#
#
# def update_state_file():
#     return SKILL_DIR / "scripts" / "update-state.json"
#
#
# def read_update_state():
#     try:
#         state_file = update_state_file()
#         if not state_file.exists():
#             return None
#         return json.loads(state_file.read_text(encoding="utf-8"))
#     except Exception:
#         return None
#
#
# def write_update_state_patch(patch):
#     state_file = update_state_file()
#     state_file.parent.mkdir(parents=True, exist_ok=True)
#     state = {**(read_update_state() or {}), **patch}
#     write_file(state_file, dumps_pretty(state) + "\n")
#
#
# def already_updated_today():
#     try:
#         state = read_update_state()
#         return bool(state and state.get("date") == today_key() and state.get("status") == "success")
#     except Exception:
#         return False
#
#
# def mark_skill_used():
#     write_update_state_patch({
#         "lastUsedAt": iso_now(),
#         "lastUsedPid": os.getpid(),
#     })
#
#
# def trigger_update_check():
#     try:
#         if not UPDATE_CHECK_PATH.exists():
#             return
#         if already_updated_today():
#             return
#         mark_skill_used()
#         tmp_dir = Path.home() / ".cache" / "wind-aifinmarket"
#         tmp_dir.mkdir(parents=True, exist_ok=True)
#         runner_path = tmp_dir / f"update-check-{SKILL_NAME}-{os.getpid()}.py"
#         shutil.copy2(UPDATE_CHECK_PATH, runner_path)
#         subprocess.Popen(
#             [sys.executable, str(runner_path), str(SKILL_DIR)],
#             **popen_kwargs(),
#         )
#     except Exception:
#         pass


# section: 工具函数

def normalize_success_payload(value, path="$", state=None, data_cell=False):
    if state is None:
        state = {"warnings": [], "tables": [], "invalidPaths": []}
    if data_cell and value == "INVALID":
        state["invalidPaths"].append(path)
        return None
    if isinstance(value, list):
        return [normalize_success_payload(item, f"{path}[{index}]", state, data_cell) for index, item in enumerate(value)]
    if not isinstance(value, dict):
        return value

    normalized = {}
    for key, item in value.items():
        is_structured_data_array = isinstance(item, list) and (key == "rows" or key == "value")
        normalized[key] = normalize_success_payload(item, f"{path}.{key}", state, data_cell or is_structured_data_array)
    if isinstance(value.get("rows"), list):
        state["tables"].append({"path": path, "actual_row_count": len(value["rows"])})
    if "excelTotalCount" in value:
        state["warnings"].append({
            "code": "UNRELIABLE_DECLARED_COUNT",
            "path": f"{path}.excelTotalCount",
            "message": "excelTotalCount 仅保留为后端原始字段，不得据此判断结果总数或完整性。",
        })
    return normalized


# 保留 MCP result 外层兼容性；只清洗可解析的 JSON 文本并附加机器可读安全元数据。
def normalize_call_success(result, context=None):
    if context is None:
        context = {}
    output = copy.deepcopy(result) if isinstance(result, (dict, list)) else result
    state = {"warnings": [], "tables": [], "invalidPaths": []}
    if isinstance(output, dict) and isinstance(output.get(INTERNAL_WARNINGS_KEY), list):
        state["warnings"].extend(output[INTERNAL_WARNINGS_KEY])
        del output[INTERNAL_WARNINGS_KEY]
    if isinstance(output, dict) and isinstance(output.get("content"), list):
        for item in output["content"]:
            if not isinstance(item, dict) or item.get("type") != "text" or not isinstance(item.get("text"), str):
                continue
            try:
                parsed = json.loads(item["text"])
                item["text"] = dumps_compact(normalize_success_payload(parsed, "$", state))
            except Exception:
                # 非 JSON 文本按后端原文透传。
                pass
    if state["invalidPaths"]:
        state["warnings"].append({
            "code": "BACKEND_INVALID_AS_NULL",
            "count": len(state["invalidPaths"]),
            "paths": state["invalidPaths"][:100],
            "truncated": len(state["invalidPaths"]) > 100,
            "message": "结构化数据区中的后端字符串 INVALID 已转换为 null；表示缺失或不适用，禁止按 0 参与计算。",
        })
    if isinstance(output, dict):
        output["cli_meta"] = {
            "schema_version": "1.0",
            "server_type": context.get("server_type") if context.get("server_type") is not None else None,
            "tool_name": context.get("tool_name") if context.get("tool_name") is not None else None,
            "completeness": "unknown" if any(warning.get("code") == "UNRELIABLE_DECLARED_COUNT" for warning in state["warnings"]) else "not_asserted",
            "tables": state["tables"],
            "warnings": state["warnings"],
        }
    return output


def write_raw_call_success(result, context=None):
    if context is None:
        context = {}
    sys.stdout.write(dumps_pretty(normalize_call_success(result, context)) + "\n")


def write_plain_success(data):
    sys.stdout.write(dumps_pretty(data) + "\n")


class ParamsFileError(Exception):
    def __init__(self, message, file=None):
        super().__init__(message)
        self.code = "PARAMS_FILE_ERROR"
        self.file = file


def load_params_input(params_input):
    if not params_input.startswith("@"):
        return {"jsonText": params_input, "source": "inline"}

    file_arg = params_input[1:]
    if not file_arg:
        raise ParamsFileError("@file 缺少文件路径", file=file_arg)

    file_path = str((Path.cwd() / file_arg).resolve())
    try:
        json_text = Path(file_path).read_text(encoding="utf-8").lstrip("\ufeff")
        return {"jsonText": json_text, "source": "file", "filePath": file_path}
    except Exception as cause:
        code = errno_mod.errorcode.get(getattr(cause, "errno", None), "") or str(cause)
        error = ParamsFileError(f"无法读取 params 文件：{file_path} ({code})", file=file_path)
        error.cause = cause
        raise error from cause


RETRY_AFTER_CORRECTION = {"allowed": False, "mode": "after_correction", "max_attempts": 0}
RETRY_SAME_REQUEST = {"allowed": True, "mode": "same_request", "max_attempts": 1}
RETRY_AFTER_WAIT_3S = {"allowed": True, "mode": "same_request_after_wait", "max_attempts": 1, "after_ms": 3000}
RETRY_AFTER_WAIT_5S = {"allowed": True, "mode": "same_request_after_wait", "max_attempts": 1, "after_ms": 5000}
KEEP_CURRENT_CALL = {"tripped": False, "scope": "current_call", "action": "none"}
ABORT_REMAINING_BATCH = {"tripped": True, "scope": "remaining_batch", "action": "abort_remaining_calls"}
NO_CORRECTION = {}
REDUCE_CONCURRENCY = {
    "strategy": "reduce_concurrency",
    "change_only": ["concurrency"],
    "recommended_concurrency": DEFAULT_TOOL_CONCURRENCY,
    "recommended_max_concurrency": MAX_TOOL_CONCURRENCY,
    "preserve_server_type": True,
    "preserve_tool_name": True,
    "preserve_params": True,
}


def define_error(agent_action, retry=None, circuit_breaker=None, correction=None):
    return {
        "agent_action": agent_action,
        "retry": RETRY_AFTER_CORRECTION if retry is None else retry,
        "circuit_breaker": KEEP_CURRENT_CALL if circuit_breaker is None else circuit_breaker,
        "correction": NO_CORRECTION if correction is None else correction,
    }


# 错误文案与默认机器策略的唯一总表。调用点可用 metadata 补充本次请求的精确诊断。
ERROR_DEFINITIONS = {
    "TEMPORARILY_UNAVAILABLE": define_error(
        "原因：后端临时不可用。处理：保持当前 server_type、tool_name 和参数不变。重试：仅允许原样重试一次，仍失败则停止并告知用户稍后再试。",
        retry=RETRY_SAME_REQUEST,
    ),
    "INVALID_PARAM_NAME": define_error(
        "原因：参数名错误或缺少必填字段。处理：按 error.details 内联的 allowed_fields 或 required_fields 修正。重试：禁止原样重试；修正后最多重试一次。",
        circuit_breaker=ABORT_REMAINING_BATCH,
    ),
    "INVALID_PARAM_VALUE": define_error(
        "原因：参数值不合法。处理：按 error.details 内联的 expected_format、allowed_values 或其它期望值修正。重试：禁止原样重试；修正后最多重试一次。",
        circuit_breaker=ABORT_REMAINING_BATCH,
    ),
    "EDB_INDICATOR_NOT_FOUND": define_error(
        "原因：EDB 未找到用户想查询的经济指标。处理：保持 economic_data.natural_language_get_edb_data，只将 question 改成更短、更标准、更明确的单个指标名；优先补充官方口径、地区、来源或常见英文名，去掉年份、预测、市场规模、CAGR 或多个指标拼接等非指标名成分。重试：禁止原样重试；改写后最多重试一次。若改写后仍未找到，停止自动尝试并提示用户提供更明确的指标名称、来源或口径。",
    ),
    "MARKET_TARGET_NOT_FOUND": define_error(
        "原因：行情类金融标的未识别，通常是 windcode 中的标的名称、简称或代码无法被 Wind NER 匹配。处理：保持当前行情工具；若用户输入的是中文名、简称或自然语言标的，优先原样传入更明确的单个名称，不得自行补交易所后缀或把名称猜成代码；若原始 windcode 是 1-5 位纯大写英文字母，且用户问题明确是美股/美国上市公司语境，允许仅在本错误后改为 <ticker>.O 重试一次；台股、日股、韩股、欧股等超出本 skill 覆盖范围的请求不得套用 .O 重试，应停止并说明不在支持范围；只有用户明确给出标准代码且明确市场时，才可修正为用户确认的其它 Wind 标准代码。重试：禁止原样重试；修正后最多重试一次。若仍未识别，停止自动尝试并提示用户提供更明确的标的全称、交易所或 Wind 标准代码。",
        circuit_breaker=ABORT_REMAINING_BATCH,
    ),
    "PARAM_TYPE_ERROR": define_error(
        "原因：参数类型错误，实际值与工具接受的类型不匹配。处理：按 error.details 中的 expected_type 修正对应字段；indexes 使用英文逗号分隔字符串。重试：禁止原样重试；修正后最多重试一次。",
        circuit_breaker=ABORT_REMAINING_BATCH,
    ),
    "PERIOD_PARSE_ERROR": define_error(
        "原因：K 线周期值无法解析。处理：保持当前 K 线工具，只修 period；日线用 '1d'，周线用 '1w'，月线用 '1mo'。重试：禁止原样重试；修正后最多重试一次。",
    ),
    "USAGE_ERROR": define_error(
        "原因：调用命令格式错误。处理：修正为 cli.py call <server_type> <tool_name> '<params_json>|@params_file'。重试：禁止原样重试；修正命令形态后最多重试一次。",
    ),
    "PARAMS_FILE_ERROR": define_error(
        "原因：@file 参数文件路径为空、文件不存在、无权限或无法读取。处理：只修文件路径或权限，不改 server_type、tool_name 和业务参数。重试：文件可读后最多重试一次。",
        circuit_breaker=ABORT_REMAINING_BATCH,
    ),
    "INVALID_PARAMS_JSON": define_error(
        "原因：内联参数或 @file 文件内容不是可解析的 JSON。处理：只修 shell 引号、JSON 转义或文件内容，不改字段、日期、indexes、question 或工具。重试：禁止原样重试；修正 JSON 后最多重试一次。",
    ),
    "ROUTE_ERROR": define_error(
        "原因：server_type 或 tool_name 不合法。处理：按 error.details 内联的合法 server_type、tool_name 或候选路由修正。重试：禁止原样重试；修正路由后最多重试一次。",
    ),
    "PARAM_VALIDATION_ERROR": define_error(
        "原因：本地或后端参数校验未通过。处理：按 error.details 内联的 field、issue、expected_format、allowed_values、allowed_fields 或 required_fields 修正。重试：禁止原样重试；修正后最多重试一次。",
        circuit_breaker=ABORT_REMAINING_BATCH,
    ),
    "PARAM_CONFLICT_ERROR": define_error(
        "原因：同时传入的同义参数值不一致。处理：按 error.details 中的 fields 和 actual_values 保留一个字段，或将两个字段改为相同值；不得静默覆盖。重试：修正冲突后最多重试一次。",
        circuit_breaker=ABORT_REMAINING_BATCH,
    ),
    "AUTH_ERROR": define_error(
        "原因：认证失败或 API Key 缺失/无效。处理：本地按 detail 配置或更换有效 Key；扣子平台将 WIND_API_KEY 设为凭证变量（API Key），关联域名 mcp.wind.com.cn，禁止把 Key 写进对话或 setup-key。不要换工具绕过。重试：Key 修复前禁止重试；Key 修复后最多原样重试一次。",
    ),
    "DAILY_LIMIT_ERROR": define_error(
        "原因：当前 Key 的单日请求次数已达上限，不是账户余额不足。处理：等待次日额度刷新，或更换仍有当日额度的 Key。重试：额度刷新或更换 Key 前禁止重试。",
    ),
    "BALANCE_ERROR": define_error(
        "原因：当前 Key 对应账户余额不足，不是单日请求次数超限。处理：充值，或更换余额充足的 Key。重试：余额恢复或更换 Key 前禁止重试。",
    ),
    "RATE_LIMIT_ERROR": define_error(
        "原因：请求过于频繁，触发 QPS 限流，不代表日额度或余额不足。处理：等待 3-5 秒，并降低请求频率。重试：等待后仅允许原样重试一次。",
        retry=RETRY_AFTER_WAIT_5S,
    ),
    "CONCURRENCY_LIMIT_ERROR": define_error(
        "原因：当前同时执行的工具请求数超过后端并发上限，不是参数、标的或额度错误。处理：立即停止发起剩余同批请求，等待 3 秒并恢复串行调用；如用户明确要求并发，并发数不得超过 10。重试：降低并发后仅允许原样重试一次。",
        retry=RETRY_AFTER_WAIT_3S,
        circuit_breaker=ABORT_REMAINING_BATCH,
        correction=REDUCE_CONCURRENCY,
    ),
    "NETWORK_ERROR": define_error(
        "原因：网络连接或后端 HTTP 5xx 异常。处理：若 detail 暴露参数问题，先修参数；否则稍后再试。重试：仅允许原样重试一次，仍失败则停止并告知用户。",
        retry=RETRY_SAME_REQUEST,
    ),
    "TOOL_RUNTIME_ERROR": define_error(
        "原因：后端工具运行失败。处理：优先根据 detail 判断是否为请求过大、字段不支持或数据未覆盖；能定位则只修对应项。重试：禁止盲目原样重试；修正后最多重试一次，无法定位则停止。",
    ),
    "NO_RESULTS": define_error(
        "原因：工具执行成功但没有匹配结果。处理：保持同一 server_type、tool_name 和用户意图，只调整一个直接相关的关键词、时间范围或粒度。重试：禁止原样重试；调整后最多重试一次。若第二次仍无结果，停止自动尝试并提示用户提供更明确的指标名称、来源或口径。",
    ),
    "SETUP_ERROR": define_error(
        "原因：本地配置或环境操作失败。处理：按 detail 修正 scope、权限、路径或让用户手动打开 URL。重试：禁止原样重试；修正本地问题后最多重试一次。",
    ),
    "UNKNOWN": define_error(
        "原因：未归类的后端或本地错误；不代表参数、工具或标的可修复。处理：保留 detail 原文，不要猜测参数、切换工具或扩大查询；仅当能明确判断属于本地命令、参数、认证或网络问题时，才修正对应项。重试：禁止原样重试；有确定修正项时最多重试一次，无法明确定位则停止并将 detail 原文告知用户。",
    ),
}


def get_error_definition(code):
    return ERROR_DEFINITIONS.get(code) or ERROR_DEFINITIONS["UNKNOWN"]


# 失败 envelope 保留 agent_action 向后兼容，同时提供机器可读的诊断与重试策略。
def write_error_envelope(code, detail, metadata=None):
    if metadata is None:
        metadata = {}
    definition = get_error_definition(code)
    error = {
        "code": code,
    }
    if metadata.get("error_message"):
        error["message"] = metadata["error_message"]
    if "details" in metadata and metadata["details"] is not None:
        error["details"] = metadata["details"]
    elif detail:
        error["details"] = {"message": str(detail)[:500]}
    else:
        error["details"] = {}
    error["retry"] = meta_get(metadata, "retry", definition["retry"])
    error["circuit_breaker"] = meta_get(metadata, "circuit_breaker", definition["circuit_breaker"])
    error["correction"] = meta_get(metadata, "correction", definition["correction"])
    error["agent_action"] = build_agent_action(code, detail)
    envelope = {"ok": False, "error": error}
    sys.stdout.write(dumps_pretty(envelope) + "\n")


def die(code, detail=None, exit_code=1, metadata=None):
    if metadata is None:
        metadata = {}
    write_error_envelope(code, detail, metadata)
    sys.exit(exit_code)


def exit_with_usage(usage, exit_code=0):
    die("USAGE_ERROR", f"USAGE:\n{usage}", exit_code)


def mask_key(key):
    if not key or len(key) < 8:
        return "***"
    return key[:4] + "***" + key[-4:]


COZE_WIND_KEY_ENV_RE = re.compile(r"^COZE_WIND_API_KEY(_[0-9A-Za-z]+)?$")
REDACT_BEARER_RE = re.compile(r"(Bearer\s+)\S+", re.I)
REDACT_KEY_ASSIGN_RE = re.compile(r"(WIND_API_KEY\s*[=:]\s*)\S+", re.I)


def redact_secrets(text):
    if text is None:
        return text
    s = str(text)
    s = REDACT_BEARER_RE.sub(r"\1***", s)
    s = REDACT_KEY_ASSIGN_RE.sub(r"\1***", s)
    return s


def is_coze_wind_credential_present():
    if any(COZE_WIND_KEY_ENV_RE.match(name) for name in os.environ):
        return True
    wind = (os.environ.get("WIND_API_KEY") or "").strip()
    return bool(wind) and bool(re.match(r"^COZE_[A-Z0-9_]+$", wind, re.I))


def read_env_api_key():
    direct = (os.environ.get("WIND_API_KEY") or "").strip()
    if direct:
        return direct
    names = [name for name in os.environ if COZE_WIND_KEY_ENV_RE.match(name)]
    names.sort(key=len, reverse=True)
    for name in names:
        stripped = (os.environ.get(name) or "").strip()
        if stripped:
            return stripped
        # 扣子凭证变量在思考阶段可能只有占位符名，真实值在出站代理替换
        return name
    return None


def read_file_api_key():
    global_config = Path.home() / ".wind-aifinmarket" / "config"
    if global_config.exists():
        try:
            env = parse_dotenv(global_config.read_text(encoding="utf-8"))
            key = (env.get("WIND_API_KEY") or "").strip()
            if key:
                return key
        except Exception:
            pass

    local_config = SKILL_DIR / "config.json"
    if local_config.exists():
        try:
            cfg = json.loads(local_config.read_text(encoding="utf-8"))
            key = cfg["wind_api_key"].strip() if isinstance(cfg.get("wind_api_key"), str) else ""
            if key:
                return key
        except Exception:
            pass
    return None


# dotenv 解析: 兼容注释 / 引号 / export 前缀
def parse_dotenv(content):
    env = {}
    for raw_line in content.split("\n"):
        line = raw_line.lstrip("\ufeff").strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        eq = line.find("=")
        if eq <= 0:
            continue
        key = line[:eq].strip()
        val = line[eq + 1:].strip()
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        else:
            hash_idx = val.find(" #")
            if hash_idx >= 0:
                val = val[:hash_idx].strip()
        env[key] = val
    return env


def get_server(server_type):
    server = SERVERS.get(server_type)
    if not server:
        die("ROUTE_ERROR", f"未知 server_type: {server_type}. 可用: {' / '.join(SERVERS.keys())}", 1, {
            "details": {"field": "server_type", "issue": "invalid_enum", "actual": server_type, "allowed_values": list(SERVERS.keys())},
            "retry": {"allowed": True, "mode": "after_correction", "max_attempts": 1},
            "correction": {"change_only": ["server_type"]},
        })
    return server


def load_tool_manifest():
    try:
        # tool-manifest.json is the authority for legal server_type + tool_name combinations.
        manifest = json.loads(TOOL_MANIFEST_PATH.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict):
            raise ValueError("manifest 顶层必须是对象")
        for server_type, tools in manifest.items():
            if server_type not in SERVERS:
                raise ValueError(f"manifest 包含未知 server_type: {server_type}")
            if not isinstance(tools, list) or any(not isinstance(tool, str) or not tool for tool in tools):
                raise ValueError(f"manifest 中 {server_type} 的工具清单必须是非空字符串数组")
        for server_type in SERVERS:
            if not isinstance(manifest.get(server_type), list):
                raise ValueError(f"manifest 缺少 server_type: {server_type}")
        return manifest
    except Exception as err:
        die("UNKNOWN", f"工具清单读取失败: {err}")


def validate_tool_selection(server_type, tool_name):
    get_server(server_type)
    manifest = load_tool_manifest()
    tools = manifest[server_type]
    if tool_name not in tools:
        die("ROUTE_ERROR", f'工具名 "{tool_name}" 不属于 server_type "{server_type}"。', 1, {
            "details": {"field": "tool_name", "issue": "invalid_enum", "actual": tool_name, "server_type": server_type, "allowed_values": tools},
            "retry": {"allowed": True, "mode": "after_correction", "max_attempts": 1},
            "correction": {"change_only": ["tool_name"], "preserve_server_type": True},
        })


PRICE_INDICATOR_TOOLS = {"get_stock_price_indicators", "get_fund_price_indicators", "get_index_price_indicators"}
QUOTE_TOOLS = {"get_stock_quote", "get_fund_quote", "get_index_quote"}
EDB_EXECUTION_MODE_ALIASES = {
    "仅搜索": "search",
    "仅提数": "fetch",
    "搜索并提数": "searchFetch",
}


def read_call_rules():
    try:
        return json.loads(CALL_RULES_PATH.read_text(encoding="utf-8"))
    except Exception as err:
        die("UNKNOWN", f"调用规则读取失败: {err}")


def prepare_normalization_rules(rules):
    return {
        "klinePeriodMap": dict((rules.get("kline_period_map") or {}).items()),
        "toolByDomain": rules.get("tool_by_domain") or {},
    }


CALL_RULES = read_call_rules()
NORMALIZATION_RULES = prepare_normalization_rules(CALL_RULES)
KLINE_PERIOD_MAP = NORMALIZATION_RULES["klinePeriodMap"]
PUBLIC_KLINE_PERIODS = list(KLINE_PERIOD_MAP.keys())
KLINE_PERIODS = set(KLINE_PERIOD_MAP.values())
TOOL_BY_DOMAIN = NORMALIZATION_RULES["toolByDomain"]

TOOL_VALIDATION_RULES = {
    "basic": CALL_RULES.get("basic") or {},
    "toolRules": CALL_RULES["tool_rules"] if isinstance(CALL_RULES.get("tool_rules"), list) else [],
}
KLINE_TOOLS = set(next((rule.get("tools") or [] for rule in TOOL_VALIDATION_RULES["toolRules"] if rule.get("name") == "kline"), []))


def normalize_indexes(indexes):
    if not isinstance(indexes, str):
        return indexes
    return ",".join(item.strip() for item in indexes.split(",") if item.strip())


def normalize_windcode(windcode):
    if not isinstance(windcode, str):
        return windcode
    raw = windcode.strip()
    upper = raw.upper()
    # Keep natural-language names untouched. Wind's backend NER is responsible
    # for resolving names/aliases; the CLI must not guess exchange suffixes.
    if re.search(r"[\u4e00-\u9fff]", raw):
        return raw
    if re.search(r"^0\d{4}\.HK$", upper):
        return upper[1:]
    if re.search(r"^\d{4}\.HK$", upper):
        return upper
    if re.search(r"^\d{6}\.(SH|SZ|BJ|OF)$", upper):
        return upper
    if re.search(r"^[A-Z]{1,5}\.(O|N|A|HK|SH|SZ|BJ)$", upper):
        return upper
    return raw


def tool_family(tool_name):
    if tool_name in PRICE_INDICATOR_TOOLS:
        return "price"
    if tool_name in KLINE_TOOLS:
        return "kline"
    if tool_name in QUOTE_TOOLS:
        return "quote"
    return None


def normalize_call(server_type, tool_name, args):
    family = tool_family(tool_name)
    if family:
        tool_name = (TOOL_BY_DOMAIN.get(family) or {}).get(server_type) or tool_name
    normalized_args = {**args}
    normalization_errors = []
    if tool_name == "natural_language_get_edb_data" and isinstance(normalized_args.get("executionMode"), str):
        normalized_args["executionMode"] = EDB_EXECUTION_MODE_ALIASES.get(normalized_args["executionMode"]) or normalized_args["executionMode"]
    if isinstance(normalized_args.get("indexes"), str):
        normalized_args["indexes"] = normalize_indexes(normalized_args["indexes"])
    if isinstance(normalized_args.get("windcode"), str):
        normalized_args["windcode"] = normalize_windcode(normalized_args["windcode"])
    if tool_name in KLINE_TOOLS and "period" not in normalized_args:
        normalized_args["period"] = "1d"
    if isinstance(normalized_args.get("period"), str):
        key = normalized_args["period"].strip()
        backend_period = KLINE_PERIOD_MAP.get(key)
        normalized_args["period"] = backend_period or key
        if not backend_period and key in KLINE_PERIODS:
            normalization_errors.append({
                "message": f"字段 'period' 只能是 {'/'.join(PUBLIC_KLINE_PERIODS)}，日 K 请传 '1d'",
                "field": "period",
                "issue": "invalid_enum",
                "actual": key,
                "allowed_values": list(PUBLIC_KLINE_PERIODS),
            })
    return {"server_type": server_type, "toolName": tool_name, "args": normalized_args, "normalizationErrors": normalization_errors}


def validate_basic_params(params):
    errors = []
    if not isinstance(params, dict):
        return [{
            "code": "PARAM_TYPE_ERROR",
            "message": "params 必须是 JSON object",
            "field": "params",
            "issue": "invalid_type",
            "expected_type": "object",
            "actual_type": "array" if isinstance(params, list) else js_typeof(params),
        }]

    basic = TOOL_VALIDATION_RULES["basic"]
    for key in basic.get("string_keys") or []:
        if key not in params:
            continue
        if not isinstance(params[key], str):
            errors.append({
                "message": f"字段 '{key}' 必须是字符串",
                "field": key,
                "issue": "invalid_type",
                "expected_type": "string",
                "actual_type": "array" if isinstance(params[key], list) else js_typeof(params[key]),
            })
        elif len(params[key].strip()) == 0:
            errors.append({"message": f"字段 '{key}' 不能为空或全空白", "field": key, "issue": "empty_value", "expected": "non-empty string"})
    return errors


def has_param_value(params, key):
    if key not in params:
        return False
    value = params[key]
    return value is not None and value != ""


def resolve_validation_values(field_rule):
    if isinstance(field_rule.get("values"), list):
        return [str(v) for v in field_rule["values"]]
    if field_rule.get("values_from") == "kline_period_map":
        return [str(v) for v in KLINE_PERIODS]
    return []


def resolve_validation_display_values(field_rule):
    if field_rule.get("values_from") == "kline_period_map":
        return [str(v) for v in PUBLIC_KLINE_PERIODS]
    return resolve_validation_values(field_rule)


def render_validation_message(template, values):
    return str(template or "").replace("${values}", "/".join(values))


def validation_error_message(error):
    return error if isinstance(error, str) else error["message"]


def validation_error_code(error):
    return error.get("code") if isinstance(error, dict) and error.get("code") else None


def validate_tool_params(tool_name, params):
    errors = []
    rules = [rule for rule in TOOL_VALIDATION_RULES["toolRules"] if isinstance(rule.get("tools"), list) and tool_name in rule["tools"]]

    for rule in rules:
        rule_label = rule.get("label") or rule.get("name") or tool_name
        if isinstance(rule.get("allowed"), list):
            allowed_keys = set(rule["allowed"])
            for key in params.keys():
                if key not in allowed_keys:
                    errors.append({"message": f"{rule_label} 工具不支持字段 '{key}'", "field": key, "issue": "unknown_field", "allowed_fields": list(allowed_keys)})

        for key in rule.get("required") or []:
            if not has_param_value(params, key):
                errors.append({"message": f"{rule_label} 工具缺少必填字段 '{key}'", "field": key, "issue": "missing_required", "required_fields": rule.get("required") or []})

        for field, field_rule in (rule.get("enum_fields") or {}).items():
            if field not in params:
                continue
            values = resolve_validation_values(field_rule)
            if str(params[field]) not in values:
                display_values = resolve_validation_display_values(field_rule)
                errors.append({"message": render_validation_message(field_rule.get("message"), display_values), "field": field, "issue": "invalid_enum", "actual": params[field], "allowed_values": display_values})

        for fields in rule.get("paired") or []:
            present = [key for key in fields if has_param_value(params, key)]
            if 0 < len(present) < len(fields):
                errors.append({"message": f"字段 '{' 和 '.join(fields)}' 应成对填写", "fields": fields, "issue": "incomplete_pair", "expected_fields": fields})

        for fields in rule.get("mutually_exclusive") or []:
            present = [key for key in fields if has_param_value(params, key)]
            if len(present) > 1:
                errors.append({"message": f"字段 '{'/'.join(fields)}' 互斥，不应同时填写", "fields": fields, "issue": "mutually_exclusive"})

        for pair in rule.get("ordered_dates") or []:
            start_key, end_key = pair
            if params.get(start_key) and params.get(end_key) and params[start_key] > params[end_key]:
                errors.append({"message": f"字段 '{start_key}' 不能晚于 '{end_key}'", "fields": [start_key, end_key], "issue": "invalid_order", "expected": f"{start_key} <= {end_key}"})

        for field, pattern_rule in (rule.get("patterns") or {}).items():
            if field not in params:
                continue
            pattern = re.compile(pattern_rule["pattern"])
            if not pattern.search(str(params[field])):
                errors.append({"message": pattern_rule.get("message") or f"字段 '{field}' 格式不合法", "field": field, "issue": "invalid_format", "actual": params[field], "expected_pattern": pattern_rule["pattern"]})

        for conditional in rule.get("required_one_of_when") or []:
            field_value = js_string(params[conditional["field"]]) if "field" in conditional and conditional["field"] in params else "undefined"
            values = [str(v) for v in (conditional.get("values") or [])]
            if field_value not in values:
                continue
            satisfied = any(all(has_param_value(params, key) for key in group) for group in (conditional.get("one_of") or []))
            if not satisfied:
                errors.append({"message": conditional.get("message") or f"字段 '{conditional.get('field')}' 当前取值缺少配套参数", "field": conditional.get("field"), "issue": "missing_conditional_fields", "one_of": conditional.get("one_of")})
    return errors


# ───── 认证 ─────

def get_api_key():
    # 扣子凭证变量：思考阶段是占位符，真实 Key 只在请求 mcp.wind.com.cn 时由平台代理注入。
    # 必须把占位符放进 Authorization，不得在发请求前因“看起来没 Key”而 AUTH_ERROR。
    # 仅在出现 WIND 凭证占位符时走扣子路径，避免无关的 COZE_* 环境变量跳过本地 config。
    if is_coze_wind_credential_present():
        env_key = read_env_api_key()
        if env_key:
            return env_key
        names = [name for name in os.environ if COZE_WIND_KEY_ENV_RE.match(name)]
        names.sort(key=len, reverse=True)
        if names:
            return names[0]

    file_key = read_file_api_key()
    if file_key:
        return file_key
    env_key = read_env_api_key()
    if env_key:
        return env_key
    die("AUTH_ERROR", "WIND_API_KEY 未配置（CLI 已完整检查：用户全局配置 > Skill 本地配置 > 环境变量）。扣子平台请将 WIND_API_KEY 设为凭证变量（API Key）并关联域名 mcp.wind.com.cn，不要把 Key 写进对话。")


# section: 错误码 — message 来自 HTTP / JSON-RPC / 工具内嵌 JSON, 统一映射成稳定 code

ERROR_PATTERNS = [
    ("TEMPORARILY_UNAVAILABLE", re.compile(r"temporarily_unavailable", re.I), "后端偶发不可用。"),
    ("EDB_INDICATOR_NOT_FOUND", re.compile(r"未找到匹配的(?:经济)?指标|indicator_not_found", re.I), "EDB 未找到用户想查询的指标。"),
    ("MARKET_TARGET_NOT_FOUND", re.compile(r"market_target_not_found|NER-API error.*(?:识别合并后无结果|请确认输入内容是否包含实体)|comm_exception.*NER-API|未识别实体|未识别到有效的金融标的|ner_error", re.I), "行情类查询对象未识别。"),
    ("PARAM_TYPE_ERROR", re.compile(r"attribute_error|(?:'list' object has no attribute '(?:split|strip)')|(?:list object has no attribute (?:split|strip))", re.I), "参数类型错误：列表传给了只接受字符串的字段。"),
    ("PERIOD_PARSE_ERROR", re.compile(r'srv_internal_error|For input string:\s*\\?["\']?(?:day|daily|monthly|week|weekly|month|D|M|W)\\?["\']?', re.I), "K 线周期值无法解析。"),
    ("INVALID_PARAM_VALUE", re.compile(r"invalid_param_value|Invalid value .* for field|参数值.*不合法|参数值错误", re.I), "后端参数值错误。"),
    ("INVALID_PARAM_NAME", re.compile(r"invalid_param_name|缺少必填参数|missing required", re.I), "后端参数名错误。"),
    ("DAILY_LIMIT_ERROR", re.compile(r"单日请求次数超限|daily.*(?:request|quota)?.*limit|daily.*limit.*exceed", re.I), "单日请求次数已超限。"),
    ("BALANCE_ERROR", re.compile(r"余额不足|请先充值|insufficient.*balance", re.I), "账户余额不足。"),
    ("CONCURRENCY_LIMIT_ERROR", re.compile(r"当前工具并发请求数量超限|并发(?:请求)?(?:数量)?(?:超限|过多)|concurren(?:cy|t).*(?:limit|exceed|too many)", re.I), "工具并发请求数量超限。"),
    ("RATE_LIMIT_ERROR", re.compile(r"请求过于频繁|qps.*limit|too.*frequent|rate.*limit", re.I), "QPS 限流。"),
    ("AUTH_ERROR", re.compile(r"密钥无效|key.*invalid|unauthorized|认证失败|auth.*fail", re.I), "认证/权限错误。按 Key 机制修复后原样重试。"),
    ("NO_RESULTS", re.compile(r'未获取到数据|"NO_RESULTS"|no\s*results?|not\s*found|empty\s*result', re.I), "未获取到匹配数据。先在不改变用户意图的前提下调整关键词或参数。"),
    ("PARAM_VALIDATION_ERROR", re.compile(r"参数验证失败|参数.*(错误|非法|无效)|字段.*(不存在|不识别|不支持|非法)|invalid\s*(param|argument|field)|missing\s*(param|argument|field|required)", re.I), "后端参数验证失败。先按 SKILL.md 工具表核对字段名、必填项、日期格式和枚举值后重试。"),
    ("NETWORK_ERROR", re.compile(r"服务.*暂不可用|服务.*不可用|service\s+unavailable|temporarily\s+unavailable", re.I), "网络/后端错误。先核对参数再稍后重试。"),
    ("TOOL_RUNTIME_ERROR", re.compile(r"TOOL_ERROR|tool.*error|工具.*(执行|运行).*错误|runtime.*error", re.I), "后端工具运行错误。保留后端原文，先检查请求是否过大或口径是否受支持；不要直接切换工具绕过。"),
]


def infer_error_code(msg):
    if not msg:
        return "UNKNOWN"
    if re.search(r'^\s*"?OK"?\s*$', str(msg), re.I):
        return "TOOL_RUNTIME_ERROR"
    for code, pat, _hint in ERROR_PATTERNS:
        if pat.search(str(msg)):
            return code
    return "UNKNOWN"


def has_usable_data(value):
    if value is None:
        return False
    if isinstance(value, list):
        return len(value) > 0
    if isinstance(value, str):
        return len(value.strip()) > 0
    if isinstance(value, dict):
        return len(value) > 0
    return True


def business_payload_has_usable_data(inner):
    body = inner.get("data") if isinstance(inner, dict) else None
    if not isinstance(body, (dict, list)):
        return has_usable_data(body)
    if isinstance(body, dict) and "data" in body:
        return has_usable_data(body["data"])
    return has_usable_data(body)


def classify_business_response(inner, server_type):
    body = inner.get("data") if isinstance(inner, dict) else None
    if not isinstance(body, dict):
        return None
    numeric_code = None
    if isinstance(body.get("code"), (int, float)) and not isinstance(body.get("code"), bool):
        numeric_code = body["code"]
    elif isinstance(body.get("code"), str) and re.search(r"^\d+$", body["code"].strip()):
        numeric_code = int(body["code"])
    if numeric_code is None:
        return None
    message = body["message"] if isinstance(body.get("message"), str) else dumps_compact(body)
    is_success_code = numeric_code == 0 or (
        200 <= numeric_code < 300 and re.search(r"^(OK|SUCCESS)$", str(body.get("message") or "").strip(), re.I)
    )
    if is_success_code:
        return None
    if server_type == "economic_data" and numeric_code == 1003:
        return {"error": ["EDB_INDICATOR_NOT_FOUND", message]}
    inferred_code = infer_error_code(message)
    if business_payload_has_usable_data(inner) and inferred_code == "UNKNOWN":
        return {
            "warning": {
                "code": "UNKNOWN_BACKEND_STATUS_WITH_DATA",
                "backend_code": body.get("code"),
                "backend_message": body["message"] if "message" in body else None,
                "message": "后端返回未知业务状态码，但响应中包含可用数据；已保留数据并降级为成功警告。",
            },
        }
    return {"error": [inferred_code, message]}


def is_explicit_no_data_result(inner):
    if not isinstance(inner, dict):
        return False
    error = inner.get("error")
    return (
        "data" in inner and inner["data"] is None
        and isinstance(error, dict)
        and error.get("code") == "QUERY_FAILED"
        and error.get("message") == "没找到数据"
    )


# detail 只保留短诊断，避免后端长文本淹没 agent_action。
def build_agent_action(code, detail):
    template = get_error_definition(code)["agent_action"]
    if code == "USAGE_ERROR":
        return template
    if isinstance(detail, str) and detail.strip():
        d = detail.strip()[:500]
        return f"[{d}] {template}"
    return template


# section: MCP 调用 — 裸 HTTP + JSON-RPC, 响应兼容 SSE / 纯 JSON

def parse_sse(text):
    trimmed = text.strip()
    # 后端正常 SSE, 部分错误场景纯 JSON
    if trimmed.startswith("{"):
        try:
            return json.loads(trimmed)
        except Exception:
            pass
    lines = re.split(r"\r?\n", text)
    last = None
    for line in lines:
        if line.startswith("data: "):
            last = line[6:]
    if last:
        try:
            return json.loads(last)
        except Exception as e:
            raise ValueError(f"SSE data 行 JSON 解析失败：{e}。原文前 200 字符：{text[:200]}") from e
    raise ValueError(f"响应格式无法识别（既非 SSE 也非纯 JSON）。原文前 200 字符：{text[:200]}")


def _urllib_http_request(url, *, method="POST", headers=None, body=None, timeout=60):
    hdrs = dict(headers or {})
    hdrs.setdefault("User-Agent", "node")
    data = body if isinstance(body, (bytes, type(None))) else body.encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            status = getattr(resp, "status", resp.getcode())
            return {
                "ok": 200 <= status < 300,
                "status": status,
                "statusText": getattr(resp, "reason", "") or "",
                "text": raw.decode("utf-8", errors="replace"),
            }
    except urllib.error.HTTPError as e:
        raw = e.read()
        return {
            "ok": False,
            "status": e.code,
            "statusText": e.reason or "",
            "text": raw.decode("utf-8", errors="replace"),
        }


def http_request(url, *, method="POST", headers=None, body=None, timeout=60):
    if os.environ.get("WIND_MOCK_SCENARIO"):
        mock_path = Path(__file__).resolve().parent.parent / "tests" / "mock_http.py"
        spec = importlib.util.spec_from_file_location("wind_mcp_mock_http", mock_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod.mock_http_request(url, method=method, headers=headers, body=body, timeout=timeout)
    return _urllib_http_request(url, method=method, headers=headers, body=body, timeout=timeout)


def fetch_with_retry(url, options_or_factory, attempts=3, delays_ms=None, on_attempt_error=None):
    if delays_ms is None:
        delays_ms = [300, 1000]
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            options = options_or_factory(attempt) if callable(options_or_factory) else options_or_factory
            return http_request(
                url,
                method=options.get("method", "POST"),
                headers=options.get("headers"),
                body=options.get("body"),
                timeout=options.get("timeout", 60),
            )
        except Exception as err:
            last_error = err
            if on_attempt_error:
                on_attempt_error(err, attempt, attempts)
            delay_ms = delays_ms[min(attempt - 1, len(delays_ms) - 1)] if delays_ms else 0
            if attempt < attempts and delay_ms > 0:
                time.sleep(delay_ms / 1000)
    raise last_error


HTTP_ERROR_MAP = {
    401: ["AUTH_ERROR", "API Key 无效或过期"],
    429: ["RATE_LIMIT_ERROR", "请求过于频繁"],
    500: ["NETWORK_ERROR", "服务端异常"],
    502: ["NETWORK_ERROR", "网关异常"],
    503: ["NETWORK_ERROR", "服务暂不可用"],
    504: ["NETWORK_ERROR", "网关超时"],
}


def mcp_request(server_type, method, params, timeout_ms=60_000, diagnostic_context=None):
    server = get_server(server_type)
    response_warnings = []
    api_key = get_api_key()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
    }

    body = dumps_compact({
        "jsonrpc": "2.0",
        "id": int(time.time() * 1000),
        "method": method,
        "params": params,
    })

    def die_mcp(code, detail, backend_error=None):
        if code != "MARKET_TARGET_NOT_FOUND":
            backend_message = redact_secrets(re.sub(r"\s*\(server=[^)]+\)\s*$", "", str(detail or "")))[:2000]
            call_arguments = params["arguments"] if isinstance(params, dict) and isinstance(params.get("arguments"), dict) else None
            extra = {"details": {
                "server_type": server_type,
                "tool_name": params.get("name") if isinstance(params, dict) else None,
                "backend_message": backend_message,
                "original_params": call_arguments,
            }}
            if backend_error:
                extra["details"]["backend_error"] = backend_error
            if isinstance(backend_error, dict) and backend_error.get("message"):
                extra["error_message"] = backend_error["message"]
            die(code, detail, 1, extra)
        original_input = None
        attempted_input = None
        if diagnostic_context:
            original_input = diagnostic_context.get("original_input")
            attempted_input = diagnostic_context.get("normalized_input")
        if original_input is None and isinstance(params, dict) and isinstance(params.get("arguments"), dict):
            original_input = params["arguments"].get("windcode")
        if attempted_input is None and isinstance(params, dict) and isinstance(params.get("arguments"), dict):
            attempted_input = params["arguments"].get("windcode")
        die(code, detail, 1, {
            "details": {
                "message": str(detail or "")[:500],
                "field": "windcode",
                "issue": "instrument_not_resolved",
                "original_input": original_input,
                "normalized_input": attempted_input,
                "attempted_inputs": [] if attempted_input is None else [attempted_input],
                "candidates": [],
            },
            "retry": {"allowed": False, "mode": "after_user_correction", "max_attempts": 0},
            "circuit_breaker": {"tripped": True, "scope": "remaining_batch", "action": "abort_remaining_calls"},
            "correction": {
                "required": ["instrument_full_name_or_windcode"],
                "requires_user_input": True,
                "user_prompt": "请提供该标的的准确全称或 Wind 标准代码。",
                "preserve_server_type": True,
                "preserve_tool_name": True,
            },
        })

    def die_backend(error, fallback_code="UNKNOWN"):
        backend_error = error if isinstance(error, dict) else {"message": str("" if error is None else error)}
        message = backend_error.get("message") or dumps_compact(backend_error)
        inferred_code = infer_error_code(message)
        code = fallback_code if inferred_code == "UNKNOWN" else inferred_code
        die_mcp(code, message, backend_error=backend_error)

    def on_attempt_error(err, attempt, total):
        cause_code = getattr(getattr(err, "reason", None), "errno", None) or getattr(err, "errno", None) or "UNKNOWN_CAUSE"
        sys.stderr.write(f"[wind-mcp fetch retry {attempt}/{total}] {cause_code}: {err}\n")

    try:
        resp = fetch_with_retry(
            server["endpoint"],
            lambda _attempt: {
                "method": "POST",
                "headers": headers,
                "body": body,
                "timeout": timeout_ms / 1000,
            },
            attempts=3,
            delays_ms=[300, 1000],
            on_attempt_error=on_attempt_error if os.environ.get("WIND_DEBUG") == "1" else None,
        )
    except Exception as err:
        payload = {"message": str(err)}
        if getattr(err, "errno", None) is not None:
            payload["code"] = err.errno
        reason = getattr(err, "reason", None)
        if getattr(reason, "errno", None) is not None:
            payload["cause_code"] = reason.errno
        die_backend(payload, "NETWORK_ERROR")

    if not resp["ok"]:
        body_text = resp.get("text") or ""
        mapped = HTTP_ERROR_MAP.get(resp["status"])
        code = mapped[0] if mapped else "UNKNOWN"
        safe_body = redact_secrets(body_text)
        detail = f"HTTP {resp['status']} {resp['statusText']} (server={server_type})" + (f" | body: {safe_body[:200]}" if safe_body else "")
        backend_error = None
        try:
            backend_error = json.loads(body_text) if body_text else None
        except Exception:
            backend_error = {"message": safe_body[:2000]} if safe_body else None
        die_mcp(code, detail, backend_error=backend_error)

    text = resp["text"]
    try:
        payload = parse_sse(text)
    except Exception as err:
        die("TOOL_RUNTIME_ERROR", f"{err} (server={server_type})")

    rpc_error = payload.get("error") if isinstance(payload, dict) else None
    if js_truthy(rpc_error):
        if isinstance(rpc_error, str):
            msg = rpc_error
        elif isinstance(rpc_error, dict):
            msg = rpc_error.get("message") or dumps_compact(rpc_error)
        else:
            msg = dumps_compact(rpc_error)
        if re.search(r"^\s*OK\s*$", str(msg), re.I):
            die_mcp(
                "TOOL_RUNTIME_ERROR",
                f"JSON-RPC protocol conflict: payload.error is present but error message is \"OK\"; error={dumps_compact(rpc_error)[:1000]} (server={server_type})",
            )
        die_backend(rpc_error, "TOOL_RUNTIME_ERROR")

    result = payload.get("result") if isinstance(payload, dict) else None
    if isinstance(result, dict) and result.get("isError"):
        content = result.get("content")
        msg = content[0]["text"] if isinstance(content, list) and content and isinstance(content[0], dict) and "text" in content[0] else dumps_compact(result)
        if re.search(r"^\s*OK\s*$", str(msg), re.I):
            die_mcp(
                "TOOL_RUNTIME_ERROR",
                f"MCP result protocol conflict: isError=true but error text is \"OK\"; result={dumps_compact(result)[:1000]} (server={server_type})",
            )
        try:
            raw = json.loads(msg)
        except Exception:
            raw = {"message": msg}
        raw_error = raw.get("error") if isinstance(raw, dict) else None
        die_backend(raw_error if raw_error else raw, "TOOL_RUNTIME_ERROR")

    # 部分工具把业务错误包在 content[0].text 的 JSON 字符串里, 必须二次解析
    inner_text = None
    if isinstance(result, dict) and isinstance(result.get("content"), list) and result["content"]:
        first = result["content"][0]
        if isinstance(first, dict) and isinstance(first.get("text"), str):
            inner_text = first["text"]
    if isinstance(inner_text, str):
        try:
            inner = json.loads(inner_text)
        except Exception:
            inner = None
        if isinstance(inner, dict):
            if isinstance(inner.get("mcp_tool_error_code"), (int, float)) and not isinstance(inner.get("mcp_tool_error_code"), bool) and inner["mcp_tool_error_code"] != 0:
                msg = inner.get("mcp_tool_error_msg") or dumps_compact(inner)
                die_backend({"code": inner["mcp_tool_error_code"], "message": msg}, "TOOL_RUNTIME_ERROR")
            inner_error = inner.get("error")
            if isinstance(inner_error, dict) and (inner_error.get("code") or inner_error.get("message")) and not is_explicit_no_data_result(inner):
                error_message = inner_error.get("message") or dumps_compact(inner_error)
                inferred_code = infer_error_code(error_message)
                if business_payload_has_usable_data(inner) and inferred_code == "UNKNOWN":
                    response_warnings.append({
                        "code": "BACKEND_ERROR_WITH_DATA",
                        "backend_error": inner_error,
                        "message": "后端同时返回错误信息和可用数据；已保留数据并标记为部分成功，请勿忽略该警告。",
                    })
                else:
                    die_backend(inner_error, "TOOL_RUNTIME_ERROR")
            business_classification = classify_business_response(inner, server_type)
            if business_classification and business_classification.get("error"):
                code, message = business_classification["error"]
                die_mcp(code, message, backend_error=inner.get("data"))
            if business_classification and business_classification.get("warning"):
                response_warnings.append(business_classification["warning"])

    if response_warnings and isinstance(payload, dict) and isinstance(payload.get("result"), dict):
        payload["result"][INTERNAL_WARNINGS_KEY] = response_warnings
    return payload.get("result") if isinstance(payload, dict) else payload


def mcp_initialize_and_call(server_type, method, params, diagnostic_context=None):
    mcp_request(server_type, "initialize", {
        "protocolVersion": "2025-03-26",
        "capabilities": {},
        "clientInfo": {
            "name": SKILL_NAME,
            "version": SKILL_VERSION,
        },
    }, timeout_ms=30_000)

    return mcp_request(server_type, method, params, timeout_ms=600_000, diagnostic_context=diagnostic_context)


# section: 命令

def cmd_call(server_type, tool_name, params_input):
    if not server_type or not tool_name or not params_input:
        exit_with_usage(
            "用法：call <server_type> <tool_name> '<params_json>|@params_file'\n"
            f"可用 server_type: {' / '.join(SERVERS.keys())}\n"
            f"典型：\n  " + "\n  ".join(CALL_EXAMPLES),
            1,
        )

    try:
        params_source = load_params_input(params_input)
    except Exception as e:
        die("PARAMS_FILE_ERROR", str(e), 1, {
            "details": {"field": "params", "issue": "file_read_error", "source": "file", "file": getattr(e, "file", None)},
            "retry": {"allowed": True, "mode": "after_correction", "max_attempts": 1},
            "circuit_breaker": {"tripped": True, "scope": "remaining_batch", "action": "abort_remaining_calls"},
            "correction": {"change_only": ["params_file"], "strategy": "fix_file_path_or_permissions", "requires_user_input": False, "preserve_server_type": True, "preserve_tool_name": True},
        })

    try:
        args = json.loads(params_source["jsonText"])
    except Exception as e:
        source_detail = f"文件：{params_source['filePath']}" if params_source["source"] == "file" else f"原文：{params_source['jsonText'][:200]}"
        details = {
            "field": "params",
            "issue": "invalid_json",
            "source": params_source["source"],
            "message": str(e),
        }
        if params_source.get("filePath"):
            details["file"] = params_source["filePath"]
        die("INVALID_PARAMS_JSON", f"params JSON 解析失败：{e} | {source_detail}", 1, {
            "details": details,
            "retry": {"allowed": True, "mode": "after_correction", "max_attempts": 1},
            "circuit_breaker": {"tripped": True, "scope": "remaining_batch", "action": "abort_remaining_calls"},
            "correction": {"change_only": ["params_file_content" if params_source["source"] == "file" else "params_json"], "strategy": "fix_json_syntax", "requires_user_input": False, "preserve_server_type": True, "preserve_tool_name": True},
        })

    if not isinstance(args, dict):
        actual_type = "array" if isinstance(args, list) else js_typeof(args)
        die("PARAM_TYPE_ERROR", "params 必须是 JSON object", 1, {
            "details": [{"field": "params", "issue": "invalid_type", "expected_type": "object", "actual_type": actual_type}],
            "retry": {"allowed": True, "mode": "after_correction", "max_attempts": 1},
            "circuit_breaker": {"tripped": True, "scope": "remaining_batch", "action": "abort_remaining_calls"},
            "correction": {"change_only": ["params"], "strategy": "fix_from_error_details", "requires_user_input": False, "preserve_server_type": True, "preserve_tool_name": True},
        })

    original_args = {**args}
    normalized = normalize_call(server_type, tool_name, args)
    server_type = normalized["server_type"]
    tool_name = normalized["toolName"]
    args = normalized["args"]
    normalization_errors = normalized["normalizationErrors"]
    validate_tool_selection(server_type, tool_name)

    validation_errors = [*normalization_errors, *validate_basic_params(args)]
    params_shape_invalid = any(validation_error_code(error) == "PARAM_TYPE_ERROR" and isinstance(error, dict) and error.get("field") == "params" for error in validation_errors)
    if not params_shape_invalid:
        validation_errors.extend(validate_tool_params(tool_name, args))
    if validation_errors:
        explicit_code = next((c for c in (validation_error_code(error) for error in validation_errors) if c), None)
        messages = [validation_error_message(error) for error in validation_errors]
        has_type_error = any(isinstance(error, dict) and error.get("issue") == "invalid_type" for error in validation_errors)

        def detail_from_error(error):
            if isinstance(error, str):
                return {"message": error}
            return {k: v for k, v in error.items() if k not in ("code", "message")}

        change_only = []
        for error in validation_errors:
            if isinstance(error, dict) and error.get("field"):
                change_only.append(error["field"])
            elif isinstance(error, dict) and error.get("fields"):
                change_only.extend(error["fields"])
        change_only = list(dict.fromkeys(change_only))
        die(explicit_code or ("PARAM_TYPE_ERROR" if has_type_error else "PARAM_VALIDATION_ERROR"), "；".join(messages), 1, {
            "details": [detail_from_error(error) for error in validation_errors],
            "retry": {"allowed": True, "mode": "after_correction", "max_attempts": 1},
            "circuit_breaker": {"tripped": True, "scope": "remaining_batch", "action": "abort_remaining_calls"},
            "correction": {
                "change_only": change_only,
                "strategy": "fix_from_error_details",
                "requires_user_input": any(isinstance(error, dict) and error.get("issue") in ("ambiguous_value", "conflicting_aliases") for error in validation_errors),
                "preserve_server_type": True,
                "preserve_tool_name": True,
            },
        })

    result = mcp_initialize_and_call(server_type, "tools/call", {
        "name": tool_name,
        "arguments": args,
        "_meta": {"clientVersion": SKILL_VERSION},
    }, {
        "original_input": original_args.get("windcode") if isinstance(original_args, dict) else None,
        "normalized_input": args.get("windcode") if isinstance(args, dict) else None,
    })
    return {
        "server_type": server_type,
        "tool": tool_name,
        "result": result,
    }


def cmd_list_tools(server_type):
    if not server_type:
        exit_with_usage(
            "用法：list-tools <server_type>\n"
            f"可用 server_type: {' / '.join(SERVERS.keys())}",
            1,
        )
    get_server(server_type)
    result = mcp_initialize_and_call(server_type, "tools/list", {})
    data = {"server_type": server_type}
    if isinstance(result, dict):
        data.update(result)
    return data


def cmd_setup_key(*raw_args):
    if is_coze_wind_credential_present() or any(name.startswith("COZE_") for name in os.environ):
        die("SETUP_ERROR", "扣子平台请将 WIND_API_KEY 配成凭证变量（API Key，域名 mcp.wind.com.cn），不要使用 setup-key 把 Key 写进本地文件或对话。")
    key = raw_args[0] if raw_args else None

    if not key or key.startswith("--"):
        exit_with_usage(
            "用法：cli.py setup-key <KEY> --scope <global|skill>\n\n"
            "scope: global=全局共享；skill=仅当前 skill。调用前先让用户选择。",
            1,
        )

    scope = None
    for i in range(1, len(raw_args)):
        a = raw_args[i]
        if a == "--scope" and i + 1 < len(raw_args):
            scope = raw_args[i + 1]
            break
        if a.startswith("--scope="):
            scope = a[8:]
            break

    if not scope:
        exit_with_usage(
            "setup-key 缺 --scope 参数。\n\n"
            f"先让用户选择 global 或 skill，再重试：cli.py setup-key {mask_key(key)} --scope <global|skill>",
            1,
        )

    if scope not in ("global", "skill"):
        die("SETUP_ERROR", f"setup-key 未知 scope: {scope} (可选: global / skill)")

    file = None
    try:
        if scope == "global":
            directory = Path.home() / ".wind-aifinmarket"
            directory.mkdir(parents=True, exist_ok=True)
            file = directory / "config"
            lines = []
            if file.exists():
                lines = [l for l in file.read_text(encoding="utf-8").split("\n") if l and not re.search(r"^\s*(export\s+)?WIND_API_KEY\s*=", l)]
            lines.append(f"WIND_API_KEY={key}")
            write_file(file, "\n".join(lines) + "\n", mode=0o600)
        else:
            file = SKILL_DIR / "config.json"
            write_file(file, dumps_pretty({"wind_api_key": key}) + "\n", mode=0o600)
    except Exception as err:
        die("SETUP_ERROR", f"配置写入失败 (scope={scope}, path={file or 'n/a'}): {err}")

    return {
        "scope": scope,
        "path": str(file),
        "key_masked": mask_key(key),
        "next": "现在可以重试原 Wind 调用",
    }


def cmd_open_portal():
    platform = sys.platform
    if platform == "darwin":
        bin_name, args = "open", [PORTAL_URL]
    elif platform == "win32":
        bin_name, args = "cmd", ["/c", "start", "", PORTAL_URL]
    else:
        bin_name, args = "xdg-open", [PORTAL_URL]

    spawn_error = None
    try:
        child = subprocess.Popen([bin_name, *args], **popen_kwargs())
        time.sleep(0.3)
        code = child.poll()
        if code not in (None, 0):
            spawn_error = OSError(f"exit {code}")
    except Exception as err:
        spawn_error = err

    data = {
        "url": PORTAL_URL,
        "platform": platform,
        "spawn_command": f"{bin_name} {' '.join(args)}",
        "flow_note": "未登录时会自动跳转到登录页（/#/login）；登录完成后回到 overview 页面即可获取 API Key。",
        "fallback_message": f"如果浏览器没有自动弹出，请手动访问：{PORTAL_URL}",
    }
    if spawn_error:
        die("SETUP_ERROR", f"本地无法启动浏览器: {spawn_error} | 用户应手动打开 {data['url']}")
    return data


# 诊断: 扣子上不再报告 npx skills update 状态
def cmd_diagnose():
    return {
        "platform": sys.platform,
        "python_pid": os.getpid(),
        "update": "disabled",
        "note": "扣子技能更新由平台部署/商店负责，CLI 不执行 npx skills update。",
    }


# section: 主入口 — IS_MAIN guard 让单元测试 import 不副作用
def run_main():
    argv = sys.argv[1:]
    cmd = argv[0] if argv else None
    args = argv[1:]

    usage = (
        "wind-mcp-skill\n"
        "访问万得 Wind 金融数据（按数据域分类调用）\n\n"
        "用法:\n"
        "  cli.py call <server_type> <tool_name> '<params_json>|@params_file'\n"
        "  cli.py list-tools <server_type>                    # 获取后端官方工具描述和 inputSchema\n"
        "  cli.py open-portal                                # 打开万得开发者中心拿 API Key\n"
        "  cli.py setup-key <KEY> --scope <global|skill>     # 配置 API Key（先问用户存放位置）\n\n"
        "可用 server_type:\n"
        + "\n".join(f"  {k.ljust(20)}{v['label']}" for k, v in SERVERS.items())
        + "\n\n典型:\n  "
        + "\n  ".join(CALL_EXAMPLES)
    )

    def arg_at(index):
        return args[index] if index < len(args) else None

    commands = {
        "call": lambda: cmd_call(arg_at(0), arg_at(1), arg_at(2)),
        "list-tools": lambda: cmd_list_tools(arg_at(0)),
        "open-portal": lambda: cmd_open_portal(),
        "setup-key": lambda: cmd_setup_key(*args),
        "diagnose": lambda: cmd_diagnose(),
    }

    if not cmd:
        # help: 直接输出 USAGE 纯文本
        sys.stdout.write(usage + "\n")
        sys.exit(0)

    if cmd not in commands:
        die("USAGE_ERROR", f"未知命令: {cmd}\nUSAGE:\n{usage}")

    try:
        data = commands[cmd]()
        if cmd == "call":
            # call: 透传 result 内容 (parse JSON if applicable, else raw text)
            write_raw_call_success(
                data.get("result") if isinstance(data, dict) else None,
                {"server_type": data.get("server_type") if isinstance(data, dict) else None, "tool_name": data.get("tool") if isinstance(data, dict) else None},
            )
            sys.stdout.flush()
            # 扣子不在 call 后触发本地 skills update
            # trigger_update_check()
        else:
            # open-portal / setup-key: 直接输出结构化数据 (无 envelope 包裹)
            write_plain_success(data)
    except SystemExit:
        raise
    except Exception as err:
        stack = traceback.format_exc()
        detail = f"执行失败: {err}"
        if stack:
            detail += f" | stack: {stack[:300]}"
        die("UNKNOWN", detail)


if __name__ == "__main__":
    run_main()
