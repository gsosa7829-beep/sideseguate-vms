param(
    [int]$MaxRunMinutes = 320,
    [int]$SyncIntervalSeconds = 6,
    [string]$Repo = "gsosa7829-beep/sideseguate-vms",
    [string]$StateBranch = "cloud-state"
)

$ErrorActionPreference = "Continue"
$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
Set-Location $scriptRoot

Write-Host "=========================================================="
Write-Host " SIDESEGUATE 24/7 CLOUD P2P SERVER (ZERO-PC ARCHITECTURE)"
Write-Host " DVR: HILOOK CLIENT (SN: F31700438 | Code: HELGDM)"
Write-Host "=========================================================="

# 1. Start Hikvision Native P2P Server (hik-p2p-server.ps1) on port 8890
$p2pLog = Join-Path $env:TEMP "hik-p2p-cloud.log"
$p2pErr = Join-Path $env:TEMP "hik-p2p-cloud.err.log"
$serverCheck = $null
try {
    $serverCheck = Invoke-RestMethod -Uri "http://localhost:8890/status" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "[CloudRunner] Existing Hikvision P2P Server detected on port 8890."
} catch {
    Write-Host "[CloudRunner] Starting Hikvision P2P Server (hik-p2p-server.ps1)..."
    $p2pProc = Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptRoot\hik-p2p-server.ps1`"" `
        -RedirectStandardOutput $p2pLog `
        -RedirectStandardError $p2pErr `
        -PassThru -WindowStyle Hidden
    Write-Host "[CloudRunner] Launched hik-p2p-server.ps1 (PID: $($p2pProc.Id))"
}

# Wait for HTTP server on 8890
for ($i = 0; $i -lt 30; $i++) {
    try {
        $st = Invoke-RestMethod -Uri "http://localhost:8890/status" -TimeoutSec 2 -ErrorAction Stop
        if ($st.online) {
            Write-Host "[CloudRunner] Hikvision P2P Server is ONLINE on port 8890!"
            break
        }
    } catch {}
    Start-Sleep -Seconds 1
}

# 2. Download and launch Cloudflare Quick Tunnel (cloudflared) -> https://xxxx.trycloudflare.com
$cfExe = Join-Path $env:TEMP "cloudflared.exe"
if (-not (Test-Path $cfExe)) {
    Write-Host "[CloudRunner] Downloading cloudflared-windows-amd64.exe..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cfExe -UseBasicParsing
}

$cfLog = Join-Path $env:TEMP "cloudflared-tunnel.log"
if (Test-Path $cfLog) { Remove-Item -Force $cfLog -ErrorAction SilentlyContinue }

Write-Host "[CloudRunner] Starting Cloudflare HTTPS Tunnel for http://localhost:8890 ..."
$cfProc = Start-Process -FilePath $cfExe `
    -ArgumentList "tunnel --url http://localhost:8890 --no-autoupdate --logfile `"$cfLog`"" `
    -PassThru -WindowStyle Hidden

$tunnelUrl = ""
for ($i = 0; $i -lt 25; $i++) {
    if (Test-Path $cfLog) {
        $logText = Get-Content $cfLog -Raw -ErrorAction SilentlyContinue
        if ($logText -match "(https://[a-zA-Z0-9\-]+\.trycloudflare\.com)") {
            $tunnelUrl = $Matches[1]
            Write-Host "[CloudRunner] Public HTTPS Cloud P2P Tunnel Ready: $tunnelUrl"
            break
        }
    }
    Start-Sleep -Seconds 1
}

# 3. Resolve GitHub Token (from $env:GITHUB_TOKEN or local git credential manager)
$ghToken = $env:GITHUB_TOKEN
if ([string]::IsNullOrWhiteSpace($ghToken)) {
    try {
        $gitCmd = "C:\Users\User\AppData\Local\GitHubDesktop\app-3.6.6\resources\app\git\cmd\git.exe"
        if (-not (Test-Path $gitCmd)) { $gitCmd = "git" }
        $credInput = "protocol=https`nhost=github.com`n`n"
        $credOut = $credInput | & $gitCmd credential fill 2>$null
        foreach ($line in $credOut) {
            if ($line -match "^password=(.+)$") {
                $ghToken = $Matches[1].Trim()
            }
        }
    } catch {}
}

