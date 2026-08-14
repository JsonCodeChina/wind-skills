#!/usr/bin/env python3
# Daily background updater for wind-mcp-skill.
# The CLI starts this script detached; failures are recorded but never block data calls.

import hashlib
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else SCRIPT_DIR.parent
SKILL_SCRIPTS_DIR = SKILL_DIR / "scripts"
LOCK_FILE = SKILL_SCRIPTS_DIR / "update.lock"
SKILL_NAME = SKILL_DIR.name
DEFAULT_SOURCES = [
    "Wind-Information-Co-Ltd/wind-skills",
    "git@gitee.com:wind_info/wind-skills.git",
]
LOCK_STALE_MS = 30 * 60 * 1000
QUIET_MS = 10 * 1000
MAX_WAIT_MS = 10 * 60 * 1000


def dumps_pretty(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2)


def iso_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def today_key():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def spawn_kwargs():
    kwargs = {}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    return kwargs


def normalize_path(value):
    normalized = str(Path(value).resolve()).replace("\\", "/")
    return normalized.lower() if sys.platform == "win32" else normalized


def update_scope():
    global_root = normalize_path(Path.home() / ".agents" / "skills")
    skill_dir = normalize_path(SKILL_DIR)
    return "global" if skill_dir.startswith(f"{global_root}/") else "project"


def project_root():
    return (SKILL_DIR / ".." / ".." / "..").resolve()


def unique_paths(paths):
    seen = set()
    result = []
    for path in (Path(value).resolve() for value in paths if value):
        key = normalize_path(path)
        if key in seen:
            continue
        seen.add(key)
        result.append(str(path))
    return result


def update_command():
    command = ["npx", "skills", "update", SKILL_NAME, "-y"]
    if update_scope() == "global":
        command.append("-g")
    return command


def project_lock_candidates():
    roots = [str(project_root()), os.getcwd(), os.environ.get("INIT_CWD")]
    current = SKILL_DIR.resolve()
    while True:
        roots.append(str(current))
        parent = current.parent
        if parent == current:
            break
        current = parent
    return unique_paths([str(Path(root) / "skills-lock.json") for root in roots if root])


def global_lock_candidates():
    xdg = os.environ.get("XDG_STATE_HOME")
    return unique_paths([
        str(Path(xdg) / "skills" / ".skill-lock.json") if xdg else None,
        str(Path.home() / ".agents" / ".skill-lock.json"),
    ])


def lock_file_candidates():
    global_candidates = global_lock_candidates()
    project_candidates = project_lock_candidates()
    if update_scope() == "global":
        return unique_paths([*global_candidates, *project_candidates])
    return unique_paths([*project_candidates, *global_candidates])


def read_lock_info():
    candidates = lock_file_candidates()
    first_existing_file = None
    for file in candidates:
        try:
            if not Path(file).exists():
                continue
            if first_existing_file is None:
                first_existing_file = file
            data = json.loads(Path(file).read_text(encoding="utf-8"))
            entry = None
            if isinstance(data, dict) and isinstance(data.get("skills"), dict):
                entry = data["skills"].get(SKILL_NAME)
            if entry:
                return {"file": file, "entry": entry, "candidates": candidates}
        except Exception:
            pass
    return {
        "file": first_existing_file or (candidates[0] if candidates else None),
        "entry": None,
        "candidates": candidates,
    }


def read_lock_entry():
    return read_lock_info()["entry"]


def is_gitee_source(entry):
    if not isinstance(entry, dict):
        values = []
    else:
        values = [entry.get("sourceType"), entry.get("source"), entry.get("sourceUrl")]
    values = [str(value).lower() for value in values if value]
    return any("gitee" in value for value in values)


def source_url(entry):
    if not entry:
        return None
    if entry.get("sourceUrl"):
        return entry["sourceUrl"]
    source = entry.get("source") or ""
    if entry.get("sourceType") == "github" and re_full_repo(source):
        return f"https://github.com/{source}.git"
    if entry.get("sourceType") in ("gitee", "git") and re_full_repo(source):
        return f"https://gitee.com/{source}.git"
    return entry.get("source") or None


def re_full_repo(source):
    return bool(re.search(r"^[^/\s]+/[^/\s]+$", source or ""))


def update_env():
    return os.environ.copy()


