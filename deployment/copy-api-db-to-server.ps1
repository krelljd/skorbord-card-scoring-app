# Copies local cards-sqlite.db to Raspberry Pi server
# Usage: .\copy-api-db-to-server.ps1

param()

# Configuration
$remoteUser = "pi"
$remoteHost = "raspberrypi.local"
$remotePath = "/home/pi/skorbord-cards/api/db/cards-sqlite.db"
$localPath = "api\db\cards-sqlite.db"

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Cyan
}

Write-Status "Copying local database to ${remoteUser}@${remoteHost}:${remotePath} ..."

try {
    # Verify local file exists
    if (-not (Test-Path $localPath)) {
        Write-Error "Local database file '$localPath' does not exist. Aborting."
        exit 1
    }

    # Check file size for safety
    $localFile = Get-Item $localPath
    $localSize = $localFile.Length

    if ($localSize -eq 0) {
        Write-Error "Local database file '$localPath' is empty. Aborting for safety."
        exit 1
    }

    Write-Status "Local database size: $localSize bytes"

    # Stop the service before copying the database
    Write-Status "Stopping Skorbord Cards App service on remote server..."
    $stopCommand = "ssh ${remoteUser}@${remoteHost} `"sudo systemctl stop skorbord-cards-app`""
    $result = cmd /c $stopCommand 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Service stopped successfully"
    } else {
        Write-Warning "Failed to stop service. You may need to stop it manually."
        Write-Warning "Run: ssh ${remoteUser}@${remoteHost} 'sudo systemctl stop skorbord-cards-app'"
    }

    # Create backup on remote server first
    Write-Status "Creating backup on remote server..."
    $backupTimestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $remoteBackupPath = "/home/pi/skorbord-cards/api/db/cards-sqlite.db.backup.$backupTimestamp"

    $sshBackupCommand = "ssh ${remoteUser}@${remoteHost} `"cp '$remotePath' '$remoteBackupPath'`""
    $result = cmd /c $sshBackupCommand 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Success "Remote backup created: $remoteBackupPath"
    } else {
        Write-Error "Failed to create remote backup. Aborting."
        Write-Error $result
        exit 1
    }

    # Copy the local database and WAL files to the server
    Write-Status "Copying database file..."
    $scpCommand = "scp `"$localPath`" ${remoteUser}@${remoteHost}:${remotePath}"
    $result = cmd /c $scpCommand 2>&1

    # Also copy WAL files if they exist locally
    $walFile = "$localPath-wal"
    $shmFile = "$localPath-shm"

    if (Test-Path $walFile) {
        Write-Status "Copying WAL file..."
        $scpWalCommand = "scp `"$walFile`" ${remoteUser}@${remoteHost}:${remotePath}-wal"
        cmd /c $scpWalCommand 2>&1
    }

    if (Test-Path $shmFile) {
        Write-Status "Copying SHM file..."
        $scpShmCommand = "scp `"$shmFile`" ${remoteUser}@${remoteHost}:${remotePath}-shm"
        cmd /c $scpShmCommand 2>&1
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Success "Successfully copied local database to ${remoteUser}@${remoteHost}:${remotePath}"
        
        # Verify the copied file
        Write-Status "Verifying copied file..."
        $sshSizeCommand = "ssh ${remoteUser}@${remoteHost} `"stat -c%s '$remotePath'`""
        $remoteSize = [int](cmd /c $sshSizeCommand 2>&1)
        
        if ($localSize -eq $remoteSize) {
            Write-Success "File size verification passed (Local: $localSize bytes, Remote: $remoteSize bytes)"
            
            # Set proper file permissions
            Write-Status "Setting file permissions..."
            $chownCommand = "ssh ${remoteUser}@${remoteHost} `"chown pi:pi '$remotePath' '$remotePath'-* 2>/dev/null || true`""
            cmd /c $chownCommand 2>&1
            $chmodCommand = "ssh ${remoteUser}@${remoteHost} `"chmod 644 '$remotePath' '$remotePath'-* 2>/dev/null || true`""
            cmd /c $chmodCommand 2>&1
            
            # Restart the service to ensure it picks up the new database
            Write-Status "Restarting Skorbord Cards App service..."
            $restartCommand = "ssh ${remoteUser}@${remoteHost} `"sudo systemctl restart skorbord-cards-app`""
            cmd /c $restartCommand
            
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Service restart command executed successfully"
                
                # Wait a moment and check service status
                Write-Status "Checking service status..."
                Start-Sleep -Seconds 2
                $statusCommand = "ssh ${remoteUser}@${remoteHost} `"sudo systemctl is-active skorbord-cards-app`""
                $serviceStatus = (cmd /c $statusCommand 2>&1).Trim()
                
                if ($serviceStatus -eq "active") {
                    Write-Success "Service is running and active"
                    Write-Success "Database copy operation completed successfully!"
                    Write-Status "Remote backup available at: $remoteBackupPath"
                } else {
                    Write-Warning "Service may not be running properly (Status: $serviceStatus)"
                    Write-Warning "Check service logs: ssh ${remoteUser}@${remoteHost} 'sudo journalctl -u skorbord-cards-app -f'"
                }
            } else {
                Write-Warning "Failed to restart service. You may need to restart it manually."
                Write-Warning "Run: ssh ${remoteUser}@${remoteHost} 'sudo systemctl restart skorbord-cards-app'"
            }
        } else {
            Write-Error "File size mismatch after copy (Local: $localSize, Remote: $remoteSize)"
            Write-Status "Restoring from backup and restarting service..."
            $restoreCommand = "ssh ${remoteUser}@${remoteHost} `"cp '$remoteBackupPath' '$remotePath'`""
            cmd /c $restoreCommand
            $startCommand = "ssh ${remoteUser}@${remoteHost} `"sudo systemctl start skorbord-cards-app`""
            cmd /c $startCommand
            exit 1
        }
    } else {
        Write-Error "Failed to copy database file. Check your network and SSH keys."
        Write-Error $result
        Write-Status "Restarting service to restore normal operation..."
        $startCommand = "ssh ${remoteUser}@${remoteHost} `"sudo systemctl start skorbord-cards-app`""
        cmd /c $startCommand
        exit 1
    }

} catch {
    Write-Error "An error occurred: $_"
    exit 1
}
