# Test, build and deploy Skorbord to the Raspberry Pi. Run it after you make changes.
#
# Usage (from anywhere):  .\deployment\deploy-cards-app.ps1 [-SkipTests] [-SkipBackup] [-Force]
#
#   -SkipTests   do not run the API and app tests first
#   -SkipBackup  do not back up the database and code on the Pi first (no rollback possible)
#   -Force       deploy even if nothing changed since the last deploy
#   -PiHost / -PiUser / -Port   where the app lives (defaults: raspberrypi.local, pi, 2525)
#
# What it does:
#   1. Checks the Pi answers over SSH, and stops if the last deploy already has your code.
#   2. Runs the tests, then builds the frontend.
#   3. Runs pi-backup.sh on the Pi: stops the app, backs up the database and code.
#   4. Copies the frontend and backend, installs backend packages on the Pi.
#   5. Starts the app and waits for /health. Migrations run when the app starts.
#   6. If a step fails before the app is started again, it restores the old code on the Pi
#      (database untouched) and starts the old version. If the app starts but is unhealthy,
#      it tells you the rollback commands and leaves the decision to you.
#
# api/.env on the Pi is never touched.

param(
    [string]$PiHost = 'raspberrypi.local',
    [string]$PiUser = 'pi',
    [int]$Port = 2525,
    [switch]$SkipTests,
    [switch]$SkipBackup,
    [switch]$Force
)

$target = "$PiUser@$PiHost"
$service = 'skorbord-cards-app.service'
$remoteRoot = '~/skorbord-cards'

function Assert-Success($step) {
    if ($LASTEXITCODE -ne 0) {
        throw "Step failed: $step (exit code $LASTEXITCODE)"
    }
}

