#!/bin/bash

# Script to execute SQL files on the production SQLite database on Raspberry Pi
# Usage: ./run-sql-on-pi.sh <sql-file-path>
# Example: ./run-sql-on-pi.sh ../api/db/insert-sqids.sql

set -e  # Exit on any error

# Configuration
PI_HOST="raspberrypi.local"
PI_USER="pi"
PI_APP_DIR="/home/pi/skorbord-cards"
PI_DB_PATH="/home/pi/skorbord-cards/api/db/cards-sqlite.db"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if SQL file argument is provided
if [ $# -eq 0 ]; then
    print_error "Usage: $0 <sql-file-path>"
    print_error "Example: $0 ../api/db/insert-sqids.sql"
    exit 1
fi

SQL_FILE="$1"

# Check if SQL file exists
if [ ! -f "$SQL_FILE" ]; then
    print_error "SQL file not found: $SQL_FILE"
    exit 1
fi

# Get the basename of the SQL file for remote operations
SQL_FILENAME=$(basename "$SQL_FILE")

print_status "Starting SQL execution on Raspberry Pi..."
print_status "SQL file: $SQL_FILE"
print_status "Target database: $PI_DB_PATH"

# Step 1: Copy SQL file to Raspberry Pi
print_status "Copying SQL file to Raspberry Pi..."
scp "$SQL_FILE" "$PI_USER@$PI_HOST:$PI_APP_DIR/"

if [ $? -ne 0 ]; then
    print_error "Failed to copy SQL file to Raspberry Pi"
    exit 1
fi

# Step 2: Execute SQL file on Raspberry Pi
print_status "Executing SQL file on Raspberry Pi..."

# Create a temporary script to run on the Pi
TEMP_SCRIPT="/tmp/execute_sql_$$.sh"
cat > "$TEMP_SCRIPT" << 'EOF'
#!/bin/bash
set -e

SQL_FILE="$1"
DB_PATH="$2"
APP_DIR="$3"

echo "Changing to application directory: $APP_DIR"
cd "$APP_DIR"

echo "Checking if database exists..."
if [ ! -f "$DB_PATH" ]; then
    echo "ERROR: Database file not found at $DB_PATH"
    exit 1
fi

echo "Creating backup of database..."
BACKUP_FILE="$DB_PATH.backup.$(date +%Y%m%d_%H%M%S)"
cp "$DB_PATH" "$BACKUP_FILE"
echo "Backup created: $BACKUP_FILE"

echo "Executing SQL file: $SQL_FILE"
echo "Database: $DB_PATH"

# Execute the SQL file using sqlite3
sqlite3 "$DB_PATH" < "$SQL_FILE"

if [ $? -eq 0 ]; then
    echo "SQL execution completed successfully!"
    echo "Cleaning up SQL file..."
    rm -f "$SQL_FILE"
else
    echo "ERROR: SQL execution failed!"
    echo "Restoring from backup..."
    cp "$BACKUP_FILE" "$DB_PATH"
    echo "Database restored from backup"
    exit 1
fi
EOF

# Copy and execute the script on the Pi
scp "$TEMP_SCRIPT" "$PI_USER@$PI_HOST:/tmp/"
ssh "$PI_USER@$PI_HOST" "chmod +x /tmp/$(basename $TEMP_SCRIPT) && /tmp/$(basename $TEMP_SCRIPT) '$SQL_FILENAME' '$PI_DB_PATH' '$PI_APP_DIR'"

if [ $? -eq 0 ]; then
    print_status "SQL execution completed successfully!"
    
    # Optional: Restart the service to ensure it picks up any changes
    print_status "Restarting Skorbord Cards App service..."
    ssh "$PI_USER@$PI_HOST" "sudo systemctl restart skorbord-cards-app"
    
    if [ $? -eq 0 ]; then
        print_status "Service restarted successfully!"
    else
        print_warning "Failed to restart service. You may need to restart it manually."
    fi
else
    print_error "SQL execution failed!"
    exit 1
fi

# Cleanup
rm -f "$TEMP_SCRIPT"
ssh "$PI_USER@$PI_HOST" "rm -f /tmp/$(basename $TEMP_SCRIPT)"

print_status "Operation completed successfully!"
print_status "Database backup was created before executing the SQL"
