# Script to execute SQL files on the production SQLite database on Raspberry Pi
# Usage: .\run-sql-on-pi.ps1 -SqlFile <sql-file-path>
# Example: .\run-sql-on-pi.ps1 -SqlFile ..\api\db\insert-sqids.sql

param(
    [Parameter(Mandatory=$true)]
    [string]$SqlFile
)

# Configuration
$PI_HOST = "raspberrypi.local"
$PI_USER = "pi"
$PI_APP_DIR = "/home/pi/skorbord-cards"
$PI_DB_PATH = "/home/pi/skorbord-cards/api/db/cards-sqlite.db"

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

# Check if SQL file exists
if (-not (Test-Path $SqlFile)) {
    Write-Error "SQL file not found: $SqlFile"
    exit 1
}

# Get the basename of the SQL file for remote operations
$SqlFileName = Split-Path $SqlFile -Leaf

Write-Status "Starting SQL execution on Raspberry Pi..."
Write-Status "SQL file: $SqlFile"
Write-Status "Target database: $PI_DB_PATH"

try {
    # Step 1: Copy SQL file to Raspberry Pi
    Write-Status "Copying SQL file to Raspberry Pi..."
    
    $scpCommand = "scp `"$SqlFile`" ${PI_USER}@${PI_HOST}:${PI_APP_DIR}/"
    $result = cmd /c $scpCommand 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to copy SQL file to Raspberry Pi"
        Write-Error $result
        exit 1
    }

    # Step 2: Execute SQL file on Raspberry Pi
    Write-Status "Executing SQL file on Raspberry Pi..."

    # Create a temporary script to run on the Pi
    $tempScriptContent = @"
#!/bin/bash
set -e

SQL_FILE="`$1"
DB_PATH="`$2"
APP_DIR="`$3"

echo "Changing to application directory: `$APP_DIR"
cd "`$APP_DIR"

echo "Checking if database exists..."
if [ ! -f "`$DB_PATH" ]; then
    echo "ERROR: Database file not found at `$DB_PATH"
    exit 1
fi

echo "Creating backup of database..."
BACKUP_FILE="`$DB_PATH.backup.`$(date +%Y%m%d_%H%M%S)"
cp "`$DB_PATH" "`$BACKUP_FILE"
echo "Backup created: `$BACKUP_FILE"

echo "Executing SQL file: `$SQL_FILE"
echo "Database: `$DB_PATH"

# Execute the SQL file using sqlite3
sqlite3 "`$DB_PATH" < "`$SQL_FILE"

if [ `$? -eq 0 ]; then
    echo "SQL execution completed successfully!"
    echo "Cleaning up SQL file..."
    rm -f "`$SQL_FILE"
else
    echo "ERROR: SQL execution failed!"
    echo "Restoring from backup..."
    cp "`$BACKUP_FILE" "`$DB_PATH"
    echo "Database restored from backup"
    exit 1
fi
"@

    $tempScriptPath = "$env:TEMP\execute_sql_$(Get-Random).sh"
    $tempScriptContent | Out-File -FilePath $tempScriptPath -Encoding UTF8

    # Copy and execute the script on the Pi
    $tempScriptName = Split-Path $tempScriptPath -Leaf
    
    $scpScriptCommand = "scp `"$tempScriptPath`" ${PI_USER}@${PI_HOST}:/tmp/"
    cmd /c $scpScriptCommand
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to copy execution script to Raspberry Pi"
        exit 1
    }

    $sshCommand = "ssh ${PI_USER}@${PI_HOST} `"chmod +x /tmp/$tempScriptName && /tmp/$tempScriptName '$SqlFileName' '$PI_DB_PATH' '$PI_APP_DIR'`""
    $result = cmd /c $sshCommand 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Status "SQL execution completed successfully!"
        
        # Optional: Restart the service to ensure it picks up any changes
        Write-Status "Restarting Skorbord Cards App service..."
        $restartCommand = "ssh ${PI_USER}@${PI_HOST} `"sudo systemctl restart skorbord-cards-app`""
        cmd /c $restartCommand
        
        if ($LASTEXITCODE -eq 0) {
            Write-Status "Service restarted successfully!"
        } else {
            Write-Warning "Failed to restart service. You may need to restart it manually."
        }
    } else {
        Write-Error "SQL execution failed!"
        Write-Error $result
        exit 1
    }

    # Cleanup
    Remove-Item $tempScriptPath -Force -ErrorAction SilentlyContinue
    $cleanupCommand = "ssh ${PI_USER}@${PI_HOST} `"rm -f /tmp/$tempScriptName`""
    cmd /c $cleanupCommand

    Write-Status "Operation completed successfully!"
    Write-Status "Database backup was created before executing the SQL"

} catch {
    Write-Error "An error occurred: $_"
    exit 1
}
