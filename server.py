#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
六级冲刺 · 本地版
==================
一个跑在自己电脑上的英语六级备考工具：背单词（语境记忆 + 间隔重复）、
听力、阅读、写作、翻译四个模块的专项练习。

设计原则
--------
1. 零第三方依赖：只用 Python 标准库，clone 下来 `python server.py` 就能跑。
   不需要 pip install，不会踩虚拟环境 / 版本冲突的坑。
2. 数据在本机：学习进度存在 userdata/progress.db（SQLite），卸载重装不丢，
   也可以随时通过「我的 → 导出备份」拿到一份 JSON。
3. 不联网：除首次加载页面外不产生任何外部请求，断网可用。

启动方式
--------
    python server.py              # 自动打开浏览器，端口 8765
    python server.py --port 9000  # 指定端口
    python server.py --no-open    # 不自动开浏览器

按 Ctrl+C 停止。
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import mimetypes
import os
import sqlite3
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
WEB_DIR = ROOT / "web"
USER_DIR = ROOT / "userdata"
DB_PATH = USER_DIR / "progress.db"

# 单个 HTTP 请求体上限，防止误传超大文件把内存吃满
MAX_BODY = 32 * 1024 * 1024

_lock = threading.Lock()


# --------------------------------------------------------------------------
# 词库与内容（只读，加载一次后驻留内存）
# --------------------------------------------------------------------------

_cache: dict[str, tuple[bytes, str]] = {}


def _load_bytes(path: Path, key: str) -> tuple[bytes, str]:
    """读取并缓存文件内容，同时算出 ETag 供浏览器缓存协商。"""
    if key in _cache:
        return _cache[key]
    raw = path.read_bytes()
    etag = '"' + hashlib.md5(raw).hexdigest()[:16] + '"'
    _cache[key] = (raw, etag)
    return _cache[key]


def words_payload() -> tuple[bytes, str]:
    """全量词库。5301 词，约 1.7MB，压缩后约 500KB，本地传输可忽略。"""
    return _load_bytes(DATA_DIR / "words.json", "words")


