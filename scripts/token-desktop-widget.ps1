# GLOBAL TECH - Monitor de Escritorio y Bandeja para Token EZVIZ 4G
# Muestra fecha exacta de caducidad, estado en Firestore y botón de renovación rápida.

$ErrorActionPreference = 'SilentlyContinue'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class GlobalTechWin32 {
  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool DestroyIcon(IntPtr hIcon);

  [DllImport("dwmapi.dll", PreserveSig = true)]
  public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);
}
"@

[void][GlobalTechWin32]::SetProcessDPIAware()
[System.Windows.Forms.Application]::EnableVisualStyles()

# Factor de escala DPI real del escritorio (100%, 125%, 150%, etc.)
$dpiGfx = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero)
$dpiScale = [Math]::Max(1.0, [double]$dpiGfx.DpiX / 96.0)
$dpiGfx.Dispose()
function Px([double]$v) { return [int][Math]::Round($v * $dpiScale) }

# Instancia única + evento para despertar el widget si el usuario vuelve a abrir el acceso directo
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, 'Global\GlobalTechTokenDesktopWidget', [ref]$createdNew)
$showEvent = New-Object System.Threading.EventWaitHandle($false, [System.Threading.EventResetMode]::AutoReset, 'Global\GlobalTechTokenDesktopWidgetShow')

if (-not $createdNew) {
  [void]$showEvent.Set()
  exit 0
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$logsDir = Join-Path $repoRoot 'logs'
if (-not (Test-Path $logsDir)) {
  New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

$statusScript = Join-Path $scriptDir 'token-widget-status.mjs'
$syncScript = Join-Path $scriptDir 'sync-hilook-token.mjs'
$logFile = Join-Path $logsDir 'auto-renew.log'
$posFile = Join-Path $logsDir 'widget-pos.json'
$statusOutFile = Join-Path $logsDir 'widget-status.tmp.json'
$statusErrFile = Join-Path $logsDir 'widget-status.tmp.err'

function Resolve-NodeBinary {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -and (Test-Path $cmd.Source)) {
    return $cmd.Source
  }
  foreach ($candidate in @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\node\node.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe')
  )) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }
  return $null
}

$nodeBin = Resolve-NodeBinary

function New-StatusTrayIcon([System.Drawing.Color]$fillColor, [System.Drawing.Color]$ringColor) {
  $bmp = New-Object System.Drawing.Bitmap 32, 32
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240, 16, 18, 22))
  $g.FillEllipse($bgBrush, 1, 1, 29, 29)

  $ringPen = New-Object System.Drawing.Pen ($ringColor, 2.5)
  $g.DrawEllipse($ringPen, 3, 3, 25, 25)

  $dotBrush = New-Object System.Drawing.SolidBrush $fillColor
  $g.FillEllipse($dotBrush, 8, 8, 15, 15)

  $hIcon = $bmp.GetHicon()
  $icon = [System.Drawing.Icon]::FromHandle($hIcon)
  $cloned = $icon.Clone()

  [void][GlobalTechWin32]::DestroyIcon($hIcon)
  $icon.Dispose()
  $dotBrush.Dispose()
  $ringPen.Dispose()
  $bgBrush.Dispose()
  $g.Dispose()
  $bmp.Dispose()

  return $cloned
}

function Get-ScheduledSyncSummary {
  try {
    $info = Get-ScheduledTaskInfo -TaskName 'GlobalTech-AutoRenew-Token4G' -ErrorAction Stop
    if ($info.NextRunTime) {
      return $info.NextRunTime.ToString('dd MMM HH:mm', [System.Globalization.CultureInfo]::GetCultureInfo('es-GT')).Replace('.', '')
    }
  } catch {}
  return 'cada 4 días'
}

# Colores tema Titanio GLOBAL TECH
$colBg       = [System.Drawing.Color]::FromArgb(16, 18, 22)
$colPanel    = [System.Drawing.Color]::FromArgb(23, 26, 32)
$colBorder   = [System.Drawing.Color]::FromArgb(46, 53, 66)
$colBtn      = [System.Drawing.Color]::FromArgb(30, 34, 42)
$colBtnHover = [System.Drawing.Color]::FromArgb(44, 50, 62)
$colSky      = [System.Drawing.Color]::FromArgb(2, 132, 199)
$colText     = [System.Drawing.Color]::FromArgb(241, 245, 249)
$colSub      = [System.Drawing.Color]::FromArgb(203, 213, 225)
$colMuted    = [System.Drawing.Color]::FromArgb(148, 163, 184)

