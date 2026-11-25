@echo off
cd /d "%~dp0"
title Sprout English - Local Demo
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22.13 or newer first.
  pause
  exit /b 1
)
if not exist node_modules\next\package.json (
  call npm.cmd install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Open http://127.0.0.1:3000 in your browser.
echo Press Ctrl+C here to stop the demo.
call npm.cmd run dev
pause
