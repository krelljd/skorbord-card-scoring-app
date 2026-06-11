# Copies api/.env from Raspberry Pi to local api/.env
# Usage: .\copy-api-env.ps1

$remoteUser = "pi"
$remoteHost = "raspberrypi.local"
$remotePath = "/home/pi/skorbord-cards/api/.env"
$localPath = "api/.env"

Write-Host "Copying $remoteUser@${remoteHost}:${remotePath} to $localPath ..."

# Use scp to copy the file
scp "$remoteUser@${remoteHost}:${remotePath}" $localPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully copied .env file to $localPath"
} else {
    Write-Error "Failed to copy .env file. Check your network and SSH keys."
}