function Write-Step($text) {
    Write-Host ""
    Write-Host "== $text" -ForegroundColor Cyan
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
$backendArchive = 'api-deploy.tar.gz'
$serviceStarted = $false
$rollbackReady = $false

try {
    # 1. Reach the Pi, and skip the deploy when it already has this exact code
    Write-Step "Checking the Pi at $target"
    ssh -o ConnectTimeout=10 $target "echo connected"
    Assert-Success "reach $target over SSH"

    $headSha = $null
    $dirty = $false
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $headSha = (git rev-parse HEAD 2>$null)
        $dirty = [bool](git status --porcelain 2>$null)
    }
    if ($headSha -and -not $dirty -and -not $Force) {
        $deployedSha = (ssh $target "cat $remoteRoot/DEPLOYED_SHA 2>/dev/null")
        if ($deployedSha -and $deployedSha.Trim() -eq $headSha) {
            Write-Host "Nothing to deploy: the Pi already has commit $($headSha.Substring(0, 7)). Use -Force to deploy anyway."
            return
        }
    }
    if ($dirty) { Write-Host "Note: you have uncommitted changes. They will be deployed." -ForegroundColor Yellow }

    # 2. Tests, then build
    if (-not $SkipTests) {
        Write-Step "Running API tests"
        npm --prefix api test
        Assert-Success "API tests"

        Write-Step "Running app tests"
        npm --prefix app run test:run
        Assert-Success "app tests"
    }

    Write-Step "Building the frontend"
    npm --prefix app run build
    Assert-Success "npm run build"

    Write-Step "Packing the backend"
    tar --exclude='node_modules' --exclude='scoreboards.db*' --exclude='cards-sqlite.db*' --exclude='*.test.js' -czf $backendArchive -C ./api .
    Assert-Success "tar backend files"

    # 3. Back up on the Pi. pi-backup.sh stops the app, so from here on a failure must not leave it down.
    if (-not $SkipBackup) {
        Write-Step "Backing up on the Pi (this stops the app)"
        ssh $target "mkdir -p $remoteRoot"
        Assert-Success "mkdir $remoteRoot on Pi"
        scp deployment/pi-backup.sh deployment/pi-rollback.sh "${target}:$remoteRoot/"
        Assert-Success "scp backup and rollback scripts"
        # pi-backup.sh refuses to run while the last release's node_modules.old is still there.
        # This release's backup replaces it, so clear it first.
        ssh $target "rm -rf $remoteRoot/api/node_modules.old"
        Assert-Success "clear the previous release's node_modules.old"
        # A Windows checkout can carry CRLF line endings, which bash cannot run
        ssh $target "cd $remoteRoot && sed -i 's/\r$//' pi-backup.sh pi-rollback.sh && chmod +x pi-backup.sh pi-rollback.sh && ./pi-backup.sh pre-release"
        Assert-Success "pi-backup.sh"
        $rollbackReady = $true
    }
    else {
        Write-Step "Stopping the app (backup skipped)"
        ssh $target "sudo systemctl stop $service"
        Assert-Success "stop $service"
    }

    # 4. Frontend: replace the built files so old hashed assets do not pile up
    Write-Step "Copying the frontend"
    ssh $target "rm -rf $remoteRoot/api/app/dist && mkdir -p $remoteRoot/api/app/dist"
    Assert-Success "reset app/dist on Pi"
    scp -r app/dist/* "${target}:$remoteRoot/api/app/dist/"
    Assert-Success "scp frontend dist"

    # Backend: rsync is not on the Pi, so use tar + scp. node_modules is not copied since native
    # modules like sqlite3 must be built for the Pi, so install packages there.
    Write-Step "Copying the backend and installing packages"
    scp $backendArchive "${target}:$remoteRoot/"
    Assert-Success "scp backend archive"
    ssh $target "mkdir -p $remoteRoot/api && tar xzf $remoteRoot/$backendArchive -C $remoteRoot/api && rm $remoteRoot/$backendArchive && cd $remoteRoot/api && npm install --omit=dev"
    Assert-Success "extract backend archive and install dependencies on Pi"

    # 5. Start and check health. Migrations run as the app starts.
    Write-Step "Starting the app"
    ssh $target "sudo systemctl start $service"
    Assert-Success "start $service"
    $serviceStarted = $true

    $healthy = $false
    for ($i = 1; $i -le 15; $i++) {
        ssh $target "curl -fs http://localhost:$Port/health > /dev/null"
        if ($LASTEXITCODE -eq 0) { $healthy = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $healthy) {
        throw "The app started but /health did not answer on port $Port"
    }

    # Remember what is deployed, so the next run can tell when there is nothing new.
    # Uncommitted changes are not a commit, so forget the marker and the next run deploys.
    if ($headSha -and -not $dirty) {
        ssh $target "echo $headSha > $remoteRoot/DEPLOYED_SHA"
    }
    else {
        ssh $target "rm -f $remoteRoot/DEPLOYED_SHA"
    }
    Write-Host ""
    Write-Host "Deployed. $service is running and healthy on $PiHost." -ForegroundColor Green
}
catch {
    $problem = $_.Exception.Message
    Write-Host ""
    Write-Host "DEPLOY FAILED: $problem" -ForegroundColor Red

    if (-not $serviceStarted -and $rollbackReady) {
        # The database is untouched until the app starts, so restore the old code only
        Write-Host "Restoring the old code on the Pi (database untouched) ..." -ForegroundColor Yellow
        ssh $target "cd $remoteRoot && ./pi-rollback.sh --code-only --yes"
        if ($LASTEXITCODE -eq 0) {
            Write-Host "The old version is running again." -ForegroundColor Yellow
        }
        else {
            Write-Host "Automatic rollback failed. On the Pi run: cd $remoteRoot && ./pi-rollback.sh" -ForegroundColor Red
        }
    }
    elseif (-not $serviceStarted) {
        # No backup to restore from: at least do not leave the app down
        ssh $target "sudo systemctl start $service"
        Write-Host "Tried to start $service again. Check: ssh $target 'sudo journalctl -u skorbord-cards-app -n 50'" -ForegroundColor Yellow
    }
    elseif ($rollbackReady) {
        Write-Host "The new version is running but unhealthy. Check: ssh $target 'sudo journalctl -u skorbord-cards-app -n 50'" -ForegroundColor Yellow
        Write-Host "Undo the code only (keeps scores entered since): ssh $target 'cd $remoteRoot && ./pi-rollback.sh --code-only'"
        Write-Host "Undo code and database (loses scores entered since the backup): ssh $target 'cd $remoteRoot && ./pi-rollback.sh'"
    }
    exit 1
}
finally {
    if (Test-Path $backendArchive) { Remove-Item $backendArchive }
    Pop-Location
}
