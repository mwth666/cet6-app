#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全路由巡检：用无头 Chrome 逐个打开每个页面 / 每种模式，
dump 出渲染后的 DOM，检查是否有渲染异常、空白页、兜底报错。

判定标准（三条都要过）：
  1. 不含前端兜底文案（「这一页出错了」等）
  2. DOM 长度不低于阈值（空白壳说明渲染函数没产出内容）
  3. 至少命中一个该页应有的文案关键词

用法：
  python tools/smoke_routes.py
  python tools/smoke_routes.py --chrome "C:/path/to/chrome.exe"

前提：server.py 已在 8765 端口运行（--port 可改）。
"""

import argparse
import os
import subprocess
import sys
import tempfile

DEFAULT_CHROME = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
]

BASE = "http://127.0.0.1:8765/"
MIN_DOM = 1500

# (名称, hash 路径, 任一命中即可的关键词元组)
ROUTES = [
    # 背单词主线
    ("今日任务", "/home", ("今日", "倒计时")),
    ("学习-介绍", "/study", ("记住了", "第 1 /", "搭配")),
    ("快速筛词", "/screen", ("认识", "筛")),
    ("单词详情", "/word/0", ("掌握记录", "例句")),

    # 词库
    ("词库-按页", "/list", ("第 ", "每页")),
    ("词库-按主题", "/list?tab=cat", ("主题", "类")),
    ("词库-错词", "/list?tab=wrong", ("错词", "没做过")),
    ("词库-收藏", "/list?tab=fav", ("收藏",)),
    ("词库-搜索", "/list?tab=search", ("搜索",)),
    ("词库-非法tab回落", "/list?tab=xxxxx", ("第 ", "每页")),

    # 听力
    ("听力-入口", "/listen", ("信号词", "听写")),
    ("听力-真题听写", "/listen?mode=dictation", ("听写", "播放")),
    ("听力-听音选词", "/listen?mode=wordpick", ("听", "播放")),
    ("听力-信号词", "/listen?mode=signal", ("转折", "因果")),
    ("听力-短对话", "/listen?mode=dialogue", ("对话", "原文")),

    # 阅读
    ("阅读-入口", "/read", ("阅读", "选词填空")),
    ("阅读-选词填空", "/read?mode=cloze&p=0", ("选词填空", "提交")),
    ("阅读-仔细阅读", "/read?mode=careful&p=0", ("仔细阅读", "定位")),
    ("阅读-长篇匹配", "/read?mode=match", ("匹配", "段落")),
    ("阅读-同义替换", "/read?mode=syn", ("最接近", "同义", "换一种说法")),
    ("阅读-长难句", "/read?mode=long", ("主干", "拆", "成分")),

    # 写作
    ("写作-入口", "/output", ("写作", "翻译")),
    ("写作-练笔", "/write?tab=practice&p=0", ("计时", "词")),
    ("写作-框架", "/write?tab=frames", ("框架", "段")),
    ("写作-句式", "/write?tab=patterns", ("句式", "替换")),
    ("写作-词块", "/write?tab=chunks", ("词块", "主题")),
    ("写作-范文", "/write?tab=samples", ("范文", "批注")),
    ("写作-清单", "/write?tab=checklist", ("清单", "自评")),
    ("写作-非法tab回落", "/write?tab=zzz", ("计时", "词")),

    # 翻译
    ("翻译-列表", "/translate", ("翻译", "高频")),
    ("翻译-逐句", "/translate?view=do&p=0", ("参考译文", "提示")),
    ("翻译-表达库", "/translate?view=phrase", ("复制", "条")),
    ("翻译-非法参数回落", "/translate?view=zzz", ("翻译", "高频")),

    # 其他
    ("我的", "/me", ("统计", "设置")),
]

# 前端兜底文案 / JS 异常痕迹，出现即判定失败
ERROR_MARKERS = [
    "这一页出错了",
    "Cannot read",
    "undefined is not",
    "is not a function",
    "[object Object]",
]


def pick_chrome(explicit: str | None) -> str:
    if explicit:
        if not os.path.exists(explicit):
            sys.exit(f"找不到浏览器：{explicit}")
        return explicit
    for p in DEFAULT_CHROME:
        if os.path.exists(p):
            return p
    sys.exit("没找到 Chrome / Chromium，请用 --chrome 指定路径")


def dump(chrome: str, url: str, prof: str) -> str:
    cmd = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-first-run",
        "--disable-extensions",
        f"--user-data-dir={prof}",
        "--virtual-time-budget=5000",
        "--dump-dom",
        url,
    ]
    r = subprocess.run(cmd, capture_output=True, timeout=90)
    return r.stdout.decode("utf-8", "replace")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome", default=None)
    ap.add_argument("--base", default=BASE)
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    chrome = pick_chrome(args.chrome)
    fails = []

    with tempfile.TemporaryDirectory() as tmp:
        prof = os.path.join(tmp, "prof")
        for name, path, musts in ROUTES:
            url = args.base + "#" + path
            try:
                dom = dump(chrome, url, prof)
            except subprocess.TimeoutExpired:
                fails.append((name, path, "超时"))
                print(f"  ✗ {name:20} {path:34} 超时")
                continue

            hit = [m for m in ERROR_MARKERS if m in dom]
            if hit:
                fails.append((name, path, "报错 " + hit[0]))
                print(f"  ✗ {name:20} {path:34} 报错「{hit[0]}」")
                continue

            if len(dom) < MIN_DOM:
                fails.append((name, path, f"DOM 仅 {len(dom)}B"))
                print(f"  ✗ {name:20} {path:34} DOM 仅 {len(dom)}B，疑似空白")
                continue

            if not any(m in dom for m in musts):
                fails.append((name, path, "缺文案 " + "/".join(musts)))
                print(f"  ✗ {name:20} {path:34} 缺文案 {musts}")
                if args.verbose:
                    print("      ", dom[:400].replace("\n", " "))
                continue

            print(f"  ✓ {name:20} {path:34} {len(dom) // 1024}KB")

    print()
    if fails:
        print(f"失败 {len(fails)} / {len(ROUTES)}")
        for f in fails:
            print("  -", f)
        return 1

    print(f"全部通过：{len(ROUTES)} 条路由")
    return 0


if __name__ == "__main__":
    sys.exit(main())