def remote_head(entry):
    source = source_url(entry)
    if not source:
        return None
    try:
        result = subprocess.run(
            ["git", "ls-remote", source, "HEAD"],
            capture_output=True,
            text=True,
            env=update_env(),
            timeout=60,
            **spawn_kwargs(),
        )
        if result.returncode != 0:
            return None
        head = (result.stdout or "").strip().split()[0] if (result.stdout or "").strip() else ""
        return head if re.search(r"^[0-9a-f]{40}$", head, re.I) else None
    except Exception:
        return None


def add_command_for_source(source):
    if not source:
        return None
    command = ["npx", "skills", "add", source, "--skill", SKILL_NAME, "-y"]
    if update_scope() == "global":
        command.append("-g")
    return command


def add_command(entry):
    return add_command_for_source(source_url(entry))


def fallback_add_commands(entry):
    sources = [source_url(entry), *DEFAULT_SOURCES]
    seen = set()
    result = []
    for source in sources:
        if not source:
            continue
        key = str(source).lower()
        if key in seen:
            continue
        seen.add(key)
        command = add_command_for_source(source)
        if command:
            result.append(command)
    return result


def command_for_update():
    entry = read_lock_entry()
    if is_gitee_source(entry):
        command = add_command(entry)
        if command:
            return {
                "command": command,
                "method": "add",
                "sourceType": entry.get("sourceType") if isinstance(entry, dict) else None,
            }
    return {
        "command": update_command(),
        "method": "update",
        "sourceType": entry.get("sourceType") if isinstance(entry, dict) else None,
    }


def update_state_file():
    return SKILL_SCRIPTS_DIR / "update-state.json"


def read_state():
    try:
        state_file = update_state_file()
        if not state_file.exists():
            return None
        return json.loads(state_file.read_text(encoding="utf-8"))
    except Exception:
        return None


def already_updated_today():
    state = read_state()
    if not state or state.get("date") != today_key() or state.get("status") != "success":
        return False
    entry = read_lock_entry()
    if not entry or is_gitee_source(entry):
        return True
    head = remote_head(entry)
    return not head or head == state.get("lastAppliedRemoteHead")


def last_used_at():
    try:
        state = read_state()
        raw = state.get("lastUsedAt") if state else None
        if not raw:
            return 0
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        ts = dt.timestamp() * 1000
        return ts if ts == ts else 0
    except Exception:
        return 0


def quiet_long_enough():
    last = last_used_at()
    return last == 0 or (time.time() * 1000) - last >= QUIET_MS


def wait_for_quiet_window():
    started_at = time.time() * 1000
    while not quiet_long_enough():
        if (time.time() * 1000) - started_at >= MAX_WAIT_MS:
            return False
        time.sleep(QUIET_MS / 1000)
    return True