$colGreen    = [System.Drawing.Color]::FromArgb(16, 185, 129)
$colAmber    = [System.Drawing.Color]::FromArgb(245, 158, 11)
$colRed      = [System.Drawing.Color]::FromArgb(239, 68, 68)
$colCyan     = [System.Drawing.Color]::FromArgb(56, 189, 248)

$script:dotColor = $colCyan
$script:lastStatusState = $null
$script:lastData = $null
$script:statusProc = $null
$script:renewProc = $null
$script:dragging = $false
$script:dragOffset = New-Object System.Drawing.Point(0, 0)
$script:pinnedTop = $false

# Iconos de bandeja pre-construidos
$icoActive  = New-StatusTrayIcon $colGreen ([System.Drawing.Color]::FromArgb(52, 211, 153))
$icoWarning = New-StatusTrayIcon $colAmber ([System.Drawing.Color]::FromArgb(251, 191, 36))
$icoExpired = New-StatusTrayIcon $colRed   ([System.Drawing.Color]::FromArgb(248, 113, 113))
$icoLoading = New-StatusTrayIcon $colCyan  ([System.Drawing.Color]::FromArgb(125, 211, 252))

# Formulario flotante principal
$form = New-Object System.Windows.Forms.Form
$form.Text = 'GLOBAL TECH · Token 4G'
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
$form.Size = New-Object System.Drawing.Size((Px 336), (Px 188))
$form.BackColor = $colBg
$form.ForeColor = $colText
$form.ShowInTaskbar = $false
$form.TopMost = $false
$form.Opacity = 0.96

$workArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$defaultX = $workArea.Right - $form.Width - (Px 16)
$defaultY = $workArea.Bottom - $form.Height - (Px 16)

if (Test-Path $posFile) {
  try {
    $savedPos = Get-Content $posFile -Raw | ConvertFrom-Json
    $pxPos = [int]$savedPos.x
    $pyPos = [int]$savedPos.y
    if ($pxPos -ge $workArea.Left -and ($pxPos + $form.Width) -le $workArea.Right -and
        $pyPos -ge $workArea.Top -and ($pyPos + $form.Height) -le $workArea.Bottom) {
      $defaultX = $pxPos
      $defaultY = $pyPos
    }
  } catch {}
}
$form.Location = New-Object System.Drawing.Point($defaultX, $defaultY)

# Esquinas redondeadas en Windows 11 si están disponibles
$form.Add_HandleCreated({
  try {
    $pref = 2 # DWMWCP_ROUND
    [void][GlobalTechWin32]::DwmSetWindowAttribute($form.Handle, 33, [ref]$pref, 4)
  } catch {}
})

# Borde limpio alrededor de la tarjeta
$form.Add_Paint({
  param($s, $e)
  $pen = New-Object System.Drawing.Pen ($colBorder, 1)
  $e.Graphics.DrawRectangle($pen, 0, 0, $form.Width - 1, $form.Height - 1)
  $e.Graphics.DrawLine($pen, (Px 12), (Px 42), $form.Width - (Px 13), (Px 42))
  $pen.Dispose()
})

# Indicador visual circular
$dotPanel = New-Object System.Windows.Forms.Panel
$dotPanel.Location = New-Object System.Drawing.Point((Px 14), (Px 15))
$dotPanel.Size = New-Object System.Drawing.Size((Px 14), (Px 14))
$dotPanel.BackColor = $colBg
$dotPanel.Add_Paint({
  param($s, $e)
  $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $b = New-Object System.Drawing.SolidBrush $script:dotColor
  $e.Graphics.FillEllipse($b, 1, 1, (Px 11), (Px 11))
  $b.Dispose()
})
$form.Controls.Add($dotPanel)

$lblHeader = New-Object System.Windows.Forms.Label
$lblHeader.Text = 'GLOBAL TECH · Token 4G'
$lblHeader.Font = New-Object System.Drawing.Font('Segoe UI', 9.5, [System.Drawing.FontStyle]::Bold)
$lblHeader.ForeColor = $colText
$lblHeader.Location = New-Object System.Drawing.Point((Px 34), (Px 13))
$lblHeader.Size = New-Object System.Drawing.Size((Px 172), (Px 20))
$lblHeader.Cursor = [System.Windows.Forms.Cursors]::SizeAll
$form.Controls.Add($lblHeader)

