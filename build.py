#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
打包成 Windows 免安装版
=======================
    python build.py

产物：dist/六级冲刺/六级冲刺.exe
整个 `六级冲刺` 文件夹就是成品，压缩后发给别人，解压双击即可运行。
学习进度存在 exe 同级的 userdata/progress.db，整个文件夹拷走就带走了进度。

需要先装依赖：
    pip install pywebview pyinstaller pillow
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NAME = "六级冲刺"
ICON = ROOT / "assets" / "icon.ico"
DIST = ROOT / "dist"
BUILD = ROOT / "build"

# Windows 专用：不弹黑框、单目录模式（onedir 启动快，onefile 每次都要解压到临时目录）
SEP = ";" if os.name == "nt" else ":"


def main() -> int:
    if not ICON.exists():
        print("缺少图标 assets/icon.ico，先跑 tools/make_icon.py")
        return 1

    for d in (DIST, BUILD):
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm", "--clean",
        "--onedir",
        "--windowed",
        "--name", NAME,
        "--icon", str(ICON),
        "--add-data", f"{ROOT / 'web'}{SEP}web",
        "--add-data", f"{ROOT / 'data'}{SEP}data",
        "--distpath", str(DIST),
        "--workpath", str(BUILD),
        "--specpath", str(BUILD),
        # pywebview 的 Windows 后端靠 pythonnet 调 WebView2，这三个不显式带上会被裁掉
        "--hidden-import", "webview.platforms.winforms",
        "--hidden-import", "clr",
        "--hidden-import", "clr_loader",
        "--collect-submodules", "webview",
        str(ROOT / "app.py"),
    ]

    print("开始打包…")
    r = subprocess.run(cmd, cwd=str(ROOT))
    if r.returncode != 0:
        print("打包失败")
        return r.returncode

    exe = DIST / NAME / f"{NAME}.exe"
    if not exe.exists():
        print(f"没找到产物：{exe}")
        return 1

    size = sum(f.stat().st_size for f in (DIST / NAME).rglob("*") if f.is_file())
    print()
    print(f"完成：{exe}")
    print(f"目录大小：{size / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
