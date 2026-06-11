# Copies api/.env from Raspberry Pi to local api/.env
# Usage: .\copy-api-env.ps1

$remoteUser = "pi"
$remoteHost = "raspberrypi.local"
$remotePath = "/home/pi/skorbord-cards/api/cards-sqlite.db"
$localPath = "api/cards-sqlite.db"

Write-Host "Copying $remoteUser@${remoteHost}:${remotePath} to $localPath ..."

# Verify local directory exists
$localDir = Split-Path $localPath -Parent
if (!(Test-Path -Path $localDir)) {
    Write-Error "Local directory '$localDir' does not exist. Aborting."
    exit 1
}

Write-Host "$remoteUser@${remoteHost}:${remotePath} $localPath"
exit 1

# Use scp to copy the file
scp "$remoteUser@${remoteHost}:${remotePath}" $localPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully copied cards-sqlite.db to $localPath"
} else {
    Write-Error "Failed to copy cards-sqlite.db. Check your network and SSH keys."
}