function New-MiniHeaderButton([string]$text, [int]$x, [int]$w, [string]$tip) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $text
  $b.Location = New-Object System.Drawing.Point((Px $x), (Px 9))
  $b.Size = New-Object System.Drawing.Size((Px $w), (Px 24))
  $b.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
  $b.FlatAppearance.BorderSize = 1
  $b.FlatAppearance.BorderColor = $colBorder
  $b.FlatAppearance.MouseOverBackColor = $colBtnHover
  $b.BackColor = $colBtn
  $b.ForeColor = $colSub
  $b.Font = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Bold)
  $b.TabStop = $false
  $b.Cursor = [System.Windows.Forms.Cursors]::Hand
  return $b
}

$toolTip = New-Object System.Windows.Forms.ToolTip
$btnPin = New-MiniHeaderButton 'Fijar' 210 46 'Mantener siempre visible encima de ventanas'
$btnRefresh = New-MiniHeaderButton ([string][char]0x21BB) 261 30 'Actualizar estado ahora'
$btnMin = New-MiniHeaderButton ([string][char]0x2014) 295 28 'Minimizar junto al reloj'
$toolTip.SetToolTip($btnPin, 'Fijar encima de todas las ventanas')
$toolTip.SetToolTip($btnRefresh, 'Consultar vigencia en Firestore ahora')
$toolTip.SetToolTip($btnMin, 'Ocultar a la bandeja del sistema')
$form.Controls.Add($btnPin)
$form.Controls.Add($btnRefresh)
$form.Controls.Add($btnMin)

# Tarjeta interior de información
$infoCard = New-Object System.Windows.Forms.Panel
$infoCard.Location = New-Object System.Drawing.Point((Px 12), (Px 50))
$infoCard.Size = New-Object System.Drawing.Size((Px 312), (Px 82))
$infoCard.BackColor = $colPanel
$infoCard.Add_Paint({
  param($s, $e)
  $p = New-Object System.Drawing.Pen ($colBorder, 1)
  $e.Graphics.DrawRectangle($p, 0, 0, $infoCard.Width - 1, $infoCard.Height - 1)
  $p.Dispose()
})
$form.Controls.Add($infoCard)

$lblHeadline = New-Object System.Windows.Forms.Label
$lblHeadline.Text = 'Consultando estado en la nube...'
$lblHeadline.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
$lblHeadline.ForeColor = $colCyan
$lblHeadline.Location = New-Object System.Drawing.Point((Px 12), (Px 9))
$lblHeadline.Size = New-Object System.Drawing.Size((Px 290), (Px 24))
$infoCard.Controls.Add($lblHeadline)

$lblExpire = New-Object System.Windows.Forms.Label
$lblExpire.Text = 'Vence: verificando Firestore...'
$lblExpire.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Regular)
$lblExpire.ForeColor = $colSub
$lblExpire.Location = New-Object System.Drawing.Point((Px 12), (Px 35))
$lblExpire.Size = New-Object System.Drawing.Size((Px 290), (Px 20))
$infoCard.Controls.Add($lblExpire)

$lblDetails = New-Object System.Windows.Forms.Label
$lblDetails.Text = 'Cámaras: verificando · Próx. auto: ---'
$lblDetails.Font = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Regular)
$lblDetails.ForeColor = $colMuted
$lblDetails.Location = New-Object System.Drawing.Point((Px 12), (Px 57))
$lblDetails.Size = New-Object System.Drawing.Size((Px 290), (Px 18))
$infoCard.Controls.Add($lblDetails)

# Barra inferior de acciones
$btnRenew = New-Object System.Windows.Forms.Button
$btnRenew.Text = 'Renovar Ahora'
$btnRenew.Location = New-Object System.Drawing.Point((Px 12), (Px 142))
$btnRenew.Size = New-Object System.Drawing.Size((Px 134), (Px 34))
$btnRenew.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnRenew.FlatAppearance.BorderSize = 0
$btnRenew.BackColor = $colSky
$btnRenew.ForeColor = [System.Drawing.Color]::White
$btnRenew.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
$btnRenew.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnRenew.TabStop = $false
$form.Controls.Add($btnRenew)

