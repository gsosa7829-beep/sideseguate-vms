@echo off
setlocal
cd /d "%~dp0\.."

set "NODE_BIN="
if exist "C:\Users\User\AppData\Local\OpenAI\Codex\runtimes\cua_node\db1cc9e06a6c48d6\bin\node.exe" (
  set "NODE_BIN=C:\Users\User\AppData\Local\OpenAI\Codex\runtimes\cua_node\db1cc9e06a6c48d6\bin\node.exe"
)
if "%NODE_BIN%"=="" (
  where node >nul 2>nul && set "NODE_BIN=node"
)
if "%NODE_BIN%"=="" if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
)

if not exist "logs" mkdir "logs"
set "LOG_FILE=%~dp0..\logs\auto-renew.log"

echo ======================================================== >> "%LOG_FILE%"
echo [%DATE% %TIME%] Ejecutando auto-renovacion de token 4G... >> "%LOG_FILE%"

if "%NODE_BIN%"=="" (
  echo [%DATE% %TIME%] ERROR: No se encontro Node.js en el sistema. >> "%LOG_FILE%"
  exit /b 1
)

"%NODE_BIN%" "%~dp0sync-hilook-token.mjs" --auto-open >> "%LOG_FILE%" 2>&1
echo [%DATE% %TIME%] Finalizado con codigo %ERRORLEVEL% >> "%LOG_FILE%"
exit /b %ERRORLEVEL%
