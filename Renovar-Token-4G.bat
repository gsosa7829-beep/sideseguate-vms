@echo off
title SIDESEGUATE - Renovar Token Camaras 4G
cd /d "%~dp0"

set "NODE_BIN="
where node >nul 2>nul && set "NODE_BIN=node"

if "%NODE_BIN%"=="" if exist "C:\Users\User\AppData\Local\OpenAI\Codex\runtimes\cua_node\db1cc9e06a6c48d6\bin\node.exe" (
  set "NODE_BIN=C:\Users\User\AppData\Local\OpenAI\Codex\runtimes\cua_node\db1cc9e06a6c48d6\bin\node.exe"
)

if "%NODE_BIN%"=="" if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
)

if "%NODE_BIN%"=="" (
  echo No se encontro Node.js instalado en esta PC.
  pause
  exit /b 1
)

"%NODE_BIN%" "%~dp0scripts\sync-hilook-token.mjs" --auto-open
echo.
pause
