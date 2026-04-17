# SHY — Sandpoint Hot Yoga static site deploy
# Prefers the newest shared deploy script when present.

param(
    [string]$m = "Update SHY site",
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

function Invoke-LocalDeploy {
    param(
        [string]$Message,
        [switch]$SkipPush
    )

    Push-Location $repoRoot
    try {
        git add -A
        git commit -m $Message
        if (-not $SkipPush) {
            git push
        }
    }
    finally {
        Pop-Location
    }

    $sshCmd = "wsl ssh -i /home/honeybadger/.ssh/id_ed25519 root@185.164.110.65"

    # Pull latest on VPS for SHY static site.
    Invoke-Expression "$sshCmd 'cd /var/www/shy && git pull origin master'"

    # Update apps portal metadata card when the sync script exists.
    Invoke-Expression "$sshCmd 'if [ -x /usr/local/bin/sync-and-update-portal.sh ]; then /usr/local/bin/sync-and-update-portal.sh; fi'"

    $deployedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
    Write-Host "`nDeployed to shy.voloaltro.tech at $deployedAt" -ForegroundColor Green
}

$sharedScriptCandidates = @(
    (Join-Path $repoRoot "deploy-vps.ps1"),
    (Join-Path $env:USERPROFILE "Dev\deploy-vps.ps1"),
    (Join-Path $HOME "Dev/deploy-vps.ps1")
) | Select-Object -Unique

$sharedScripts = $sharedScriptCandidates |
    Where-Object { Test-Path $_ } |
    ForEach-Object { Get-Item $_ }

$isStaticSiteRepo = -not (Test-Path (Join-Path $repoRoot "docker-compose.yml"))

if ($sharedScripts.Count -gt 0 -and -not $isStaticSiteRepo) {
    $latestScript = $sharedScripts | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $modifiedStamp = $latestScript.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
    Write-Host "Using shared deploy script: $($latestScript.FullName) (updated $modifiedStamp)" -ForegroundColor Cyan

    $forwardedArgs = @("-m", $m)
    if ($NoPush) {
        $forwardedArgs += "-NoPush"
    }

    try {
        & $latestScript.FullName @forwardedArgs
    }
    catch {
        Write-Host "Shared deploy failed. Falling back to SHY local deploy." -ForegroundColor Yellow
        Invoke-LocalDeploy -Message $m -SkipPush:$NoPush
    }
}
else {
    Write-Host "Using SHY local fallback deploy (static site or no shared script)." -ForegroundColor Yellow
    Invoke-LocalDeploy -Message $m -SkipPush:$NoPush
}
