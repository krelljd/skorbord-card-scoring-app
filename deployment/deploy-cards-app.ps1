# Build and deploy Skorbord frontend to Raspberry Pi

function Assert-Success($step) {
    if ($LASTEXITCODE -ne 0) {
        throw "Step failed: $step (exit code $LASTEXITCODE)"
    }
}

# 1. Build the frontend (from project root, using app as prefix)
npm --prefix app run build
Assert-Success "npm run build"

try {
    ssh pi@raspberrypi.local "sudo systemctl stop skorbord-cards-app.service"
    Assert-Success "stop skorbord-cards-app.service"

    # 2. Ensure the backend's app/dist directory exists on the Pi
    ssh pi@raspberrypi.local "mkdir -p ~/skorbord-cards/api/app/dist"
    Assert-Success "mkdir app/dist on Pi"

    # 3. Copy built files to Raspberry Pi backend directory (so Express can serve them)
    scp -r app/dist/* pi@raspberrypi.local:~/skorbord-cards/api/app/dist/
    Assert-Success "scp frontend dist"

    # 4. Copy updated backend files (rsync isn't available on the Pi, so use tar+scp instead),
    #    then install dependencies on the Pi in case package.json changed (node_modules itself
    #    isn't copied since native modules like sqlite3 must be built for the Pi's architecture).
    $backendArchive = "api-deploy.tar.gz"
    tar --exclude='node_modules' --exclude='scoreboards.db*' --exclude='*.test.js' -czf $backendArchive -C ./api .
    Assert-Success "tar backend files"
    scp $backendArchive pi@raspberrypi.local:~/skorbord-cards/
    Assert-Success "scp backend archive"
    ssh pi@raspberrypi.local "mkdir -p ~/skorbord-cards/api && tar xzf ~/skorbord-cards/$backendArchive -C ~/skorbord-cards/api && rm ~/skorbord-cards/$backendArchive && cd ~/skorbord-cards/api && npm install --omit=dev"
    Assert-Success "extract backend archive and install dependencies on Pi"
    Remove-Item $backendArchive
}
finally {
    # Always attempt to restart the service if we stopped it, even if a step above failed,
    # so a failed deploy doesn't leave the app down.
    ssh pi@raspberrypi.local "sudo systemctl start skorbord-cards-app.service"
    Assert-Success "start skorbord-cards-app.service"
}

Write-Host "skorbord-cards-app.service started successfully on Raspberry Pi."