$btnWeb = New-Object System.Windows.Forms.Button
$btnWeb.Text = 'Abrir Web'
$btnWeb.Location = New-Object System.Drawing.Point((Px 154), (Px 142))
$btnWeb.Size = New-Object System.Drawing.Size((Px 92), (Px 34))
$btnWeb.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnWeb.FlatAppearance.BorderSize = 1
$btnWeb.FlatAppearance.BorderColor = $colBorder
$btnWeb.FlatAppearance.MouseOverBackColor = $colBtnHover
$btnWeb.BackColor = $colBtn
$btnWeb.ForeColor = $colText
$btnWeb.Font = New-Object System.Drawing.Font('Segoe UI', 8.5, [System.Drawing.FontStyle]::Bold)
$btnWeb.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnWeb.TabStop = $false
$form.Controls.Add($btnWeb)

$btnLog = New-Object System.Windows.Forms.Button
$btnLog.Text = 'Log'
$btnLog.Location = New-Object System.Drawing.Point((Px 254), (Px 142))
$btnLog.Size = New-Object System.Drawing.Size((Px 70), (Px 34))
$btnLog.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnLog.FlatAppearance.BorderSize = 1
$btnLog.FlatAppearance.BorderColor = $colBorder
$btnLog.FlatAppearance.MouseOverBackColor = $colBtnHover
$btnLog.BackColor = $colBtn
$btnLog.ForeColor = $colSub
$btnLog.Font = New-Object System.Drawing.Font('Segoe UI', 8.5, [System.Drawing.FontStyle]::Bold)
$btnLog.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnLog.TabStop = $false
$form.Controls.Add($btnLog)

# Arrastrar ventana libremente desde encabezado o cuerpo
$onMouseDown = {
  param($s, $e)
  if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
    $script:dragging = $true
    $script:dragStartCursor = [System.Windows.Forms.Cursor]::Position
    $script:dragStartForm = $form.Location
  }
}
$onMouseMove = {
  param($s, $e)
  if ($script:dragging) {
    $cur = [System.Windows.Forms.Cursor]::Position
    $nx = $script:dragStartForm.X + ($cur.X - $script:dragStartCursor.X)
    $ny = $script:dragStartForm.Y + ($cur.Y - $script:dragStartCursor.Y)
    $form.Location = New-Object System.Drawing.Point($nx, $ny)
  }
}
$onMouseUp = {
  if ($script:dragging) {
    $script:dragging = $false
    try {
      @{ x = $form.Location.X; y = $form.Location.Y } | ConvertTo-Json -Compress | Set-Content -Path $posFile -Encoding UTF8
    } catch {}
  }
}

foreach ($dragCtrl in @($form, $lblHeader, $dotPanel, $infoCard, $lblHeadline, $lblExpire, $lblDetails)) {
  $dragCtrl.Add_MouseDown($onMouseDown)
  $dragCtrl.Add_MouseMove($onMouseMove)
  $dragCtrl.Add_MouseUp($onMouseUp)
}

# Bandeja del sistema junto al reloj de Windows
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $icoLoading
$tray.Text = 'GLOBAL TECH: Verificando token...'
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miToggle  = $menu.Items.Add('Mostrar / Ocultar Widget')
$miRefresh = $menu.Items.Add('Actualizar Estado Ahora')
$miRenew   = $menu.Items.Add('Renovar Token Ahora')
$miWeb     = $menu.Items.Add('Abrir GLOBAL TECH Web')
$miLog     = $menu.Items.Add('Ver Registro (auto-renew.log)')
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
$miExit    = $menu.Items.Add('Cerrar Monitor')
$tray.ContextMenuStrip = $menu

function Show-WidgetFront {
  if (-not $form.Visible) {
    $form.Show()
  }
  $form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
  $form.BringToFront()
  $form.Activate()
}

function Safe-TrayText([string]$raw) {
  if (-not $raw) { return 'GLOBAL TECH Token 4G' }
  if ($raw.Length -le 63) { return $raw }
  return $raw.Substring(0, 60) + '...'
}

