#!/usr/bin/env bash
# 六级冲刺 · 本地版 —— Linux / macOS 终端启动
#   ./start.sh              默认端口 8765，自动打开浏览器
#   ./start.sh --port 9000  指定端口
#   ./start.sh --no-open    不自动开浏览器

cd "$(dirname "$0")" || exit 1

PY=""
for c in python3 python; do
    if command -v "$c" >/dev/null 2>&1; then
        if "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
            PY="$c"
            break
        fi
    fi
done

if [ -z "$PY" ]; then
    echo "需要 Python 3.9+，没找到。Ubuntu/Debian: sudo apt install python3"
    exit 1
fi

exec "$PY" server.py "$@"
