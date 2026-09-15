@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Threads 爆款雷达 · 实时关键词监控

echo ============================================================
echo   Threads 爆款雷达
echo ============================================================
echo.

rem 依次尝试 py / python / python3，谁先找到用谁
set PY=
where py >nul 2>nul && set PY=py
if "%PY%"=="" (where python >nul 2>nul && set PY=python)
if "%PY%"=="" (where python3 >nul 2>nul && set PY=python3)

if "%PY%"=="" (
  echo [错误] 没找到 Python。请先安装 Python 3.10 以上版本，
  echo        并把 python.exe 加入系统 PATH。
  echo.
  pause
  exit /b 1
)

echo 使用 Python：%PY%
echo 服务端口：8650  （如被占用，改 .env 里的 RADAR_PORT）
echo Stop server: Ctrl+C
echo.

%PY% server.py

echo.
echo 服务已停止。
pause