function Apply-UiFromState {
  $d = $script:lastData
  $nextRunStr = Get-ScheduledSyncSummary

  if (-not $d) {
    return
  }

  $expireMs = [double]($d.expireMs)
  $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $remMs = [Math]::Max(0, $expireMs - $nowMs)
  $remHours = [Math]::Floor($remMs / 3600000)
  $remDays = [Math]::Floor($remHours / 24)
  $modHours = $remHours % 24

  $computedStatus = 'expired'
  if ($d.hasToken -and $remMs -gt 86400000) {
    $computedStatus = 'active'
  } elseif ($d.hasToken -and $remMs -gt 0) {
    $computedStatus = 'expiring'
  }

  $camInfo = if ([int]$d.totalCameras -gt 0) {
    "$($d.camerasWithValidTag)/$($d.totalCameras) cámaras OK"
  } else {
    'Caché local'
  }

  if ($computedStatus -eq 'active') {
    $script:dotColor = $colGreen
    $tray.Icon = $icoActive
    $lblHeadline.ForeColor = $colGreen
    $lblHeadline.Text = "Token Activo · Quedan ${remDays}d ${modHours}h"
    $lblExpire.Text = "Vence: $($d.expireDateStr)"
    $tray.Text = Safe-TrayText "GLOBAL TECH: Token activo (${remDays}d ${modHours}h · $($d.shortExpireDateStr))"
  } elseif ($computedStatus -eq 'expiring') {
    $script:dotColor = $colAmber
    $tray.Icon = $icoWarning
    $lblHeadline.ForeColor = $colAmber
    $lblHeadline.Text = "¡Por Vencer! · Quedan ${remHours}h"
    $lblExpire.Text = "Vence: $($d.expireDateStr)"
    $tray.Text = Safe-TrayText "GLOBAL TECH: Token vence en ${remHours}h ($($d.shortExpireDateStr))"
  } else {
    $script:dotColor = $colRed
    $tray.Icon = $icoExpired
    $lblHeadline.ForeColor = $colRed
    $lblHeadline.Text = 'Token Vencido · Requiere Renovar'
    $lblExpire.Text = if ($d.expireDateStr -and $d.expireDateStr -ne 'Desconocido') { "Venció: $($d.expireDateStr)" } else { 'Sin token vigente en la nube' }
    $tray.Text = Safe-TrayText 'GLOBAL TECH: Token VENCIDO - Clic para renovar'
  }

  $lblDetails.Text = "Nube: $camInfo · Próx. auto: $nextRunStr"
  $dotPanel.Invalidate()

  if ($script:lastStatusState -and $script:lastStatusState -ne $computedStatus) {
    if ($computedStatus -eq 'expiring') {
      $tray.ShowBalloonTip(6000, 'GLOBAL TECH · Token 4G', "El token vence en ${remHours}h ($($d.expireDateStr)).", [System.Windows.Forms.ToolTipIcon]::Warning)
    } elseif ($computedStatus -eq 'expired') {
      $tray.ShowBalloonTip(6000, 'GLOBAL TECH · Token 4G', 'El token venció. Haz clic en Renovar Ahora.', [System.Windows.Forms.ToolTipIcon]::Error)
    }
  }
  $script:lastStatusState = $computedStatus
}

function Start-StatusRefresh {
  if ($script:statusProc -and -not $script:statusProc.HasExited) { return }
  if (-not $nodeBin -or -not (Test-Path $statusScript)) {
    $lblHeadline.ForeColor = $colRed
    $lblHeadline.Text = 'Falta Node.js o script'
    return
  }

  $btnRefresh.Enabled = $false
  try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'cmd.exe'
    $psi.Arguments = "/c `"`"$nodeBin`" `"$statusScript`" > `"$statusOutFile`" 2> `"$statusErrFile`"`""
    $psi.WorkingDirectory = $repoRoot
    $psi.CreateNoWindow = $true
    $psi.UseShellExecute = $false
    $script:statusProc = [System.Diagnostics.Process]::Start($psi)
  } catch {
    $btnRefresh.Enabled = $true
  }
}

