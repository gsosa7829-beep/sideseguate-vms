import { Camera, AccessLog, ShareLink } from './types';
import { generateMediaMtxYaml } from './mediaMtxGenerator';

export interface PcLauncherConfig {
  appUrl: string;
  companyName: string;
  includeMediaMtx: boolean;
  createDesktopShortcut: boolean;
  enableWindowsAutoStart?: boolean;
  enableCloudflareTunnel?: boolean;
  enableWatchdog24x7?: boolean;
  cloudflareTunnelToken?: string;
  fixedTunnelDomain?: string;
  cameras?: Camera[];
}

/**
 * Extracts a https://xxxx.trycloudflare.com URL from cloudflared log output.
 */
export function extractTryCloudflareUrl(logText: string): string | null {
  if (!logText) return null;
  const match = logText.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Returns deterministic 2D floorplan coordinates (x, y in %) and FOV vision cone angle
 * for any camera on the Tactical Facility Map.
 */
export function getCameraTacticalPosition(
  cam: Camera,
  index: number
): { x: number; y: number; angle: number; zoneLabel: string } {
  const presets = [
    { x: 22, y: 26, angle: 45, zoneLabel: 'Zona A · Recepción & Ingreso' },
    { x: 58, y: 24, angle: 120, zoneLabel: 'Zona B · Pasillo Administrativo' },
    { x: 16, y: 74, angle: 315, zoneLabel: 'Zona C · Portón Vehicular Principal' },
    { x: 82, y: 30, angle: 160, zoneLabel: 'Zona D · Perímetro Exterior Norte' },
    { x: 52, y: 66, angle: 210, zoneLabel: 'Zona E · Bodega Central' },
    { x: 84, y: 76, angle: 245, zoneLabel: 'Zona F · Malla Perimetral Trasera' },
  ];
  const preset = presets[index % presets.length];
  return {
    x: typeof cam.mapX === 'number' ? cam.mapX : preset.x,
    y: typeof cam.mapY === 'number' ? cam.mapY : preset.y,
    angle: typeof cam.mapAngle === 'number' ? cam.mapAngle : preset.angle,
    zoneLabel: cam.locationDesc || preset.zoneLabel,
  };
}

/**
 * Formats a real-time buyer access notification when an AccessLog arrives from Firestore.
 */
export function formatBuyerAccessNotification(
  log: AccessLog,
  shareLinks: ShareLink[]
): {
  title: string;
  subtitle: string;
  clientName: string;
  linkTitle: string;
  isSecurityWarning: boolean;
} {
  const matchedLink = shareLinks.find((l) => l.id === log.shareLinkId);
  const clientName = matchedLink?.clientName || 'Comprador Móvil 4G';
  const linkTitle = matchedLink?.title || 'Enlace de Demostración';

  if (log.action === 'auth_failed') {
    return {
      title: `Intento de PIN incorrecto: ${clientName}`,
      subtitle: `${linkTitle} · ${log.clientIp}`,
      clientName,
      linkTitle,
      isSecurityWarning: true,
    };
  }

  if (log.action === 'snapshot_taken') {
    return {
      title: `${clientName} guardó una captura en vivo`,
      subtitle: `${linkTitle} · ${log.clientIp}`,
      clientName,
      linkTitle,
      isSecurityWarning: false,
    };
  }

  return {
    title: `¡${clientName} acaba de abrir tus cámaras en vivo!`,
    subtitle: `${linkTitle} · Conectado desde ${log.clientIp}`,
    clientName,
    linkTitle,
    isSecurityWarning: false,
  };
}

/**
 * Computes the exact MediaMTX stream path slug for a given camera,
 * matching the path generated inside mediamtx.yml.
 */
export function getCameraMediaMtxPath(cam: Camera): string {
  const slug = cam.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `cam_${cam.id.substring(0, 8)}_${slug}`;
}

/**
 * Normalizes a Cloudflare Tunnel, Tailscale, or public Gateway URL
 * and builds the HLS (.m3u8) and WebRTC (WHEP) endpoints for a camera.
 */
export function buildCameraTunnelStreamUrl(
  tunnelBaseUrl: string,
  cam: Camera
): {
  cleanTunnelUrl: string;
  pathSlug: string;
  hlsUrl: string;
  webrtcUrl: string;
} {
  let clean = tunnelBaseUrl.trim().replace(/\/+$/, '');
  if (clean && !/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  const pathSlug = getCameraMediaMtxPath(cam);
  return {
    cleanTunnelUrl: clean,
    pathSlug,
    hlsUrl: `${clean}/${pathSlug}/index.m3u8`,
    webrtcUrl: `${clean}/${pathSlug}/whep`,
  };
}

/**
 * Applies a public tunnel URL (e.g., https://xxxx.trycloudflare.com) to all cameras
 * so mobile buyers on 4G/5G connect through the encrypted tunnel without opening router ports.
 */
export function applyTunnelToCameras(tunnelBaseUrl: string, cameras: Camera[]): Camera[] {
  const trimmed = tunnelBaseUrl.trim();
  if (!trimmed) return cameras;

  return cameras.map((cam) => {
    const endpoints = buildCameraTunnelStreamUrl(trimmed, cam);
    return {
      ...cam,
      hlsStreamUrl: endpoints.hlsUrl,
      webrtcUrl: endpoints.webrtcUrl,
    };
  });
}

/**
 * Generates a single unified Windows All-in-One Native Program Installer (.bat) that:
 * 1. Creates C:\Users\<User>\SIDESEGUATE-VMS and writes mediamtx.yml automatically (no extra files needed)
 * 2. Creates the Windows Desktop shortcut (SIDESEGUATE VMS.lnk)
 * 3. Registers Windows Auto-Start (shell:startup) and disables AC sleep (powercfg)
 * 4. Downloads & starts MediaMTX (Hikvision RTSP gateway) and Cloudflare Tunnel (4G mobile access)
 * 5. Automatically extracts the .trycloudflare.com URL from cloudflared_tunnel.log (or uses a fixed token)
 *    and syncs it to Google Cloud Firestore via ?autoTunnel= without manual copy-paste
 * 6. Runs the 24/7 Watchdog loop to auto-restart services after power or internet flickers
 */
export function generateWindowsProgramBatch(config: PcLauncherConfig): string {
  const cleanUrl = config.appUrl.trim().replace(/\/+$/, '');
  const title = `${config.companyName} - Programa Nativo Todo-en-Uno para PC`;
  const autoStartEnabled = config.enableWindowsAutoStart ?? true;
  const tunnelEnabled = config.enableCloudflareTunnel ?? true;
  const watchdogEnabled = config.enableWatchdog24x7 ?? true;
  const permanentToken = (config.cloudflareTunnelToken || '').trim();
  const fixedDomain = (config.fixedTunnelDomain || '').trim();
  const cameras = config.cameras ?? [];

  const yamlRaw = generateMediaMtxYaml(cameras);
  const yamlBase64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(yamlRaw, 'utf-8').toString('base64')
      : typeof btoa !== 'undefined'
      ? btoa(unescape(encodeURIComponent(yamlRaw)))
      : '';

  const shortcutBlock = config.createDesktopShortcut
    ? `
REM [1/5] Crear acceso directo en el Escritorio de Windows automaticamente
set "SHORTCUT_PATH=%USERPROFILE%\\Desktop\\SIDESEGUATE VMS.lnk"
if not exist "%SHORTCUT_PATH%" (
    echo [1/5] Creando icono nativo en el Escritorio de Windows...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%INSTALL_DIR%\\SIDESEGUATE-Instalador-Unico-PC.bat'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.IconLocation = 'msedge.exe,0'; $s.Description = 'Programa Nativo de Videovigilancia SIDESEGUATE'; $s.Save()"
)
`
    : '';

  const autoStartBlock = autoStartEnabled
    ? `
REM [2/5] Configurar Arranque Automatico con Windows (shell:startup) ante cortes de luz
set "STARTUP_DIR=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"
set "STARTUP_LNK=%STARTUP_DIR%\\SIDESEGUATE VMS AutoArranque.lnk"
if not exist "%STARTUP_LNK%" (
    echo [2/5] Activando Arranque Automatico 24/7 al encender la PC (shell:startup)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%STARTUP_LNK%'); $s.TargetPath = '%INSTALL_DIR%\\SIDESEGUATE-Instalador-Unico-PC.bat'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.IconLocation = 'msedge.exe,0'; $s.Description = 'Auto-Arranque 24/7 SIDESEGUATE VMS'; $s.Save()"
)
REM Evitar que Windows entre en suspension mientras la PC este conectada a corriente
powercfg /change standby-timeout-ac 0 >nul 2>nul
`
    : '';

  const mediaMtxBlock = config.includeMediaMtx
    ? `
REM [3/5] Autogenerar mediamtx.yml integrado (${cameras.length} camaras) e iniciar MediaMTX
if not exist "mediamtx.yml" (
    echo [3/5] Generando archivo integrado mediamtx.yml para tus camaras Hikvision...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[IO.File]::WriteAllText('mediamtx.yml', [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${yamlBase64}')))"
)
if not exist "mediamtx.exe" (
    echo [3/5] Descargando motor de video local MediaMTX para Windows...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://github.com/bluenviron/mediamtx/releases/download/v1.9.3/mediamtx_v1.9.3_windows_amd64.zip' -OutFile 'mediamtx_win.zip'"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path 'mediamtx_win.zip' -DestinationPath '.' -Force"
    del mediamtx_win.zip
)
tasklist /FI "IMAGENAME eq mediamtx.exe" 2>NUL | find /I /N "mediamtx.exe">NUL
if "%ERRORLEVEL%"=="1" (
    echo [OK] Iniciando puente RTSP Hikvision en segundo plano...
    start "SIDESEGUATE Video Gateway" /MIN mediamtx.exe mediamtx.yml
)
`
    : '';

  const tunnelCmd = permanentToken
    ? `cloudflared.exe tunnel run --token ${permanentToken}`
    : `cloudflared.exe tunnel --url http://localhost:8888 --logfile cloudflared_tunnel.log`;

  const tunnelBlock = tunnelEnabled
    ? `
REM [4/5] Iniciar Tunel Remoto 4G + Deteccion Automatica hacia Firestore (Cero Copiar/Pegar)
if not exist "cloudflared.exe" (
    echo [4/5] Descargando Tunel Remoto seguro (cloudflared.exe) para celulares 4G...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe'"
)
tasklist /FI "IMAGENAME eq cloudflared.exe" 2>NUL | find /I /N "cloudflared.exe">NUL
if "%ERRORLEVEL%"=="1" (
    if exist "cloudflared_tunnel.log" del /f /q "cloudflared_tunnel.log" >nul 2>nul
    echo [OK] Iniciando Tunel HTTPS 4G y detectando URL automaticamente...
    start "SIDESEGUATE Tunel Remoto 4G" /MIN ${tunnelCmd}
    timeout /t 5 /nobreak >nul
)
set "AUTO_TUNNEL_URL=${fixedDomain}"
if "%AUTO_TUNNEL_URL%"=="" if exist "cloudflared_tunnel.log" (
    for /f "delims=" %%U in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$m = Select-String -Path 'cloudflared_tunnel.log' -Pattern 'https://[a-zA-Z0-9-]+\\.trycloudflare\\.com' -AllMatches; if ($m) { $m.Matches[-1].Value }"') do set "AUTO_TUNNEL_URL=%%U"
)
if not "%AUTO_TUNNEL_URL%"=="" (
    echo [AUTO-SYNC 4G] URL detectada automaticamente: %AUTO_TUNNEL_URL%
    set "LAUNCH_TARGET_URL=${cleanUrl}?autoTunnel=%AUTO_TUNNEL_URL%"
) else (
    set "LAUNCH_TARGET_URL=${cleanUrl}"
)
`
    : `\nset "LAUNCH_TARGET_URL=${cleanUrl}"\n`;

  const watchdogFooter = watchdogEnabled
    ? `
echo.
echo [5/5] GUARDIAN 24/7 ACTIVO: Monitoreando camaras Hikvision y Tunel 4G cada 15s...
echo (Puedes minimizar esta ventana; si se corta la luz o el internet, revivira solo)
echo.

:WATCHDOG_LOOP
timeout /t 15 /nobreak >nul
${
  config.includeMediaMtx
    ? `tasklist /FI "IMAGENAME eq mediamtx.exe" 2>NUL | find /I /N "mediamtx.exe">NUL
if "%ERRORLEVEL%"=="1" (
    echo [%TIME%] Reiniciando pasarela local de camaras Hikvision (mediamtx.exe)...
    start "SIDESEGUATE Video Gateway" /MIN mediamtx.exe mediamtx.yml
)`
    : ''
}
${
  tunnelEnabled
    ? `tasklist /FI "IMAGENAME eq cloudflared.exe" 2>NUL | find /I /N "cloudflared.exe">NUL
if "%ERRORLEVEL%"=="1" (
    echo [%TIME%] Reiniciando Tunel Remoto 4G (cloudflared.exe)...
    start "SIDESEGUATE Tunel Remoto 4G" /MIN ${tunnelCmd}
)`
    : ''
}
goto WATCHDOG_LOOP
`
    : `exit /b 0\n`;

  return `@echo off
TITLE ${title}
COLOR 0B
set "INSTALL_DIR=%USERPROFILE%\\SIDESEGUATE-VMS"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if /I not "%~dp0"=="%INSTALL_DIR%\\" copy /Y "%~f0" "%INSTALL_DIR%\\SIDESEGUATE-Instalador-Unico-PC.bat" >nul 2>nul
cd /d "%INSTALL_DIR%"

echo ============================================================================
echo   ${config.companyName} - PROGRAMA NATIVO UNIFICADO PARA WINDOWS (TODO EN UNO)
echo   Incluye: Ventana Nativa + Auto-Arranque 24/7 + MediaMTX + Tunel 4G Auto-Sync
echo ============================================================================
echo.
${shortcutBlock}${autoStartBlock}${mediaMtxBlock}${tunnelBlock}
echo [OK] Abriendo programa ${config.companyName} en ventana dedicada de escritorio...

REM Abrir en modo Aplicacion Nativa (--app="${cleanUrl}") y sincronizar Tunel 4G automaticamente
set "APP_LAUNCHED=0"
where msedge >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start "" msedge --app="%LAUNCH_TARGET_URL%" --start-maximized
    set "APP_LAUNCHED=1"
)
if "%APP_LAUNCHED%"=="0" if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --app="%LAUNCH_TARGET_URL%" --start-maximized
    set "APP_LAUNCHED=1"
)
if "%APP_LAUNCHED%"=="0" if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --app="%LAUNCH_TARGET_URL%" --start-maximized
    set "APP_LAUNCHED=1"
)
if "%APP_LAUNCHED%"=="0" (
    start "" "%LAUNCH_TARGET_URL%"
)
${watchdogFooter}`;
}

/**
 * Generates a dedicated 24/7 Watchdog + Auto-Start + Cloudflare Tunnel batch script
 * that monitors mediamtx.exe and cloudflared.exe every 15 seconds and automatically
 * restarts them if the power or internet flickers.
 */
export function generateWatchdogAutoStartBatch(appUrl: string, camerasCount: number): string {
  const cleanUrl = appUrl.trim().replace(/\/+$/, '');
  return `@echo off
TITLE SIDESEGUATE Guardian 24/7 - Auto-Arranque + Tunel 4G (${camerasCount} Camaras)
COLOR 0A
cd /d "%~dp0"

echo ========================================================================
echo   SIDESEGUATE GUARDIAN 24/7 - ARRANQUE AUTOMATICO Y TUNEL REMOTO 4G
echo   Proteccion ante cortes de energia y reconexion automatica de DVR
echo ========================================================================
echo.

REM 1. Registrar en el Inicio Automatico de Windows (shell:startup)
set "STARTUP_LNK=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\SIDESEGUATE-Guardian-24x7.lnk"
if not exist "%STARTUP_LNK%" (
    echo [AUTO-ARRANQUE] Registrando servicio en el inicio de Windows...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%STARTUP_LNK%'); $s.TargetPath = '%~f0'; $s.WorkingDirectory = '%~dp0'; $s.IconLocation = 'msedge.exe,0'; $s.Description = 'Guardian 24/7 SIDESEGUATE'; $s.Save()"
    echo [OK] El sistema arrancara solo cada vez que enciendas la PC.
)

REM 2. Desactivar suspension automatica de Windows en corriente alterna
powercfg /change standby-timeout-ac 0 >nul 2>nul
powercfg /change monitor-timeout-ac 30 >nul 2>nul

REM 3. Verificar binarios de MediaMTX y Cloudflare Tunnel
if not exist "mediamtx.exe" (
    echo [DESCARGA] Descargando motor RTSP MediaMTX para Windows...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://github.com/bluenviron/mediamtx/releases/download/v1.9.3/mediamtx_v1.9.3_windows_amd64.zip' -OutFile 'mediamtx_win.zip'"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path 'mediamtx_win.zip' -DestinationPath '.' -Force"
    del mediamtx_win.zip
)

if not exist "cloudflared.exe" (
    echo [DESCARGA] Descargando cliente de Tunel Remoto Cloudflare 4G...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe'"
)

REM 4. Abrir el Programa de Escritorio SIDESEGUATE
echo [VMS] Abriendo consola SIDESEGUATE en modo ventana de escritorio...
where msedge >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start "" msedge --app="${cleanUrl}" --start-maximized
) else (
    start "" "${cleanUrl}"
)

echo.
echo [GUARDIAN 24/7 ACTIVO] Monitoreando puente Hikvision y Tunel 4G cada 15 segundos...
echo (Puedes minimizar esta ventana; si un servicio se cierra, revivira automaticamente)
echo.

:WATCHDOG_LOOP
tasklist /FI "IMAGENAME eq mediamtx.exe" 2>NUL | find /I /N "mediamtx.exe">NUL
if "%ERRORLEVEL%"=="1" (
    echo [%TIME%] Reiniciando pasarela local de camaras Hikvision (mediamtx.exe)...
    start "SIDESEGUATE Video Gateway" /MIN mediamtx.exe mediamtx.yml
)

tasklist /FI "IMAGENAME eq cloudflared.exe" 2>NUL | find /I /N "cloudflared.exe">NUL
if "%ERRORLEVEL%"=="1" (
    echo [%TIME%] Reiniciando Tunel Remoto 4G (cloudflared.exe -> puerto 8888)...
    start "SIDESEGUATE Tunel 4G" cmd /k "echo === COPIA LA URL https://xxxx.trycloudflare.com EN EL PANEL SIDESEGUATE === && cloudflared.exe tunnel --url http://localhost:8888"
)

timeout /t 15 /nobreak >nul
goto WATCHDOG_LOOP
`;
}

/**
 * Generates a Windows Internet Shortcut (.url) file content so the user can place
 * a direct icon on their Windows desktop.
 */
export function generateWindowsDesktopUrlShortcut(appUrl: string): string {
  const cleanUrl = appUrl.trim();
  return `[InternetShortcut]
URL=${cleanUrl}
IconIndex=0
HotKey=0
IDList=
`;
}

/**
 * Generates an all-in-one PowerShell installer script that sets up the folder
 * C:\Users\<User>\SIDESEGUATE-VMS, writes mediamtx.yml, downloads cloudflared.exe,
 * creates the Desktop shortcut, registers Windows Auto-Start, and launches the PC program.
 */
export function generatePowerShellInstaller(appUrl: string, cameras: Camera[]): string {
  const yamlContent = generateMediaMtxYaml(cameras).replace(/`/g, '``').replace(/\$/g, '`$');
  const cleanUrl = appUrl.trim().replace(/\/+$/, '');

  return `# ===================================================================
# Instalador Automatico de Programa para PC - SIDESEGUATE VMS 24/7
# Incluye: MediaMTX + Arranque Automatico Windows + Tunel Remoto 4G
# ===================================================================
$ErrorActionPreference = "SilentlyContinue"
$InstallDir = "$env:USERPROFILE\\SIDESEGUATE-VMS"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host "==> [1/4] Configurando carpeta del programa en $InstallDir..." -ForegroundColor Cyan

# Guardar configuracion de camaras Hikvision
$YamlConfig = @"
${yamlContent}
"@
Set-Content -Path "$InstallDir\\mediamtx.yml" -Value $YamlConfig -Encoding UTF8

# Descargar cloudflared.exe si no existe para el Tunel Remoto 4G
if (-not (Test-Path "$InstallDir\\cloudflared.exe")) {
    Write-Host "==> [2/4] Descargando Tunel Remoto 4G (cloudflared.exe)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$InstallDir\\cloudflared.exe"
}

# Crear lanzador en modo ventana nativa de PC + Tunel 4G
$LauncherBat = @"
@echo off
cd /d "$InstallDir"
if exist "mediamtx.exe" start "SIDESEGUATE Video Gateway" /MIN mediamtx.exe mediamtx.yml
if exist "cloudflared.exe" start "SIDESEGUATE Tunel 4G" /MIN cloudflared.exe tunnel --url http://localhost:8888
start "" msedge --app="${cleanUrl}" --start-maximized
"@
Set-Content -Path "$InstallDir\\Iniciar-SIDESEGUATE.bat" -Value $LauncherBat -Encoding ASCII

# Crear icono en el Escritorio de Windows
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\\SIDESEGUATE VMS (Programa PC).lnk")
$Shortcut.TargetPath = "$InstallDir\\Iniciar-SIDESEGUATE.bat"
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.IconLocation = "msedge.exe,0"
$Shortcut.Description = "SIDESEGUATE VMS - Programa de Monitoreo y Ventas en PC"
$Shortcut.Save()

# Registrar en Inicio Automatico de Windows (shell:startup)
$StartupPath = [Environment]::GetFolderPath("Startup")
$StartupShortcut = $WshShell.CreateShortcut("$StartupPath\\SIDESEGUATE VMS AutoArranque.lnk")
$StartupShortcut.TargetPath = "$InstallDir\\Iniciar-SIDESEGUATE.bat"
$StartupShortcut.WorkingDirectory = $InstallDir
$StartupShortcut.IconLocation = "msedge.exe,0"
$StartupShortcut.Description = "Arranque Automatico SIDESEGUATE VMS al encender Windows"
$StartupShortcut.Save()

Write-Host "==> [3/4] Icono creado en el Escritorio y en Inicio Automatico de Windows" -ForegroundColor Green
Write-Host "==> [4/4] Abriendo programa SIDESEGUATE VMS..." -ForegroundColor Green
Start-Process "msedge.exe" -ArgumentList "--app=${cleanUrl} --start-maximized"
`;
}
