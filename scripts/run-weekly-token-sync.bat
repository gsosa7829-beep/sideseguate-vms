@echo off
setlocal
cd /d "%~dp0\.."

set "NODE_BIN="
where node >nul 2>nul && for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_BIN set "NODE_BIN=%%I"
if "%NODE_BIN%"=="" if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
)
if "%NODE_BIN%"=="" if exist "%LocalAppData%\Programs\node\node.exe" (
  set "NODE_BIN=%LocalAppData%\Programs\node\node.exe"
)

if not exist "logs" mkdir "logs"
set "LOG_FILE=%~dp0..\logs\auto-renew.log"

echo ======================================================== >> "%LOG_FILE%"
echo [%DATE% %TIME%] Ejecutando auto-renovacion de token 4G (GLOBAL TECH)... >> "%LOG_FILE%"

if "%NODE_BIN%"=="" (
  echo [%DATE% %TIME%] ERROR: No se encontro Node.js en el sistema. >> "%LOG_FILE%"
  exit /b 1
)

"%NODE_BIN%" "%~dp0sync-hilook-token.mjs" --auto-open --firestore-only >> "%LOG_FILE%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"
echo [%DATE% %TIME%] Finalizado con codigo %EXIT_CODE% >> "%LOG_FILE%"
exit /b %EXIT_CODE%
