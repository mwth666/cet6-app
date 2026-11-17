@echo off
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title 六级冲刺 · 本地版

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 server.py %*
    goto end
)

where python >nul 2>nul
if %errorlevel%==0 (
    python server.py %*
    goto end
)

echo.
echo   没有找到 Python。
echo.
echo   请先安装 Python 3.9 或更高版本：https://www.python.org/downloads/
echo   安装时务必勾选 "Add Python to PATH"，装完重新双击本文件。
echo.
pause

:end
