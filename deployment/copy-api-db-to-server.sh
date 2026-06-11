#!/usr/bin/env zsh
# Copies local cards-sqlite.db to Raspberry Pi server
# Usage: ./copy-api-db-to-server.sh

set -e  # Exit on any error

remoteUser="pi"
remoteHost="raspberrypi.local"
remotePath="/home/pi/skorbord-cards/api/db/cards-sqlite.db"
localPath="api/db/cards-sqlite.db"

echo "Copying local database to ${remoteUser}@${remoteHost}:${remotePath} ..."

# Verify local file exists
if [[ ! -f "$localPath" ]]; then
    echo "Error: Local database file '$localPath' does not exist. Aborting." >&2
    exit 1
fi

# Check file size for safety
localSize=$(stat -f%z "$localPath" 2>/dev/null || stat -c%s "$localPath" 2>/dev/null)
if [[ $localSize -eq 0 ]]; then
    echo "Error: Local database file '$localPath' is empty. Aborting for safety." >&2
    exit 1
fi

echo "Local database size: $localSize bytes"

# Stop the service before copying the database
echo "Stopping Skorbord Cards App service on remote server..."
ssh "${remoteUser}@${remoteHost}" "sudo systemctl stop skorbord-cards-app"
if [[ $? -eq 0 ]]; then
    echo "✅ Service stopped successfully"
else
    echo "⚠️  Warning: Failed to stop service. You may need to stop it manually."
    echo "   Run: ssh ${remoteUser}@${remoteHost} 'sudo systemctl stop skorbord-cards-app'"
fi

# Create backup on remote server first
echo "Creating backup on remote server..."
backupTimestamp=$(date +%Y%m%d_%H%M%S)
remoteBackupPath="/home/pi/skorbord-cards/api/db/cards-sqlite.db.backup.$backupTimestamp"

ssh "${remoteUser}@${remoteHost}" "cp '$remotePath' '$remoteBackupPath'"

if [[ $? -eq 0 ]]; then
    echo "Remote backup created: $remoteBackupPath"
else
    echo "Error: Failed to create remote backup. Aborting." >&2
    exit 1
fi

# Copy the local database and WAL files to the server
echo "Copying database file..."
scp "$localPath" "${remoteUser}@${remoteHost}:${remotePath}"

# Also copy WAL files if they exist locally
walFile="${localPath}-wal"
shmFile="${localPath}-shm"

if [[ -f "$walFile" ]]; then
    echo "Copying WAL file..."
    scp "$walFile" "${remoteUser}@${remoteHost}:${remotePath}-wal"
fi

if [[ -f "$shmFile" ]]; then
    echo "Copying SHM file..."
    scp "$shmFile" "${remoteUser}@${remoteHost}:${remotePath}-shm"
fi

if [[ $? -eq 0 ]]; then
    echo "Successfully copied local database to ${remoteUser}@${remoteHost}:${remotePath}"
    
    # Verify the copied file
    echo "Verifying copied file..."
    remoteSize=$(ssh "${remoteUser}@${remoteHost}" "stat -c%s '$remotePath'")
    
    if [[ $localSize -eq $remoteSize ]]; then
        echo "✅ File size verification passed (Local: $localSize bytes, Remote: $remoteSize bytes)"
        
        # Set proper file permissions
        echo "Setting file permissions..."
        ssh "${remoteUser}@${remoteHost}" "chown pi:pi '$remotePath' '$remotePath'-* 2>/dev/null || true"
        ssh "${remoteUser}@${remoteHost}" "chmod 644 '$remotePath' '$remotePath'-* 2>/dev/null || true"
        
        # Restart the service to ensure it picks up the new database
        echo "Restarting Skorbord Cards App service..."
        ssh "${remoteUser}@${remoteHost}" "sudo systemctl restart skorbord-cards-app"
        
        if [[ $? -eq 0 ]]; then
            echo "✅ Service restart command executed successfully"
            
            # Wait a moment and check service status
            echo "Checking service status..."
            sleep 2
            serviceStatus=$(ssh "${remoteUser}@${remoteHost}" "sudo systemctl is-active skorbord-cards-app")
            
            if [[ "$serviceStatus" == "active" ]]; then
                echo "✅ Service is running and active"
                echo "🎉 Database copy operation completed successfully!"
                echo "📁 Remote backup available at: $remoteBackupPath"
            else
                echo "⚠️  Warning: Service may not be running properly (Status: $serviceStatus)"
                echo "   Check service logs: ssh ${remoteUser}@${remoteHost} 'sudo journalctl -u skorbord-cards-app -f'"
            fi
        else
            echo "⚠️  Warning: Failed to restart service. You may need to restart it manually."
            echo "   Run: ssh ${remoteUser}@${remoteHost} 'sudo systemctl restart skorbord-cards-app'"
        fi
    else
        echo "❌ Error: File size mismatch after copy (Local: $localSize, Remote: $remoteSize)" >&2
        echo "Restoring from backup and restarting service..."
        ssh "${remoteUser}@${remoteHost}" "cp '$remoteBackupPath' '$remotePath'"
        ssh "${remoteUser}@${remoteHost}" "sudo systemctl start skorbord-cards-app"
        exit 1
    fi
else
    echo "❌ Error: Failed to copy database file. Check your network and SSH keys." >&2
    echo "Restarting service to restore normal operation..."
    ssh "${remoteUser}@${remoteHost}" "sudo systemctl start skorbord-cards-app"
    exit 1
fi
