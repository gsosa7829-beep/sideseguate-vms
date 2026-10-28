@echo off
TITLE SIDESEGUATE Streaming Gateway (MediaMTX Windows)
COLOR 0B

echo ===================================================================
echo   SIDESEGUATE - SERVIDOR DE STREAMING EN VIVO PARA WINDOWS
echo   Sin grabaciones en la nube - Solo transmision en vivo temporal
echo ===================================================================
echo.

IF NOT EXIST "mediamtx.exe" (
    echo [AVISO] No se encontro mediamtx.exe en esta carpeta.
    echo Descargando la version oficial de MediaMTX para Windows de 64 bits...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/bluenviron/mediamtx/releases/download/v1.9.3/mediamtx_v1.9.3_windows_amd64.zip' -OutFile 'mediamtx_win.zip'"
    echo Descomprimiendo archivos...
    powershell -Command "Expand-Archive -Path 'mediamtx_win.zip' -DestinationPath '.' -Force"
    del mediamtx_win.zip
    echo Instalacion completada con exito.
    echo.
)

echo [OK] Iniciando pasarela de video MediaMTX para Windows...
echo [INFO] Puertos activos: RTSP :8554 | HLS Web :8888 | WebRTC :8889
echo [INFO] Minimiza esta ventana para mantener el streaming activo 24/7.
echo.
mediamtx.exe mediamtx.yml
pause
