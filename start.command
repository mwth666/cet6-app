#!/usr/bin/env bash
# 六级冲刺 · 本地版 —— macOS 双击启动
# 首次使用如果提示「无法打开」，右键 → 打开，或在终端里执行：
#   chmod +x start.command

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
    echo
    echo "  没有找到 Python 3.9 或更高版本。"
    echo
    echo "  安装方法（任选一种）："
    echo "    1. 官网下载：https://www.python.org/downloads/"
    echo "    2. Homebrew：brew install python3"
    echo
    read -r -p "  按回车关闭..." _
    exit 1
fi

"$PY" server.py "$@"

# 出错时留住窗口，方便看报错
if [ $? -ne 0 ]; then
    read -r -p "  按回车关闭..." _
fi
