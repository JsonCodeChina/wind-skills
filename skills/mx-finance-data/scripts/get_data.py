"""使用自然语言请求金融数据，并将结果整理为 Excel 与说明文件。"""

import argparse
import asyncio
import json
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx
import pandas as pd


DATA_SERVICE_KEY = os.environ.get("EM_API_KEY", "em_eaRnxyWlMUiriR0Tj2m79QtUtxjTU0hQ").strip()
DEFAULT_QUERY_ENDPOINT = (
    "https://ai-saas.eastmoney.com/proxy/b/mcp/tool/searchData"
)
VERIFY_SSL = os.environ.get("MX_FINANCE_VERIFY_SSL", "true").strip().lower() not in {"0", "false", "no"}

def _get_default_output_dir() -> Path:
    """计算默认结果目录；目录创建由主查询流程负责。"""
    return Path.cwd() / "miaoxiang" / "mx_finance_data"


def _flatten_value(v: Any) -> str:
    """把接口值转换为适合写入表格的文本。"""
    if v is None:
        return ""
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


def _ordered_keys(table: Dict[str, Any], indicator_order: List[Any]) -> List[Any]:
    """遵循接口给出的指标顺序，并补充其余未列出的键。"""
    data_keys = [k for k in table.keys() if k != "headName"]
    key_map = {str(k): k for k in data_keys}
    preferred: List[Any] = []
    seen: Set[str] = set()
    for key in indicator_order:
        key_str = str(key)
        if key_str in key_map and key_str not in seen:
            preferred.append(key_map[key_str])
            seen.add(key_str)
    for key in data_keys:
        key_str = str(key)
        if key_str not in seen:
            preferred.append(key)
            seen.add(key_str)
    return preferred


def _normalize_values(raw_values: List[Any], expected_len: int) -> List[str]:
    """将一行数据文本化，并补齐或裁剪到指定列数。"""
    values = [_flatten_value(v) for v in raw_values]
    if len(values) < expected_len:
        values.extend([""] * (expected_len - len(values)))
    return values[:expected_len]


def _return_code_map(block: Dict[str, Any]) -> Dict[str, str]:
    """从兼容字段中读取指标代码与展示名称的映射。"""
    for key in ("returnCodeMap", "returnCodeNameMap", "codeMap"):
        data = block.get(key)
        if isinstance(data, dict):
            return {str(k): _flatten_value(v) for k, v in data.items()}
    return {}


def _format_indicator_label(key: str, name_map: Dict[str, Any], code_map: Dict[str, str]) -> str:
    """按名称映射、代码映射和原始键的优先级生成指标标签。"""
    mapped = name_map.get(key)
    if mapped is None and key.isdigit():
        mapped = name_map.get(int(key))
    if mapped not in (None, ""):
        return _flatten_value(mapped)
    mapped_code = code_map.get(key)
    if mapped_code not in (None, ""):
        return _flatten_value(mapped_code)
    if key.isdigit():
        return ""
    return key


def _table_to_rows_generic(table: Any, name_map: Optional[Dict[str, str]]) -> List[Dict[str, Any]]:
    """将列表或字典形式的通用表结构整理为行记录。"""
    name_map = name_map or {}
    if isinstance(table, list):
        if not table:
            return []
        if isinstance(table[0], dict):
            rows = table
        else:
            rows = [
                dict(zip([f"column_{i}" for i in range(len(table[0]))], row))
                for row in table
            ]
    elif isinstance(table, dict):
        vals = [v for v in table.values() if isinstance(v, list)]
        if vals and all(isinstance(v, list) for v in table.values()):
            n = len(vals[0])
            if all(len(v) == n for v in vals):
                cols = list(table.keys())
                rows = [dict(zip(cols, [v[i] for v in table.values()])) for i in range(n)]
            else:
                rows = []
        else:
            cols = table.get("columns") or table.get("fields") or []
            rows_data = table.get("rows") or table.get("data") or []
            if not cols and rows_data:
                cols = [f"column_{i}" for i in range(len(rows_data[0]))]
            rows = [dict(zip(cols, r)) for r in rows_data]
    else:
        return []

    return [{name_map.get(k, k): _flatten_value(v) for k, v in row.items()} for row in rows]


