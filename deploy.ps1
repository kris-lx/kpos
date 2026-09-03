# KPOS - one-command deploy: type-check, build, redeploy api+frontend,
# restart nginx (stale cached container IPs), scoped cache flush (query
# cache only - never touches refresh_jti:*, which would kill everyone's
# login session), and a final health check.
#
# Usage (PowerShell):  .\deploy.ps1
# Stops immediately on the first failure - nothing after a failed step runs.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Step($msg) { Write-Host "" ; Write-Host ">> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "OK: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "FAIL: $msg" -ForegroundColor Red; exit 1 }

Step "Type-check: backend (tsc)"
Push-Location APIS
& npx tsc --noEmit
$backendExit = $LASTEXITCODE
Pop-Location
if ($backendExit -ne 0) { Fail "Backend type-check failed - fix errors above before deploying" }
Ok "Backend: 0 errors"

Step "Type-check: frontend (svelte-check)"
Push-Location kpos
$svelteOutput = & npx svelte-check --tsconfig ./tsconfig.json 2>&1 | Out-String
Pop-Location
Write-Host $svelteOutput
if ($svelteOutput -match "[1-9][0-9]* error") { Fail "Frontend type-check failed - fix errors above before deploying" }
Ok "Frontend: 0 errors"

Step "Build images: api, frontend"
docker compose build api frontend
if ($LASTEXITCODE -ne 0) { Fail "docker compose build failed" }
Ok "Images built"

Step "Deploy: recreate api, frontend containers"
docker compose --profile local-nginx up -d --force-recreate api frontend
if ($LASTEXITCODE -ne 0) { Fail "docker compose up failed" }

Step "Restart nginx (clears stale cached container IPs)"
docker restart kpos-nginx-local
if ($LASTEXITCODE -ne 0) { Fail "nginx restart failed" }

Step "Flush query cache only (kpos:q:*) - never touches refresh_jti:*/session data"
$qKeys = docker exec kpos-redis redis-cli --scan --pattern "kpos:q:*"
$qKeys = $qKeys | Where-Object { $_ -ne "" }
if ($qKeys) {
    foreach ($key in $qKeys) { docker exec kpos-redis redis-cli DEL $key | Out-Null }
    Ok "Flushed $($qKeys.Count) query-cache key(s)"
} else {
    Ok "No stale query-cache keys"
}

Step "Health check"
Start-Sleep -Seconds 5
$attempts = 0
$healthy = $false
while (-not $healthy) {
    $apiHealth = docker inspect --format "{{.State.Health.Status}}" kpos-api 2>$null
    $feHealth  = docker inspect --format "{{.State.Health.Status}}" kpos-frontend 2>$null
    if ($apiHealth -eq "healthy" -and $feHealth -eq "healthy") {
        $healthy = $true
    } else {
        $attempts++
        if ($attempts -ge 20) { Fail "api/frontend did not become healthy within 60s - check: docker ps" }
        Start-Sleep -Seconds 3
    }
}
Ok "api + frontend healthy"

Write-Host ""
docker ps --format "{{.Names}}: {{.Status}}" | Select-String "^kpos-"
Write-Host ""
Write-Host "Deploy complete" -ForegroundColor Green
