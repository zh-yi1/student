@echo off
chcp 65001 >nul
setlocal
if not exist "%~dp0runtime\node.exe" (
  echo Portable runtime missing. Please extract the entire ZIP file first.
  pause
  exit /b 1
)
"%~dp0runtime\node.exe" "%~dp0app\scripts\portable-stop.mjs"
set "SPROUT_EXIT=%ERRORLEVEL%"
if not "%SPROUT_EXIT%"=="0" pause
exit /b %SPROUT_EXIT%
