"""
金融数据查询脚本。

功能：
- 传入自然语言问句（--query）与指标（--indicators），先经实体识别判断查数路径。
- 识别实体数 <= 5：直接查数
- 识别实体数 > 5：批量查数
- 结果输出为 Excel 多 sheet 文件与 Markdown 文件。
"""

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

# █████████████████████████████████████████████████████████████████████████
# ██                                                                  ██
# ██   ███████╗███╗   ███╗     █████╗ ██████╗ ██╗    ██╗ ██████╗       ██
# ██   ██╔════╝████╗ ████║    ██╔══██╗██╔══██╗██║    ██║██╔═══██╗      ██
# ██   █████╗  ██╔████╔██║    ███████║██████╔╝██║ █╗ ██║██║   ██║      ██
# ██   ██╔══╝  ██║╚██╔╝██║    ██╔══██║██╔═══╝ ██║███╗██║██║   ██║      ██
# ██   ███████╗██║ ╚═╝ ██║    ██║  ██║██║     ╚███╔███╔╝╚██████╔╝      ██
# ██   ╚══════╝╚═╝     ╚═╝    ╚═╝  ╚═╝╚═╝      ╚══╝╚══╝  ╚═════╝       ██
# ██                                                                  ██
# ██                ⚠️  EM API KEY CONFIGURATION REQUIRED ⚠️           ██
# ██                                                                  ██
# ██         YOU MUST SET THE ENVIRONMENT VARIABLE BEFORE RUNNING     ██
# ██                                                                  ██
# ██                    ENV VARIABLE: EM_API_KEY                      ██
# ██                                                                  ██
# ██          Example (Linux / macOS):                                ██
# ██              export EM_API_KEY="your_em_api_key"                 ██
# ██                                                                  ██
# ██          Example (Windows PowerShell):                           ██
# ██              $env:EM_API_KEY="your_em_api_key"                   ██
# ██                                                                  ██
# █████████████████████████████████████████████████████████████████████████

EM_API_KEY = os.environ.get("EM_API_KEY", "")
if not EM_API_KEY:
    raise RuntimeError(
        """

╔══════════════════════════════════════════════════════════════╗
║                      EM API KEY REQUIRED                     ║
╠══════════════════════════════════════════════════════════════╣
║  Environment variable EM_API_KEY is not set.                 ║
║                                                              ║
║  Please configure the environment variable first:            ║
║                                                              ║
║  Linux / macOS:                                              ║
║      export EM_API_KEY="your_em_api_key"                     ║
║                                                              ║
║  Windows PowerShell:                                         ║
║      $env:EM_API_KEY="your_em_api_key"                       ║
║                                                              ║
║  Then run the program again.                                 ║
╚══════════════════════════════════════════════════════════════╝

"""
    )


DEFAULT_SEARCH_API_URL = (
    "https://ai-saas.eastmoney.com/proxy/b/mcp/tool/searchData"
)
DEFAULT_ENTITY_API_URL = (
    "https://ai-saas.eastmoney.com/proxy/entity/saas"
)
MAX_ENTITY_TAGS = 500
DIRECT_QUERY_ENTITY_LIMIT = 5
ENTITY_TAG_FIELDS = ("entityId", "secuCode", "marketChar", "fullName", "market", "classCode")
_ENTITY_CODE_RE = re.compile(r"\(([0-9A-Z.]+\.[A-Z]+)\)")


def _get_default_output_dir() -> Path:
    """
    返回默认输出目录路径。
    默认目录为当前工作目录下的 miaoxiang/mx_finance_data。
    仅负责路径拼接，不创建目录。
    """
    return Path.cwd() / "miaoxiang" / "mx_finance_data"


def _flatten_value(v: Any) -> str:
    """
    将任意值规范为字符串表示。
    对 dict/list 使用 JSON 序列化，None 转为空字符串。
    用于统一写表与展示时的字段格式。
    """
    if v is None:
        return ""
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


def _ordered_keys(table: Dict[str, Any], indicator_order: List[Any]) -> List[Any]:
    """
    按 indicator_order 生成指标键的输出顺序。
    先保留接口给定顺序，再追加未覆盖的数据键。
    返回去重后的最终键列表。
    """
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
    """
    规范化一行指标值长度与类型。
    先将原始值转字符串，再按列数补空或截断。
    返回长度固定的字符串列表。
    """
    values = [_flatten_value(v) for v in raw_values]
    if len(values) < expected_len:
        values.extend([""] * (expected_len - len(values)))
    return values[:expected_len]


