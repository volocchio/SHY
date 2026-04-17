# SHY — Sandpoint Hot Yoga static site deploy
# Deploys to shy.voloaltro.tech via /var/www/shy/ on VPS

param(
    [string]$m = "Update SHY site",
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

# ── Git commit & push ──
Push-Location $repoRoot
git add -A
git commit -m $m
if (-not $NoPush) {
    git push
}
Pop-Location

# ── Deploy to VPS ──
$sshCmd = "wsl ssh -i /home/honeybadger/.ssh/id_ed25519 root@185.164.110.65"

# Pull latest on VPS
Invoke-Expression "$sshCmd 'cd /var/www/shy && git pull origin master'"

Write-Host "`n✓ Deployed to shy.voloaltro.tech" -ForegroundColor Green