function Start-ManualTokenRenew {
  if ($script:renewProc -and -not $script:renewProc.HasExited) { return }
  if (-not $nodeBin -or -not (Test-Path $syncScript)) { return }

  $btnRenew.Enabled = $false
  $btnRenew.Text = 'Renovando...'
  $lblHeadline.ForeColor = $colCyan
  $lblHeadline.Text = 'Sincronizando con HiLook...'
  $script:dotColor = $colCyan
  $dotPanel.Invalidate()
  $tray.Icon = $icoLoading

  try {
    Add-Content -Path $logFile -Value "========================================================`r`n[$(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')] Renovación manual desde Widget Escritorio..." -Encoding UTF8
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'cmd.exe'
    $psi.Arguments = "/c `"`"$nodeBin`" `"$syncScript`" --auto-open --firestore-only --force >> `"$logFile`" 2>&1`""
    $psi.WorkingDirectory = $repoRoot
    $psi.CreateNoWindow = $true
    $psi.UseShellExecute = $false
    $script:renewProc = [System.Diagnostics.Process]::Start($psi)
  } catch {
    $btnRenew.Enabled = $true
    $btnRenew.Text = 'Renovar Ahora'
  }
}

# Acciones UI
$btnPin.Add_Click({
  $script:pinnedTop = -not $script:pinnedTop
  $form.TopMost = $script:pinnedTop
  if ($script:pinnedTop) {
    $btnPin.BackColor = $colSky
    $btnPin.ForeColor = [System.Drawing.Color]::White
  } else {
    $btnPin.BackColor = $colBtn
    $btnPin.ForeColor = $colSub
  }
})

$btnRefresh.Add_Click({ Start-StatusRefresh })
$btnMin.Add_Click({ $form.Hide() })
$btnRenew.Add_Click({ Start-ManualTokenRenew })
$btnWeb.Add_Click({ Start-Process 'https://global-tech.surge.sh/' })
$btnLog.Add_Click({
  if (Test-Path $logFile) {
    Start-Process 'notepad.exe' -ArgumentList "`"$logFile`""
  } else {
    Start-Process 'explorer.exe' -ArgumentList "`"$logsDir`""
  }
})

$tray.Add_MouseClick({
  param($s, $e)
  if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
    if ($form.Visible) {
      $form.Hide()
    } else {
      Show-WidgetFront
    }
  }
})

$miToggle.Add_Click({
  if ($form.Visible) { $form.Hide() } else { Show-WidgetFront }
})
$miRefresh.Add_Click({ Start-StatusRefresh })
$miRenew.Add_Click({ Show-WidgetFront; Start-ManualTokenRenew })
$miWeb.Add_Click({ Start-Process 'https://global-tech.surge.sh/' })
$miLog.Add_Click({
  if (Test-Path $logFile) { Start-Process 'notepad.exe' -ArgumentList "`"$logFile`"" }
})

$miExit.Add_Click({
  $tray.Visible = $false
  $tray.Dispose()
  $form.Close()
  [System.Windows.Forms.Application]::Exit()
})

# Timer rápido (250ms) para procesos en segundo plano y evento de instancia única
$pollTimer = New-Object System.Windows.Forms.Timer
$pollTimer.Interval = 250
$pollTimer.Add_Tick({
  try {
    if ($showEvent.WaitOne(0)) {
      Show-WidgetFront
    }
  } catch {}

  if ($script:statusProc -and $script:statusProc.HasExited) {
    $script:statusProc.Dispose()
    $script:statusProc = $null
    $btnRefresh.Enabled = $true
    if (Test-Path $statusOutFile) {
      try {
        $rawJson = Get-Content $statusOutFile -Raw -Encoding UTF8
        if ($rawJson -and $rawJson.Trim().StartsWith('{')) {
          $script:lastData = $rawJson | ConvertFrom-Json
          Apply-UiFromState
        }
      } catch {}
    }
  }

  if ($script:renewProc -and $script:renewProc.HasExited) {
    $exitCode = $script:renewProc.ExitCode
    $script:renewProc.Dispose()
    $script:renewProc = $null
    $btnRenew.Enabled = $true
    $btnRenew.Text = 'Renovar Ahora'
    if ($exitCode -eq 0) {
      $tray.ShowBalloonTip(4000, 'GLOBAL TECH · Token 4G', 'Token verificado y sincronizado en Firestore.', [System.Windows.Forms.ToolTipIcon]::Info)
    } else {
      $tray.ShowBalloonTip(5000, 'GLOBAL TECH · Token 4G', 'Abre HiLookVision Client con Auto-Login y vuelve a intentar.', [System.Windows.Forms.ToolTipIcon]::Warning)
    }
    Start-StatusRefresh
  }
})
$pollTimer.Start()

# Contador visual cada 60s y consulta remota cada 5 minutos
$countdownTimer = New-Object System.Windows.Forms.Timer
$countdownTimer.Interval = 60000
$countdownTimer.Add_Tick({ Apply-UiFromState })
$countdownTimer.Start()

$remoteTimer = New-Object System.Windows.Forms.Timer
$remoteTimer.Interval = 300000
$remoteTimer.Add_Tick({ Start-StatusRefresh })
$remoteTimer.Start()

$form.Add_Shown({ Start-StatusRefresh })
$form.Add_FormClosing({
  param($s, $e)
  if ($e.CloseReason -eq [System.Windows.Forms.CloseReason]::UserClosing) {
    $e.Cancel = $true
    $form.Hide()
  }
})

[System.Windows.Forms.Application]::Run($form)

$tray.Visible = $false
$tray.Dispose()
$mutex.ReleaseMutex()
$mutex.Dispose()
$showEvent.Dispose()