def _return_code_map(block: Dict[str, Any]) -> Dict[str, str]:
    """
    从数据块中提取指标代码映射表。
    兼容 returnCodeMap/returnCodeNameMap/codeMap 三种字段名。
    若未找到有效映射则返回空字典。
    """
    for key in ("returnCodeMap", "returnCodeNameMap", "codeMap"):
        data = block.get(key)
        if isinstance(data, dict):
            return {str(k): _flatten_value(v) for k, v in data.items()}
    return {}


def _format_indicator_label(key: str, name_map: Dict[str, Any], code_map: Dict[str, str]) -> str:
    """
    生成指标键对应的展示名称。
    优先使用 nameMap，其次使用 codeMap，最后回退原始 key。
    纯数字且无映射时返回空字符串。
    """
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
    """
    将通用表结构转换为行记录列表。
    兼容 list/dict 等多种 table 形态，并尽量推断列名。
    返回可直接写入 DataFrame 的字典行数组。
    """
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
    """
    将单个 dataTableDTO 块转换为标准行数据与字段列表。
    优先按 headName + 指标顺序组装二维表，失败时回退通用解析。
    返回 (rows, fieldnames) 供后续写入 Excel。
    """
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


def _normalize_entity_tag(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    从实体识别结果中提取批量查数所需的实体字段。
    查数接口需要完整实体信息，仅传 entityId 时只会返回首个实体数据。
    """
    entity_id = _flatten_value(raw.get("entityId")).strip()
    if not entity_id:
        raise ValueError("实体识别结果缺少 entityId")
    tag: Dict[str, Any] = {"entityId": entity_id}
    for field in ENTITY_TAG_FIELDS:
        if field == "entityId":
            continue
        value = raw.get(field)
        if value not in (None, ""):
            tag[field] = _flatten_value(value)
    return tag


def _build_multi_entity_query(indicators: str) -> str:
    """多实体查数时，将指标拼为「选定实体的{indicators}」格式。"""
    return f"选定实体的{indicators.strip()}"


def _build_request_body(
        query: str,
        entity_tags: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    构建 searchData 接口请求体。
    自动生成 callId，并写入 userInfo.userId。
    若提供 entity_tags（实体数 > 5 时），则在 toolContext 中写入 toolPreTaskResultList。
    返回可直接用于 HTTP JSON 请求的字典对象。
    """
    call_id = f"call_{uuid.uuid4().hex[:8]}"
    user_id = f"user_{uuid.uuid4().hex[:8]}"

    tool_context: Dict[str, Any] = {
        "callId": call_id,
        "userInfo": {
            "userId": user_id,
        },
    }
    if entity_tags:
        tool_context["toolPreTaskResultList"] = [
            {
                "taskName": "股票基金筛选",
                "entityTagListMap": {
                    "1": entity_tags,
                },
            },
        ]

    return {
        "query": query,
        "toolContext": tool_context,
    }


def _extract_entity_tags_from_recognition_response(api_result: Any) -> List[Dict[str, Any]]:
    """
    从实体识别接口返回中提取实体 tag 列表。
    每个输入实体仅取第一个候选：entityMetricList 取每组首项，entityList 按顺序取各项。
    """
    if not isinstance(api_result, dict):
        return []

    data_node = api_result.get("data")
    if not isinstance(data_node, dict):
        return []

    raw_items: List[Dict[str, Any]] = []
    entity_metric_list = data_node.get("entityMetricList")
    if isinstance(entity_metric_list, list):
        for group in entity_metric_list:
            if isinstance(group, list) and group and isinstance(group[0], dict):
                raw_items.append(group[0])
    else:
        entity_list = data_node.get("entityList")
        if isinstance(entity_list, list):
            for item in entity_list:
                if isinstance(item, dict):
                    raw_items.append(item)

    tags: List[Dict[str, Any]] = []
    for item in raw_items:
        try:
            tags.append(_normalize_entity_tag(item))
        except ValueError:
            continue
    return tags


async def _recognize_entities(
        client: httpx.AsyncClient,
        query: str,
        api_key: str,
        entity_api_url: str,
) -> List[Dict[str, Any]]:
    """
    调用实体识别接口，将用户 query 作为 content 传入。
    每个实体仅取第一个候选，返回查数所需的实体 tag 列表。
    """
    resp = await client.post(
        entity_api_url,
        json={"content": query, "typeCodes": "002,006005,006006,006007,006001,006002,006009,006010,006011,006012,005101,005201,005202,005203,005204,016,001001,001002,003007,003005,003002,003003,003008,003006,003004,003001,003200,003100,007,008,004,010,003300,003400,003500,003600,003700"},
        headers={
            "Content-Type": "application/json",
            "em_api_key": api_key,
        },
    )
    resp.raise_for_status()
    data = resp.json()

    status_err = _check_business_status(data)
    if status_err:
        raise RuntimeError(status_err)

    entity_tags: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    for tag in _extract_entity_tags_from_recognition_response(data):
        entity_id = tag["entityId"]
        if entity_id not in seen:
            entity_tags.append(tag)
            seen.add(entity_id)

    return entity_tags[:MAX_ENTITY_TAGS]


def _safe_sheet_name(raw_name: Any, used_names: Set[str]) -> str:
    """
    生成合法且唯一的 Excel sheet 名称。
    会清洗非法字符、裁剪到 31 字符并处理重名后缀。
    返回最终可写入工作簿的 sheet 名。
    """
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


def _extract_entity_code(text: Any) -> Optional[str]:
    """从实体名称、sheet 名或列名中提取证券代码（如 300059.SZ）。"""
    match = _ENTITY_CODE_RE.search(_flatten_value(text))
    return match.group(1) if match else None


def _count_returned_entities(tables: List[Dict[str, Any]]) -> int:
    """
    统计查数结果中覆盖的唯一实体数量。
    从 sheet 名、列名及首列单元格中识别带证券代码的实体标识并去重。
    """
    codes: Set[str] = set()
    for table in tables:
        code = _extract_entity_code(table.get("sheet_name"))
        if code:
            codes.add(code)

        for field in table.get("fieldnames") or []:
            code = _extract_entity_code(field)
            if code:
                codes.add(code)

        fieldnames = table.get("fieldnames") or []
        rows = table.get("rows") or []
        if fieldnames and rows:
            first_col = fieldnames[0]
            for row in rows:
                code = _extract_entity_code(row.get(first_col, ""))
                if code:
                    codes.add(code)
    return len(codes)


def _get_raw_data_message(api_result: Any) -> Optional[str]:
    """提取接口 data.message 原文（未经脚本拼接）。"""
    if not isinstance(api_result, dict):
        return None
    data_node = api_result.get("data")
    if isinstance(data_node, dict):
        data_message = data_node.get("message")
        if isinstance(data_message, str) and data_message.strip():
            return data_message.strip()
    return None


def _api_message_indicates_truncation(api_result: Any) -> bool:
    """接口 message 已说明截断/权限/数据量上限时，不再重复输出脚本侧完整性警告。"""
    raw = _get_raw_data_message(api_result)
    if not raw:
        return False
    indicators = (
        "截断",
        "精简后的部分数据",
        "检测到您的数据范围较大",
        "权限不足",
        "数据量已达到上限",
    )
    return any(key in raw for key in indicators)


def _build_completeness_warning(recognized: int, returned: int) -> Optional[str]:
    """多实体查数时，若返回实体数少于识别成功数，生成完整性警告文案。"""
    if recognized <= 0 or returned >= recognized:
        return None
    missing = recognized - returned
    return (
        f"警告: 查数结果仅覆盖 {returned}/{recognized} 个实体，缺失 {missing} 个。"
        f"当前一次请求的数据量过大，多指标或大范围查询可能触发接口返回上限，部分数据可能会有缺失，建议拆分 query 或分批查数。"
    )


def _extract_data_table_dto_list(api_result: Any) -> Tuple[Optional[List[Any]], Optional[str]]:
    """
    从接口返回中提取 dataTableDTOList 列表。
    兼容新结构 data.searchDataResultDTO.dataTableDTOList。
    同时兼容旧结构 dataTableDTOList 与 data.dataTableDTOList。
    """
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
    """
    校验接口业务状态是否成功。
    兼容常见成功语义：code/status 为 200、0（含字符串）或缺失。
    返回 None 表示通过，否则返回可读错误信息。
    """
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
    """
    提取接口错误 message（仅使用 data.message）。
    返回去除首尾空白后的字符串；无有效内容则返回 None。
    """
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
    """
    解析接口返回并抽取可落盘的表格数据。
    遍历 dataTableDTOList 生成 sheet 信息、条件说明与总行数。
    返回 (tables, condition_parts, total_rows, error) 四元组。
    """
    dto_list, extract_err = _extract_data_table_dto_list(api_result)
    if extract_err:
        return [], [], 0, extract_err
    if not dto_list:
        return [], [], 0, "接口返回的 dataTableDTOList 为空（多实体查数请确认 toolPreTaskResultList 格式正确）"

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


def _escape_md_cell(value: Any) -> str:
    """转义 Markdown 表格单元格中的特殊字符。"""
    text = _flatten_value(value)
    return text.replace("|", "\\|").replace("\n", " ").strip()


def _rows_to_markdown_table(rows: List[Dict[str, Any]], fieldnames: List[str]) -> str:
    """将行数据转为 Markdown 表格字符串。"""
    if not fieldnames:
        return ""
    header = "| " + " | ".join(_escape_md_cell(h) for h in fieldnames) + " |"
    separator = "| " + " | ".join("---" for _ in fieldnames) + " |"
    body_lines = [
        "| " + " | ".join(_escape_md_cell(row.get(col, "")) for col in fieldnames) + " |"
        for row in rows
    ]
    return "\n".join([header, separator, *body_lines])


def _tables_to_markdown(tables: List[Dict[str, Any]]) -> str:
    """将多 sheet 表格数据转为 Markdown，每个 sheet 使用二级标题。"""
    sections: List[str] = []
    for table in tables:
        sheet_name = _flatten_value(table["sheet_name"]).strip() or "数据"
        md_table = _rows_to_markdown_table(table["rows"], table["fieldnames"])
        if md_table:
            sections.append(f"## {sheet_name}\n\n{md_table}")
    return "\n\n".join(sections)


def _write_output_files(
        *,
        output_dir: Path,
        tables: List[Dict[str, Any]],
) -> Tuple[Path, Path]:
    """
    将解析后的查询结果写入本地文件。
    输出一个 Excel 多 sheet 文件与一个 Markdown 文件（内容与 Excel 一致，按 sheet 分标题）。
    返回 (excel_path, md_path)。
    """
    unique_suffix = uuid.uuid4().hex[:8]
    file_path = output_dir / f"mx_finance_data_{unique_suffix}.xlsx"
    md_path = output_dir / f"mx_finance_data_{unique_suffix}.md"

    with pd.ExcelWriter(file_path, engine="openpyxl") as writer:
        for table in tables:
            df = pd.DataFrame(table["rows"], columns=table["fieldnames"])
            df.to_excel(writer, sheet_name=table["sheet_name"], index=False)

    md_path.write_text(_tables_to_markdown(tables), encoding="utf-8")
    return file_path, md_path


def _make_result_base(query_text: str) -> Dict[str, Any]:
    """
    构造统一的返回结果基础结构。
    初始化路径字段、行数字段与原始查询文本。
    用于成功与异常场景的统一返回格式。
    """
    return {
        "file_path": None,
        "csv_path": None,
        "description_path": None,  # 兼容字段，指向 Markdown 结果文件
        "md_path": None,
        "row_count": 0,
        "returned_entity_count": 0,
        "query": query_text,
    }


async def query_mx_finance_data(
        query: str,
        indicators: Optional[str] = None,
        output_dir: Optional[Path] = None,
        api_base: Optional[str] = None,
        entity_api_base: Optional[str] = None,
) -> Dict[str, Any]:
    """
    执行金融数据主查询流程并输出文件结果。
    先对 query 做实体识别：<=5 个实体直接查数，>5 个实体通过 entity tags 查数。
    多实体查数时，查数接口 query 使用「选定实体的{indicators}」。
    返回包含文件路径、行数及错误信息的结果字典。
    """
    output_dir = output_dir or _get_default_output_dir()
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    url = api_base or DEFAULT_SEARCH_API_URL
    entity_api_url = entity_api_base or DEFAULT_ENTITY_API_URL
    result = _make_result_base(query)
    entity_tags: Optional[List[Dict[str, Any]]] = None

    try:
        api_key = EM_API_KEY
        async with httpx.AsyncClient(timeout=120.0) as client:
            recognized_tags = await _recognize_entities(
                client=client,
                query=query,
                api_key=api_key,
                entity_api_url=entity_api_url,
            )
            recognized_count = len(recognized_tags)
            result["recognized_entity_count"] = recognized_count
            if recognized_count > DIRECT_QUERY_ENTITY_LIMIT:
                if not indicators or not indicators.strip():
                    result["error"] = (
                        "多实体查数（识别实体数 > 5）缺少 --indicators，"
                        "请从 query 中提取金融指标后传入，用于构造「选定实体的{indicators}」"
                    )
                    return result
                entity_tags = recognized_tags
                result["use_entity_tags"] = True
                search_query = _build_multi_entity_query(indicators)
                result["indicators"] = indicators.strip()
                result["search_query"] = search_query
            else:
                result["use_entity_tags"] = False
                search_query = query
                if indicators and indicators.strip():
                    result["indicators"] = indicators.strip()
            body = _build_request_body(search_query, entity_tags=entity_tags)
            resp = await client.post(
                url,
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "em_api_key": api_key,
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
        if preferred_message and err.startswith("接口返回的 dataTableDTOList 为空"):
            result["error"] = f"{preferred_message}\n（{err}）"
        else:
            result["error"] = preferred_message or err
        result["raw_preview"] = json.dumps(data, ensure_ascii=False)[:500]
        return result

    try:
        file_path_out, md_path = _write_output_files(
            output_dir=output_dir,
            tables=tables,
        )
    except ModuleNotFoundError as exc:
        result["error"] = f"写入 Excel 失败，缺少依赖: {exc.name}"
        return result
    except Exception as exc:
        result["error"] = f"写入结果文件失败: {exc!s}"
        return result

    result["file_path"] = str(file_path_out)
    result["csv_path"] = str(file_path_out)  # 兼容旧字段名
    result["md_path"] = str(md_path)
    result["description_path"] = str(md_path)
    result["row_count"] = total_rows
    result["returned_entity_count"] = _count_returned_entities(tables)
    recognized = result.get("recognized_entity_count", 0)
    completeness_warning = _build_completeness_warning(
        recognized, result["returned_entity_count"]
    )
    if completeness_warning and not _api_message_indicates_truncation(data):
        result["completeness_warning"] = completeness_warning
    return result


async def query_mx_finance_data_direct(
        query: str,
        indicators: Optional[str] = None,
        output_dir: Optional[Path] = None,
        api_base: Optional[str] = None,
) -> Dict[str, Any]:
    """
    直接查询入口，兼容外部旧调用方式。
    参数与返回值与 query_mx_finance_data 保持一致。
    内部仅做透明转发，不额外处理逻辑。
    """
    return await query_mx_finance_data(
        query=query,
        indicators=indicators,
        output_dir=output_dir,
        api_base=api_base,
    )


def run_cli() -> None:
    """
    命令行执行入口。
    负责参数解析、异步调用主查询流程并输出执行结果。
    发生参数或运行错误时返回对应退出码。
    """
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        description="金融数据查数：传入自然语言 query，自动识别实体后查数并导出 Excel 与 Markdown。"
    )
    parser.add_argument("--query", required=True, help="查询问句（自然语言，含实体与指标）")
    parser.add_argument(
        "--indicators",
        help="从 query 提取的金融指标；多实体查数时拼为「选定实体的{indicators}」",
    )
    args = parser.parse_args()
    query = args.query.strip()
    if not query:
        print("错误: 缺少查询文本", file=sys.stderr)
        parser.print_help(sys.stderr)
        sys.exit(1)
    indicators = args.indicators.strip() if args.indicators else None

    out_dir = _get_default_output_dir()

    async def _main() -> None:
        try:
            result = await query_mx_finance_data(
                query=query,
                indicators=indicators,
                output_dir=out_dir,
            )
        except Exception as exc:
            print(f"错误: {exc}", file=sys.stderr)
            sys.exit(1)

        if "error" in result:
            print(f"错误: {result['error']}", file=sys.stderr)
            sys.exit(2)

        print(f"识别实体数: {result.get('recognized_entity_count', 0)}")
        if result.get("use_entity_tags"):
            print(f"查数模式: 多实体")
            if result.get("search_query"):
                print(f"查数问句: {result['search_query']}")
        else:
            print(f"查数模式: 直接查数")
        print(f"返回实体数: {result.get('returned_entity_count', 0)}")
        if "completeness_warning" in result:
            print(result["completeness_warning"], file=sys.stderr)
        if "message" in result:
            print(f"提示: {result['message']}")
        print(f"文件: {result['file_path'] or result['csv_path']}")
        print(f"Markdown: {result.get('md_path') or result['description_path']}")
        print(f"表格行数: {result['row_count']}")

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_main())
    finally:
        loop.close()


if __name__ == "__main__":
    run_cli()