def _table_to_rows(block: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """解析单个数据块，返回可写入 Excel 的记录和字段列表。"""
    table = block.get("table") or {}
    name_map = block.get("nameMap") or {}
    if isinstance(name_map, list):
        name_map = {str(i): v for i, v in enumerate(name_map)}
    elif not isinstance(name_map, dict):
        name_map = {}

    if not isinstance(table, dict):
        rows = _table_to_rows_generic(table, name_map)
        fieldnames = list(rows[0].keys()) if rows else []
        return rows, fieldnames

    headers = table.get("headName") or []
    if not isinstance(headers, list):
        headers = []
    order = _ordered_keys(table, block.get("indicatorOrder") or [])
    entity_name = _flatten_value(block.get("entityName") or "") or "指标"
    code_map = _return_code_map(block)

    rows: List[Dict[str, Any]] = []
    data_key_count = len([key for key in table.keys() if key != "headName"])

    if len(headers) > 1 and data_key_count >= 1:
        fieldnames = [entity_name] + [_flatten_value(h) for h in headers]
        for key in order:
            raw_values = table.get(key, [])
            if not isinstance(raw_values, list):
                raw_values = [raw_values]
            values = _normalize_values(raw_values, len(headers))
            label = _format_indicator_label(str(key), name_map, code_map)
            rows.append(dict(zip(fieldnames, [label] + values)))
        return rows, fieldnames

    if len(headers) == 1 and data_key_count >= 1:
        fieldnames = [entity_name, _flatten_value(headers[0])]
        for key in order:
            raw_values = table.get(key, [])
            value = raw_values[0] if isinstance(raw_values, list) and raw_values else raw_values
            label = _format_indicator_label(str(key), name_map, code_map)
            rows.append({fieldnames[0]: label, fieldnames[1]: _flatten_value(value)})
        return rows, fieldnames

    fallback_rows = _table_to_rows_generic(table, name_map)
    if fallback_rows:
        return fallback_rows, list(fallback_rows[0].keys())
    return [], []


def _build_request_body(query: str) -> Dict[str, Any]:
    """创建包含唯一调用标识和用户标识的请求载荷。"""
    request_id = f"call_{uuid.uuid4().hex[:8]}"
    visitor_id = f"user_{uuid.uuid4().hex[:8]}"
    
    return {
        "query": query,
        "toolContext": {
            "callId": request_id,
            "userInfo": {
                "userId": visitor_id,
            },
        },
    }


def _safe_sheet_name(raw_name: Any, used_names: Set[str]) -> str:
    """清理工作表名称，并在重名时追加序号。"""
    name = _flatten_value(raw_name).strip() or "表"
    name = re.sub(r"[:\\/?*\[\]]", "_", name)
    if len(name) > 31:
        name = name[:31]

    base = name or "表"
    candidate = base
    idx = 2
    while candidate in used_names:
        suffix = f"_{idx}"
        if len(base) + len(suffix) > 31:
            candidate = base[: 31 - len(suffix)] + suffix
        else:
            candidate = base + suffix
        idx += 1
    used_names.add(candidate)
    return candidate


def _extract_data_table_dto_list(api_result: Any) -> Tuple[Optional[List[Any]], Optional[str]]:
    """兼容多种响应层级并提取 dataTableDTOList。"""
    if not isinstance(api_result, dict):
        return None, "接口返回不是 JSON 对象"

    dto_list = api_result.get("dataTableDTOList")
    if isinstance(dto_list, list):
        return dto_list, None

    data_node = api_result.get("data")
    if isinstance(data_node, dict):
        search_result = data_node.get("searchDataResultDTO")
        if isinstance(search_result, dict):
            dto_list = search_result.get("dataTableDTOList")
            if isinstance(dto_list, list):
                return dto_list, None

        dto_list = data_node.get("dataTableDTOList")
        if isinstance(dto_list, list):
            return dto_list, None

    return None, "接口返回中无 data.searchDataResultDTO.dataTableDTOList"


def _check_business_status(api_result: Any) -> Optional[str]:
    """检查业务状态码；成功返回 None，失败返回说明文本。"""
    if not isinstance(api_result, dict):
        return "接口返回不是 JSON 对象"

    code = api_result.get("code")
    status = api_result.get("status")
    success_values = (None, 0, 200, "0", "200")
    if code not in success_values or status not in success_values:
        message = _flatten_value(api_result.get("message") or "业务状态非成功")
        return f"接口业务错误: code={code}, status={status}, message={message}"
    return None


def _extract_preferred_message(api_result: Any) -> Optional[str]:
    """读取服务端提示，并补充数据范围或用量限制说明。"""
    if not isinstance(api_result, dict):
        return None
    data_node = api_result.get("data")
    if isinstance(data_node, dict):
        data_message = data_node.get("message")
        if isinstance(data_message, str) and data_message.strip():
            message = data_message.strip()
            if "检测到您的数据范围较大，由于系统限制，现为您返回的是精简后的部分数据" in message:
                message += (
                    "\n免费用户仅支持查询3年范围的数据。本次请求的时间范围超出了权限限制，"
                    "系统已自动将查询范围调整为3年。如需查询更长时间范围的历史数据，请联系客服电话400-620-1818。"
                )
            else:
                message += "\n您的请求数据量已达到上限，如需继续使用，请联系客服电话400-620-1818"
            return message
    return None


def _parse_data_table_response(
        api_result: Any,
) -> Tuple[List[Dict[str, Any]], List[str], int, Optional[str]]:
    """把响应中的数据块转换为工作表集合、条件说明和总行数。"""
    dto_list, extract_err = _extract_data_table_dto_list(api_result)
    if extract_err:
        return [], [], 0, extract_err
    if not dto_list:
        return [], [], 0, "接口返回的 dataTableDTOList 为空"

    condition_parts: List[str] = []
    tables: List[Dict[str, Any]] = []
    total_rows = 0
    used_sheet_names: Set[str] = set()

    for i, dto in enumerate(dto_list):
        if not isinstance(dto, dict):
            continue

        sheet_name = _safe_sheet_name(
            dto.get("title") or dto.get("inputTitle") or dto.get("entityName") or f"表{i + 1}",
            used_sheet_names,
            )
        condition = dto.get("condition")
        if condition is not None and condition != "":
            entity = dto.get("entityName") or sheet_name
            condition_parts.append(f"[{entity}]\n{condition}")

        rows, fieldnames = _table_to_rows(dto)
        if not rows:
            continue
        tables.append({"sheet_name": sheet_name, "rows": rows, "fieldnames": fieldnames})
        total_rows += len(rows)

    if not tables:
        return [], condition_parts, 0, "dataTableDTOList 中无有效 table 数据"
    return tables, condition_parts, total_rows, None


def _write_output_files(
        *,
        output_dir: Path,
        query_text: str,
        tables: List[Dict[str, Any]],
        total_rows: int,
        condition_parts: List[str],
) -> Tuple[Path, Path]:
    """写入多工作表 Excel 和配套说明文本。"""
    result_id = uuid.uuid4().hex[:8]
    file_path = output_dir / f"mx_finance_data_{result_id}.xlsx"
    desc_path = output_dir / f"mx_finance_data_{result_id}_description.txt"

    with pd.ExcelWriter(file_path, engine="openpyxl") as writer:
        for table in tables:
            df = pd.DataFrame(table["rows"], columns=table["fieldnames"])
            df.to_excel(writer, sheet_name=table["sheet_name"], index=False)

    description_lines = [
        "金融数据查询结果说明",
        "=" * 40,
        f"查询内容: {query_text}",
        f"数据文件路径: {file_path}",
        f"描述文件路径: {desc_path}",
        f"数据行数: {total_rows}",
        f"表数量: {len(tables)}",
        f"Sheet 列表: {', '.join([t['sheet_name'] for t in tables])}",
        ]
    desc_path.write_text("\n".join(description_lines), encoding="utf-8")
    return file_path, desc_path


def _make_result_base(query_text: str) -> Dict[str, Any]:
    """初始化成功与失败流程共用的返回字段。"""
    return {
        "file_path": None,
        "csv_path": None,
        "description_path": None,
        "row_count": 0,
        "query": query_text,
    }


async def query_mx_finance_data(
        query: str,
        output_dir: Optional[Path] = None,
        api_base: Optional[str] = None,
) -> Dict[str, Any]:
    """请求金融数据，校验响应并生成本地结果文件。"""
    output_dir = output_dir or _get_default_output_dir()
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    url = api_base or DEFAULT_QUERY_ENDPOINT
    result = _make_result_base(query)

    try:
        request_body = _build_request_body(query)
        service_key = DATA_SERVICE_KEY
        async with httpx.AsyncClient(timeout=30.0, verify=VERIFY_SSL) as client:
            resp = await client.post(
                url,
                json=request_body,
                headers={
                    "Content-Type": "application/json",
                    "em_api_key": service_key,
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        result["error"] = f"HTTP 错误: {exc.response.status_code} - {exc.response.text[:200]}"
        return result
    except Exception as exc:
        result["error"] = f"请求失败: {exc!s}"
        return result

    status_err = _check_business_status(data)
    if status_err:
        preferred_message = _extract_preferred_message(data)
        result["raw_response"] = json.dumps(data, ensure_ascii=False)
        result["error"] = preferred_message or status_err
        result["raw_preview"] = json.dumps(data, ensure_ascii=False)[:500]
        return result

    preferred_message = _extract_preferred_message(data)
    if preferred_message:
        result["message"] = preferred_message

    tables, condition_parts, total_rows, err = _parse_data_table_response(data)
    if err:
        preferred_message = _extract_preferred_message(data)
        result["raw_response"] = json.dumps(data, ensure_ascii=False)
        result["error"] = preferred_message or err
        result["raw_preview"] = json.dumps(data, ensure_ascii=False)[:500]
        return result

    try:
        file_path, desc_path = _write_output_files(
            output_dir=output_dir,
            query_text=query,
            tables=tables,
            total_rows=total_rows,
            condition_parts=condition_parts,
        )
    except ModuleNotFoundError as exc:
        result["error"] = f"写入 Excel 失败，缺少依赖: {exc.name}"
        return result
    except Exception as exc:
        result["error"] = f"写入结果文件失败: {exc!s}"
        return result

    result["file_path"] = str(file_path)
    result["csv_path"] = str(file_path)  # 兼容旧字段名
    result["description_path"] = str(desc_path)
    result["row_count"] = total_rows
    return result


async def query_mx_finance_data_direct(
        query: str,
        output_dir: Optional[Path] = None,
        api_base: Optional[str] = None,
) -> Dict[str, Any]:
    """保留旧入口名称，并透明转发到主查询函数。"""
    return await query_mx_finance_data(query=query, output_dir=output_dir, api_base=api_base)


def _resolve_query_arg(args: argparse.Namespace) -> str:
    """合并位置参数及兼容选项，得到最终查询文本。"""
    if args.query_opt and args.metric and args.query_opt.strip() != args.metric.strip():
        raise ValueError("--query 与 --metric 同时提供且内容不一致")
    query = args.query_opt or args.metric or args.query
    if not query:
        raise ValueError("缺少查询文本")
    return query.strip()


def run_cli() -> None:
    """解析命令行参数，执行查询并打印结果文件信息。"""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="输入自然语言金融数据需求并导出 Excel 结果。")
    parser.add_argument("query", nargs="?", help="自然语言查询内容")
    parser.add_argument("--query", dest="query_opt", help="显式指定查询内容")
    parser.add_argument("--metric", help="兼容旧参数；等价于 --query")
    args = parser.parse_args()

    try:
        query = _resolve_query_arg(args)
    except ValueError as exc:
        print(f"错误: {exc}", file=sys.stderr)
        parser.print_help(sys.stderr)
        sys.exit(1)

    out_dir = _get_default_output_dir()

    async def _main() -> None:
        try:
            result = await query_mx_finance_data(query=query, output_dir=out_dir)
        except Exception as exc:
            print(f"错误: {exc}", file=sys.stderr)
            sys.exit(1)

        if "error" in result:
            print(f"错误: {result['error']}", file=sys.stderr)
            sys.exit(2)

        if "message" in result:
            print(f"提示: {result['message']}")
        print(f"文件: {result['file_path'] or result['csv_path']}")
        print(f"描述: {result['description_path']}")
        print(f"行数: {result['row_count']}")

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_main())
    finally:
        loop.close()


if __name__ == "__main__":
    run_cli()