def content_payload() -> tuple[bytes, str]:
    """听力 / 阅读 / 写作 / 翻译四个模块的全部练习内容，合并成一份。"""
    if "content" in _cache:
        return _cache["content"]
    merged = {}
    for name in ("listen", "read", "write", "translate"):
        p = DATA_DIR / "content" / f"{name}.json"
        if p.exists():
            merged[name] = json.loads(p.read_text("utf-8"))
    raw = json.dumps(merged, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    etag = '"' + hashlib.md5(raw).hexdigest()[:16] + '"'
    _cache["content"] = (raw, etag)
    return _cache["content"]


# --------------------------------------------------------------------------
# 数据库：学习进度
# --------------------------------------------------------------------------
# 两张表就够了：
#   srs(i, j)  每个词的间隔重复记录，j 是 JSON（字段以后要加，不用改表结构）
#   kv(k, v)   其余零散状态：设置、筛词结果、收藏、每日统计、草稿、阅读位置

SCHEMA = """
CREATE TABLE IF NOT EXISTS srs (
    i    INTEGER PRIMARY KEY,
    j    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
    k    TEXT PRIMARY KEY,
    v    TEXT NOT NULL
);
"""

DEFAULT_STATE = {
    "settings": {},
    "screen": {},
    "fav": [],
    "days": {},
    "drafts": {},
    "screenPos": {},
}


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.execute("PRAGMA journal_mode=WAL")
    return con


def init_db() -> None:
    USER_DIR.mkdir(parents=True, exist_ok=True)
    with db() as con:
        con.executescript(SCHEMA)


def read_state() -> dict:
    """把整份学习进度读出来，格式与前端 store 一一对应。"""
    state = {k: (v.copy() if isinstance(v, dict) else list(v) if isinstance(v, list) else v)
             for k, v in DEFAULT_STATE.items()}
    with db() as con:
        for k, v in con.execute("SELECT k, v FROM kv"):
            try:
                state[k] = json.loads(v)
            except json.JSONDecodeError:
                pass
        srs = {}
        for i, j in con.execute("SELECT i, j FROM srs"):
            try:
                srs[str(i)] = json.loads(j)
            except json.JSONDecodeError:
                pass
        state["srs"] = srs
    return state


def write_patch(patch: dict) -> int:
    """
    增量写入。前端每次只上报改动的部分，避免整份 530KB 反复传输。
    patch 里出现 srs 就按词逐条 upsert；其他键整体覆盖。
    """
    n = 0
    with _lock, db() as con:
        srs = patch.get("srs")
        if isinstance(srs, dict) and srs:
            rows = [(int(k), json.dumps(v, separators=(",", ":")))
                    for k, v in srs.items() if str(k).lstrip("-").isdigit()]
            con.executemany(
                "INSERT INTO srs(i, j) VALUES(?, ?) "
                "ON CONFLICT(i) DO UPDATE SET j = excluded.j",
                rows,
            )
            n += len(rows)

        for key in ("settings", "screen", "fav", "days", "drafts", "screenPos"):
            if key in patch:
                con.execute(
                    "INSERT INTO kv(k, v) VALUES(?, ?) "
                    "ON CONFLICT(k) DO UPDATE SET v = excluded.v",
                    (key, json.dumps(patch[key], ensure_ascii=False, separators=(",", ":"))),
                )
                n += 1
    return n


def reset_state() -> None:
    with _lock, db() as con:
        con.execute("DELETE FROM srs")
        con.execute("DELETE FROM kv")


# --------------------------------------------------------------------------
# HTTP 处理
# --------------------------------------------------------------------------

MIME_OVERRIDE = {
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "CET6Local/1.0"

    # ---------- 工具方法 ----------

    def _send(self, status: int, body: bytes, ctype: str,
              etag: str | None = None, cache: str = "no-cache") -> None:
        if etag and self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.end_headers()
            return

        accept = self.headers.get("Accept-Encoding", "")
        gz = len(body) > 1024 and "gzip" in accept
        payload = gzip.compress(body, 6) if gz else body

        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", cache)
        if gz:
            self.send_header("Content-Encoding", "gzip")
        if etag:
            self.send_header("ETag", etag)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def _json(self, obj, status: int = 200) -> None:
        body = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8")

    def _err(self, status: int, msg: str) -> None:
        self._json({"ok": False, "error": msg}, status)

    def _body(self) -> dict:
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return {}
        if n <= 0:
            return {}
        if n > MAX_BODY:
            raise ValueError("请求体过大")
        raw = self.rfile.read(n)
        try:
            obj = json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}
        return obj if isinstance(obj, dict) else {}

    def log_message(self, fmt, *args):  # 静音默认日志，只保留错误
        pass

    # ---------- 路由 ----------

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path.startswith("/api/"):
                return self._api_get(path)
            return self._static(path)
        except Exception as exc:  # noqa: BLE001  兜底，避免单个请求打挂服务
            sys.stderr.write(f"[GET {path}] {type(exc).__name__}: {exc}\n")
            self._err(500, "服务器内部错误")

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if not path.startswith("/api/"):
                return self._err(404, "接口不存在")
            return self._api_post(path)
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(f"[POST {path}] {type(exc).__name__}: {exc}\n")
            self._err(500, "服务器内部错误")

    # ---------- 静态文件 ----------

    def _static(self, path: str) -> None:
        if path in ("/", ""):
            path = "/index.html"
        rel = path.lstrip("/")
        target = (WEB_DIR / rel).resolve()
        # 防路径穿越：解析后必须仍在 web 目录内
        if not str(target).startswith(str(WEB_DIR.resolve())) or not target.is_file():
            return self._err(404, "页面不存在")

        ctype = MIME_OVERRIDE.get(target.suffix.lower())
        if ctype is None:
            ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        body = target.read_bytes()
        # 数据与代码用强缓存 + ETag 协商，保证改完刷新即生效
        self._send(200, body, ctype, cache="no-cache")

    # ---------- GET 接口 ----------

    def _api_get(self, path: str) -> None:
        q = parse_qs(urlparse(self.path).query)

        if path == "/api/words":
            raw, etag = words_payload()
            return self._send(200, raw, "application/json; charset=utf-8",
                              etag=etag, cache="no-cache")

        if path == "/api/content":
            raw, etag = content_payload()
            return self._send(200, raw, "application/json; charset=utf-8",
                              etag=etag, cache="no-cache")

        if path == "/api/state":
            return self._json(read_state())

        if path == "/api/export":
            payload = json.dumps({
                "app": "cet6-sprint",
                "version": 1,
                "exportedAt": int(time.time() * 1000),
                "state": read_state(),
            }, ensure_ascii=False, indent=1).encode("utf-8")
            stamp = time.strftime("%Y%m%d-%H%M")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Disposition",
                             f'attachment; filename="cet6-backup-{stamp}.json"')
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            return self.wfile.write(payload)

        if path == "/api/ping":
            return self._json({"ok": True, "t": int(time.time() * 1000)})

        return self._err(404, f"未知接口 {path}")

    # ---------- POST 接口 ----------

    def _api_post(self, path: str) -> None:
        body = self._body()

        if path == "/api/patch":
            patch = body.get("patch") if isinstance(body.get("patch"), dict) else body
            n = write_patch(patch)
            return self._json({"ok": True, "saved": n})

        if path == "/api/reset":
            reset_state()
            return self._json({"ok": True})

        if path == "/api/import":
            state = body.get("state") if isinstance(body.get("state"), dict) else body
            if not isinstance(state, dict) or not state:
                return self._err(400, "备份内容为空或格式不对")
            reset_state()
            patch = {k: state[k] for k in
                     ("settings", "screen", "fav", "days", "drafts", "screenPos")
                     if k in state}
            if isinstance(state.get("srs"), dict):
                patch["srs"] = state["srs"]
            write_patch(patch)
            return self._json({"ok": True, "words": len(patch.get("srs") or {})})

        return self._err(404, f"未知接口 {path}")


# --------------------------------------------------------------------------
# 启动
# --------------------------------------------------------------------------

def find_port(start: int, tries: int = 20) -> int:
    """端口被占用时自动往后找一个可用的。"""
    import socket
    for p in range(start, start + tries):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    raise SystemExit(f"端口 {start}–{start + tries} 都被占用了，请用 --port 换一个")


def main() -> None:
    # Windows 控制台默认 GBK，避免打印中文炸掉
    try:
        sys.stdout.reconfigure(encoding="utf-8")   # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass

    ap = argparse.ArgumentParser(description="六级冲刺 · 本地版")
    ap.add_argument("--port", type=int, default=8765, help="监听端口，默认 8765")
    ap.add_argument("--no-open", action="store_true", help="不要自动打开浏览器")
    args = ap.parse_args()

    if not (DATA_DIR / "words.json").exists():
        raise SystemExit(f"找不到词库：{DATA_DIR / 'words.json'}\n请确认 data 目录完整。")

    init_db()
    port = find_port(args.port)
    url = f"http://127.0.0.1:{port}/"

    print()
    print("  六级冲刺 · 本地版已启动")
    print("  " + "-" * 40)
    print(f"  地址：{url}")
    print(f"  数据：{DB_PATH}")
    print("  停止：按 Ctrl+C")
    print()

    if not args.no_open:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  已停止。进度都存好了，下次接着学。\n")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