function Publish-CloudState {
    param(
        [string]$EndpointJson,
        [string]$LiveFramesJson
    )
    if ([string]::IsNullOrWhiteSpace($ghToken)) { return }
    $headers = @{
        "Authorization" = "Bearer $ghToken"
        "Accept"        = "application/vnd.github+json"
        "User-Agent"    = "SIDESEGUATE-Cloud-P2P-Runner"
    }
    try {
        # Create tree with inline content (orphan commit -> zero repo bloat!)
        $treeBody = @{
            tree = @(
                @{
                    path    = "endpoint.json"
                    mode    = "100644"
                    type    = "blob"
                    content = $EndpointJson
                },
                @{
                    path    = "live-frames.json"
                    mode    = "100644"
                    type    = "blob"
                    content = $LiveFramesJson
                }
            )
        } | ConvertTo-Json -Depth 6 -Compress

        $treeRes = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$Repo/git/trees" -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($treeBody)) -ContentType "application/json; charset=utf-8" -TimeoutSec 15

        $commitBody = @{
            message = "chore(cloud-p2p): live 24/7 P2P state sync $(Get-Date -Format 'o')"
            tree    = $treeRes.sha
            parents = @()
        } | ConvertTo-Json -Depth 4 -Compress

        $commitRes = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$Repo/git/commits" -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($commitBody)) -ContentType "application/json; charset=utf-8" -TimeoutSec 15

        $refBody = @{
            sha   = $commitRes.sha
            force = $true
        } | ConvertTo-Json -Compress

        try {
            Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$Repo/git/refs/heads/$StateBranch" -Headers $headers -Body $refBody -ContentType "application/json" -TimeoutSec 15 | Out-Null
        } catch {
            $createRefBody = @{
                ref = "refs/heads/$StateBranch"
                sha = $commitRes.sha
            } | ConvertTo-Json -Compress
            Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$Repo/git/refs" -Headers $headers -Body $createRefBody -ContentType "application/json" -TimeoutSec 15 | Out-Null
        }
    } catch {
        Write-Host "[CloudRunner] State sync warning: $($_.Exception.Message)"
    }
}

$startTime = Get-Date
$iteration = 0

Write-Host "[CloudRunner] Entering 24/7 Cloud Sync Loop (MaxRunMinutes=$MaxRunMinutes, Interval=${SyncIntervalSeconds}s)..."
while (((Get-Date) - $startTime).TotalMinutes -lt $MaxRunMinutes) {
    $iteration++
    try {
        # Refresh tunnel URL if cloudflared rotated it
        if (Test-Path $cfLog) {
            $logText = Get-Content $cfLog -Raw -ErrorAction SilentlyContinue
            $allMatches = [regex]::Matches($logText, "(https://[a-zA-Z0-9\-]+\.trycloudflare\.com)")
            if ($allMatches.Count -gt 0) {
                $latestTunnel = $allMatches[$allMatches.Count - 1].Groups[1].Value
                if ($latestTunnel -ne $tunnelUrl) {
                    $tunnelUrl = $latestTunnel
                    Write-Host "[CloudRunner] Updated Tunnel URL: $tunnelUrl"
                }
            }
        }

        $statusObj = Invoke-RestMethod -Uri "http://localhost:8890/status" -TimeoutSec 4 -ErrorAction Stop
        $bundleObj = Invoke-RestMethod -Uri "http://localhost:8890/bundle" -TimeoutSec 5 -ErrorAction Stop

        $nowIso = (Get-Date).ToUniversalTime().ToString("o")
        $endpointPayload = [ordered]@{
            online      = $true
            mode        = if ($env:GITHUB_ACTIONS -eq "true") { "github-cloud-runner-24-7" } else { "hybrid-cloud-bridge" }
            serial      = "F31700438"
            model       = "iDS-7204HUHI-M1/S"
            encryption  = "HELGDM"
            tunnelUrl   = $tunnelUrl
            updatedAt   = $nowIso
            channels    = $statusObj.channels
        } | ConvertTo-Json -Depth 6 -Compress

        $livePayload = [ordered]@{
            online      = $true
            mode        = if ($env:GITHUB_ACTIONS -eq "true") { "github-cloud-runner-24-7" } else { "hybrid-cloud-bridge" }
            serial      = "F31700438"
            model       = "iDS-7204HUHI-M1/S"
            encryption  = "HELGDM"
            tunnelUrl   = $tunnelUrl
            updatedAt   = $nowIso
            channels    = $statusObj.channels
            frames      = $bundleObj.frames
        } | ConvertTo-Json -Depth 6 -Compress

        Publish-CloudState -EndpointJson $endpointPayload -LiveFramesJson $livePayload

        if ($iteration % 5 -eq 1) {
            Write-Host "[CloudRunner] Sync #$iteration OK | Tunnel: $tunnelUrl | CH1 frames: $($statusObj.channels.'1'.totalFrames)"
        }
    } catch {
        Write-Host "[CloudRunner] Loop warning: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds $SyncIntervalSeconds
}

# 4. If running inside GitHub Actions, self-retrigger next job before exiting for 24/7 continuity
if (($env:GITHUB_ACTIONS -eq "true") -and (-not [string]::IsNullOrWhiteSpace($ghToken))) {
    try {
        Write-Host "[CloudRunner] Triggering next 24/7 Cloud P2P Runner workflow dispatch..."
        $headers = @{
            "Authorization" = "Bearer $ghToken"
            "Accept"        = "application/vnd.github+json"
            "User-Agent"    = "SIDESEGUATE-Cloud-P2P-Runner"
        }
        $dispatchBody = @{ ref = "main" } | ConvertTo-Json -Compress
        Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$Repo/actions/workflows/hik-p2p-cloud-server.yml/dispatches" -Headers $headers -Body $dispatchBody -ContentType "application/json" -TimeoutSec 15 | Out-Null
        Write-Host "[CloudRunner] Next 24/7 workflow dispatched successfully."
    } catch {
        Write-Host "[CloudRunner] Dispatch warning: $($_.Exception.Message)"
    }
}
