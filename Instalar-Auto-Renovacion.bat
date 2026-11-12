@echo off
title SIDESEGUATE - Instalador de Auto-Renovacion Semanal de Token 4G
color 0A
cd /d "%~dp0"

echo ===============================================================================
echo     SIDESEGUATE VMS - TAREA PROGRAMADA DE RENOVACION AUTOMATICA (TOKEN 4G)
echo ===============================================================================
echo.
echo Este asistente programa una Tarea de Windows en segundo plano que:
echo  1. Se ejecuta cada Lunes a las 03:00 AM (silencioso, sin interrumpir).
echo  2. Extrae el AccessToken fresco de HiLookVision.
echo  3. Desactiva el cifrado de video en todas las camaras 4G automaticamente.
echo  4. Sincroniza el nuevo token con Cloud Firestore para todos los dispositivos.
echo.

set "VBS_PATH=%~dp0scripts\run-weekly-token-sync.vbs"

if not exist "%VBS_PATH%" (
  echo ERROR: No se encontro el script %VBS_PATH%
  pause
  exit /b 1
)

echo Programando tarea en Windows Task Scheduler...
schtasks /create /tn "SIDESEGUATE_AutoRenovacion_Token_4G" /tr "wscript.exe \"%VBS_PATH%\"" /sc WEEKLY /d MON /st 03:00 /f

if %ERRORLEVEL% EQU 0 (
  echo.
  echo ===============================================================================
  echo   [OK] Tarea programada exitosamente: SIDESEGUATE_AutoRenovacion_Token_4G
  echo   Frecuencia: Cada Lunes a las 03:00 AM
  echo   Registro de eventos: logs\auto-renew.log
  echo ===============================================================================
) else (
  echo.
  echo [AVISO] Se intento programar la tarea. Codigo de salida: %ERRORLEVEL%
)

echo.
echo Presiona cualquier tecla para salir...
pause >nul
