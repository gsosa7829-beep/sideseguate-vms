@echo off
chcp 65001 >nul
title SIDESEGUATE - Subir cambios a GitHub (gsosa7829-beep/sideseguate-vms)
set "PATH=C:\Users\User\AppData\Local\GitHubDesktop\app-3.6.6\resources\app\git\cmd;C:\Users\User\AppData\Local\GitHubDesktop\app-3.6.6\resources\app\git\mingw64\bin;%PATH%"
cd /d "C:\Users\User\.gemini\antigravity\scratch\sideseguate-streaming"

echo ====================================================================
echo   SUBIENDO PROYECTO SIDESEGUATE-VMS A GITHUB (gsosa7829-beep)
echo   Repositorio: https://github.com/gsosa7829-beep/sideseguate-vms.git
echo ====================================================================
echo.
git remote set-url origin https://github.com/gsosa7829-beep/sideseguate-vms.git
git add .
git commit -m "feat: actualizacion plataforma SIDESEGUATE con motor P2P V3 nativo Hikvision (FB2200254)" 2>nul
echo Autenticando y subiendo rama main a GitHub...
git push -u origin main --force
echo.
echo ====================================================================
echo   Proceso finalizado.
echo ====================================================================
pause
