#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
六级冲刺 · 桌面版
==================
双击启动，开一个原生窗口，界面由本地前端渲染，数据存在程序旁边的
userdata/progress.db。没有浏览器、没有地址栏、没有端口要记。

源码运行：
    pip install pywebview
    python app.py

打包成 exe：
    python build.py
"""

from __future__ import annotations

import ctypes
import sys
import traceback

APP_ID = "mwth666.cet6-sprint"
APP_TITLE = "六级冲刺"
WIN_W, WIN_H = 1200, 860
WIN_MIN = (920, 640)


# --------------------------------------------------------------------------
# 只允许开一个窗口
# --------------------------------------------------------------------------
# 双击两次会开出两个窗口，两边各自往同一个 sqlite 写，很容易看不懂
# 「为什么刚背的词没算进去」。用一个文件锁挡掉第二个。

_lock_handle = None


def _acquire_single_instance(user_dir) -> bool:
    global _lock_handle
    if not sys.platform.startswith("win"):
        return True
    try:
        import msvcrt
        path = user_dir / "app.lock"
        fh = open(path, "a+")
        msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
        _lock_handle = fh  # 进程活着就一直持有，退出时由系统释放
        return True
    except OSError:
        return False


def _tell_running() -> None:
    """已经在跑的时候给个提示，而不是静默退出让人觉得没反应。"""
    try:
        ctypes.windll.user32.MessageBoxW(
            None,
            "六级冲刺已经在运行了，看看任务栏。",
            APP_TITLE,
            0x40,  # MB_ICONINFORMATION
        )
    except Exception:  # noqa: BLE001
        pass


# --------------------------------------------------------------------------
# 启动
# --------------------------------------------------------------------------

MISSING_HTML = """
<!doctype html><meta charset="utf-8">
<style>
  body { font: 15px/1.7 "Microsoft YaHei", sans-serif; color: #2b3446;
         background: #f5f7fb; display: flex; align-items: center;
         justify-content: center; height: 100vh; margin: 0; }
  .box { max-width: 460px; background: #fff; border-radius: 16px; padding: 28px 32px;
         box-shadow: 0 18px 50px -30px rgba(30,48,80,.5); }
  h1 { font-size: 18px; margin: 0 0 10px; }
  code { background: #eef2f9; padding: 1px 5px; border-radius: 4px; }
  p { margin: 8px 0; }
</style>
<div class="box">
  <h1>缺少词库文件</h1>
  <p>找不到 <code>data/words.json</code>，程序没法启动。</p>
  <p>如果你下载的是压缩包，解压后请保持 <code>data</code>、<code>web</code>
     目录和主程序在同一个文件夹里，不要只把 exe 单独拖出来。</p>
</div>
"""


def main() -> int:
    try:
        import backend
    except Exception:  # noqa: BLE001
        _fatal("后端模块加载失败", traceback.format_exc())
        return 1

    if not backend.has_words():
        import webview
        webview.create_window(APP_TITLE, html=MISSING_HTML,
                             width=560, height=360, background_color="#F5F7FB")
        webview.start()
        return 1

    if not _acquire_single_instance(backend.USER_DIR):
        _tell_running()
        return 0

    # 任务栏图标用 exe 自己的，而不是 python.exe 的
    if sys.platform.startswith("win"):
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
        except Exception:  # noqa: BLE001
            pass

    try:
        import webview
    except ImportError:
        _fatal(
            "缺少 pywebview",
            "这是桌面版，需要 pywebview 才能开窗口：\n\n    pip install pywebview\n\n"
            "如果你拿到的是打包好的版本，说明文件没解压完整。",
        )
        return 1

    httpd, port = backend.start_in_thread(port=0)
    url = f"http://127.0.0.1:{port}/"

    window = webview.create_window(
        APP_TITLE,
        url,
        width=WIN_W,
        height=WIN_H,
        min_size=WIN_MIN,
        background_color="#F5F7FB",
        text_select=True,
    )

    # 关窗口就把后台服务一起收掉，不然进程会留在任务管理器里
    window.events.closed += lambda: backend.stop(httpd)

    try:
        webview.start(private_mode=False)
    finally:
        backend.stop(httpd)
    return 0


def _fatal(title: str, detail: str) -> None:
    """没有窗口可用时，也别只往 stderr 写——双击启动根本看不到控制台。"""
    msg = f"{title}\n\n{detail}"
    try:
        ctypes.windll.user32.MessageBoxW(None, msg, APP_TITLE, 0x10)  # MB_ICONERROR
    except Exception:  # noqa: BLE001
        sys.stderr.write(msg + "\n")


if __name__ == "__main__":
    sys.exit(main())
