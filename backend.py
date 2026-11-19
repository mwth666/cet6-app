#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
后端：词库加载、进度存取、本地 HTTP 接口
==========================================

桌面版（app.py）在后台起一个只监听 127.0.0.1 的 HTTP 服务，原生窗口里加载
前端页面，页面通过 /api/* 读写数据。之所以不用「前端直接调 Python 函数」的
桥接方式，是因为词库有 1.7MB，走 HTTP 可以顺带拿到 gzip 和 ETag，窗口启动
第一屏明显更快；接口边界也更清楚，前端换回浏览器调试时一行不用改。

对外只暴露三个函数：

    init_db()              建表
    start_in_thread(port) 起服务，返回 (httpd, 实际端口)
    stop(httpd)            停服务

其余都是内部实现。
"""

from __future__ import annotations

import gzip
import hashlib
import json
import mimetypes
import os
import sqlite3
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# --------------------------------------------------------------------------
# 路径：源码运行时以项目根为准；打包后以 PyInstaller 的解包目录为准
# --------------------------------------------------------------------------

def _bundle_dir() -> Path:
    """只读资源（web/ data/）所在目录。"""
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent


def _user_dir() -> Path:
    """
    可写的用户数据目录。优先放在程序旁边（绿色版，拷走就能带走进度）；
    如果程序装在 Program Files 这类没写权限的地方，退到 %LOCALAPPDATA%。

    设置环境变量 CET6_USER_DIR 可以指到别处，测试脚本用这个避免碰真进度。
    """
    override = os.environ.get("CET6_USER_DIR")
    if override:
        d = Path(override)
        d.mkdir(parents=True, exist_ok=True)
        return d
    if getattr(sys, "frozen", False):
        cand = Path(sys.executable).parent / "userdata"
    else:
        cand = Path(__file__).resolve().parent / "userdata"
    try:
        cand.mkdir(parents=True, exist_ok=True)
        probe = cand / ".write-test"
        probe.write_bytes(b"1")
        probe.unlink()
        return cand
    except OSError:
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home())
        fallback = base / "CET6Sprint"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback


BASE_DIR = _bundle_dir()
DATA_DIR = BASE_DIR / "data"
WEB_DIR = BASE_DIR / "web"
USER_DIR = _user_dir()
DB_PATH = USER_DIR / "progress.db"

# 单个请求体上限，防止误传超大文件把内存吃满
MAX_BODY = 32 * 1024 * 1024

_lock = threading.Lock()


# --------------------------------------------------------------------------
# 词库与内容（只读，加载一次后驻留内存）
# --------------------------------------------------------------------------

_cache: dict[str, tuple[bytes, str]] = {}


def _load_bytes(path: Path, key: str) -> tuple[bytes, str]:
    """读取并缓存文件内容，同时算出 ETag 供缓存协商。"""
    if key in _cache:
        return _cache[key]
    raw = path.read_bytes()
    etag = '"' + hashlib.md5(raw).hexdigest()[:16] + '"'
    _cache[key] = (raw, etag)
    return _cache[key]


def words_payload() -> tuple[bytes, str]:
    """全量词库。5301 词，约 1.7MB，压缩后约 500KB。"""
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


def has_words() -> bool:
    return (DATA_DIR / "words.json").exists()


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

_KV_KEYS = ("settings", "screen", "fav", "days", "drafts", "screenPos")


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.execute("PRAGMA journal_mode=WAL")
    return con


def init_db() -> None:
    USER_DIR.mkdir(parents=True, exist_ok=True)
    con = db()
    try:
        con.executescript(SCHEMA)
        con.commit()
    finally:
        con.close()


def read_state() -> dict:
    """把整份学习进度读出来，格式与前端 store 一一对应。"""
    state = {k: (v.copy() if isinstance(v, dict) else list(v) if isinstance(v, list) else v)
             for k, v in DEFAULT_STATE.items()}
    con = db()
    try:
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
    finally:
        con.close()
    return state


def write_patch(patch: dict) -> int:
    """
    增量写入。前端每次只上报改动的部分，避免整份 530KB 反复传输。
    patch 里出现 srs 就按词逐条 upsert；其他键整体覆盖。
    """
    n = 0
    with _lock:
        con = db()
        try:
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

            for key in _KV_KEYS:
                if key in patch:
                    con.execute(
                        "INSERT INTO kv(k, v) VALUES(?, ?) "
                        "ON CONFLICT(k) DO UPDATE SET v = excluded.v",
                        (key, json.dumps(patch[key], ensure_ascii=False, separators=(",", ":"))),
                    )
                    n += 1
            con.commit()
        finally:
            # 显式关闭：连接挂着不放，Windows 上会锁住 .db 文件，
            # 导致「备份 / 删除整个文件夹」时报“另一个程序正在使用此文件”
            con.close()
    return n


def reset_state() -> None:
    with _lock:
        con = db()
        try:
            con.execute("DELETE FROM srs")
            con.execute("DELETE FROM kv")
            con.commit()
        finally:
            con.close()


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
    server_version = "CET6Local/2.0"

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
        self._send(200, body, ctype, cache="no-cache")

    # ---------- GET 接口 ----------

    def _api_get(self, path: str) -> None:
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
            patch = {k: state[k] for k in _KV_KEYS if k in state}
            if isinstance(state.get("srs"), dict):
                patch["srs"] = state["srs"]
            write_patch(patch)
            return self._json({"ok": True, "words": len(patch.get("srs") or {})})

        return self._err(404, f"未知接口 {path}")


# --------------------------------------------------------------------------
# 启动 / 停止
# --------------------------------------------------------------------------

class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False


def start_in_thread(port: int = 0) -> tuple[Server, int]:
    """
    起一个只监听 127.0.0.1 的服务。port=0 时由系统分配空闲端口，
    多个窗口 / 多份拷贝同时开也不会撞端口。

    allow_reuse_address 关掉了：Windows 上开着它会让两个进程悄悄绑同一个
    端口，第二个的请求被第一个接走，症状是「新窗口显示旧数据」。
    """
    init_db()
    httpd = Server(("127.0.0.1", port), Handler)
    th = threading.Thread(target=httpd.serve_forever, name="cet6-http", daemon=True)
    th.start()
    return httpd, httpd.server_address[1]


def stop(httpd: Server | None) -> None:
    if httpd is None:
        return
    try:
        httpd.shutdown()
        httpd.server_close()
    except Exception:  # noqa: BLE001
        pass