def acquire_lock():
    try:
        SKILL_SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
        try:
            st = LOCK_FILE.stat()
            if (time.time() * 1000) - (st.st_mtime * 1000) > LOCK_STALE_MS:
                LOCK_FILE.unlink()
        except Exception:
            pass
        return os.open(str(LOCK_FILE), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except Exception:
        return None


def release_lock(fd):
    try:
        if fd is not None:
            os.close(fd)
    except Exception:
        pass
    try:
        LOCK_FILE.unlink()
    except Exception:
        pass


def write_state(patch):
    info = command_for_update()
    command, method, source_type = info["command"], info["method"], info["sourceType"]
    lock = read_lock_info()
    state_file = update_state_file()
    state = {
        "date": today_key(),
        "scope": update_scope(),
        "lockFile": lock["file"],
        "lockFound": bool(lock["entry"]),
        "command": " ".join(command),
        "method": method,
        "sourceType": source_type,
        "updatedAt": iso_now(),
        **patch,
    }
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(f"{dumps_pretty(state)}\n", encoding="utf-8")


def hash_skill_dir():
    digest = hashlib.sha256()
    files = []

    def walk(directory):
        for entry in Path(directory).iterdir():
            full = entry
            rel = str(full.relative_to(SKILL_DIR)).replace("\\", "/")
            if rel in ("config.json", "scripts/update-state.json"):
                continue
            if entry.is_dir():
                walk(full)
            elif entry.is_file():
                files.append({"full": full, "rel": rel})

    walk(SKILL_DIR)
    files.sort(key=lambda item: item["rel"])
    for file in files:
        digest.update(file["rel"].encode("utf-8"))
        digest.update(b"\0")
        digest.update(file["full"].read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def run_skill_command(command, method):
    cwd = str(Path.home()) if update_scope() == "global" else str(project_root())
    is_win = sys.platform == "win32"
    bin_name = "cmd.exe" if is_win else "npx"
    args = ["/d", "/s", "/c", " ".join(command)] if is_win else command[1:]
    try:
        result = subprocess.run(
            [bin_name, *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            env=update_env(),
            timeout=10 * 60,
            **spawn_kwargs(),
        )
        spawn_error = None
        status = result.returncode
        stdout = result.stdout or ""
        stderr = result.stderr or ""
    except Exception as err:
        spawn_error = err
        status = None
        stdout = ""
        stderr = ""
        result = type("Result", (), {"returncode": None, "stdout": "", "stderr": ""})()
    output = f"{stdout}{stderr}".strip()
    failed_by_output = bool(re.search(r"failed to (update|add|install)|No installed skills found matching", output, re.I))
    if spawn_error:
        error = str(spawn_error)
    elif failed_by_output:
        error = f"npx skills {method} reported failure"
    else:
        error = None
    return {
        "command": command,
        "method": method,
        "result": result,
        "output": output,
        "ok": status == 0 and not failed_by_output,
        "error": error,
    }


def run_update():
    entry = read_lock_entry()
    info = command_for_update()
    command, method, source_type = info["command"], info["method"], info["sourceType"]
    state = read_state()
    before_remote_head = remote_head(entry)
    remote_changed = bool(before_remote_head and before_remote_head != (state or {}).get("lastAppliedRemoteHead"))
    before_hash = hash_skill_dir()
    attempt = run_skill_command(command, method)
    used_fallback = False
    fallback_reason = None

    if ((not attempt["ok"] or (attempt["ok"] and remote_changed and before_hash == hash_skill_dir())) and method != "add"):
        fallback_commands = fallback_add_commands(entry)
        if fallback_commands:
            fallback_reason = (
                "remote changed but update did not change local files" if entry and attempt["ok"]
                else "update failed" if entry
                else "lock entry missing or update did not find installed skill"
            )
            outputs = [attempt["output"]] if attempt["output"] else []
            used_fallback = True
            for fallback_command in fallback_commands:
                fallback = run_skill_command(fallback_command, "add")
                outputs.append(fallback["output"])
                attempt = {
                    **fallback,
                    "output": "\n\n--- fallback: npx skills add ---\n\n".join(item for item in outputs if item),
                    "error": None if fallback["ok"] else (fallback["error"] or attempt["error"]),
                }
                if fallback["ok"]:
                    break

    after_hash = hash_skill_dir()
    write_state({
        "status": "success" if attempt["ok"] else "failed",
        "finishedAt": iso_now(),
        "exitCode": attempt["result"].returncode,
        "method": attempt["method"],
        "usedFallback": used_fallback,
        "fallbackReason": fallback_reason,
        "sourceType": source_type,
        "command": " ".join(attempt["command"]),
        "error": attempt["error"],
        "remoteHead": before_remote_head,
        "remoteChanged": remote_changed,
        "lastAppliedRemoteHead": (before_remote_head or (state or {}).get("lastAppliedRemoteHead") or None) if attempt["ok"] else ((state or {}).get("lastAppliedRemoteHead") or None),
        "changed": before_hash != after_hash,
        "beforeHash": before_hash,
        "afterHash": after_hash,
        "output": attempt["output"][-2000:],
    })


def main():
    if already_updated_today():
        return
    fd = acquire_lock()
    if fd is None:
        return
    try:
        if already_updated_today():
            return
        if not wait_for_quiet_window():
            write_state({
                "status": "deferred",
                "finishedAt": iso_now(),
                "exitCode": None,
                "error": "skill kept being used; update deferred after max wait",
                "changed": False,
            })
            return
        write_state({
            "status": "updating",
            "startedAt": iso_now(),
            "exitCode": None,
            "changed": False,
        })
        run_update()
    finally:
        release_lock(fd)


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        try:
            write_state({
                "status": "failed",
                "finishedAt": iso_now(),
                "exitCode": None,
                "error": str(getattr(err, "message", err) or err),
                "changed": False,
            })
        except Exception:
            pass
