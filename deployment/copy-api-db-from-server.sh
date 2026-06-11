#!/usr/bin/env zsh
# Copies cards-sqlite.db from Raspberry Pi to local api/db/cards-sqlite.db
# Usage: ./copy-api-db-from-server.sh

set -e  # Exit on any error

remoteUser="pi"
remoteHost="raspberrypi.local"
remotePath="/home/pi/skorbord-cards/api/db/cards-sqlite.db"
localPath="api/db/cards-sqlite.db"

echo "Copying ${remoteUser}@${remoteHost}:${remotePath} to ${localPath} ..."

# Verify local directory exists
localDir=$(dirname "$localPath")
if [[ ! -d "$localDir" ]]; then
    echo "Error: Local directory '$localDir' does not exist. Aborting." >&2
    exit 1
fi

# Use scp to copy the file
scp "${remoteUser}@${remoteHost}:${remotePath}" "$localPath"

if [[ $? -eq 0 ]]; then
    echo "Successfully copied cards-sqlite.db to $localPath"
else
    echo "Error: Failed to copy cards-sqlite.db. Check your network and SSH keys." >&2
    exit 1
fi
