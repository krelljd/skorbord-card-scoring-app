# SQL Execution Guide for Raspberry Pi

This guide explains how to execute SQL files on the production SQLite database running on your Raspberry Pi.

## Overview

Three methods are available for executing SQL files on the Raspberry Pi:

1. **Remote execution from development machine** (Recommended)
2. **Direct execution on Raspberry Pi**
3. **Manual SQLite command line**

## Method 1: Remote Execution (Recommended)

Execute SQL files remotely from your development machine using the provided scripts.

### Prerequisites

- SSH access to your Raspberry Pi
- SCP file transfer capability
- Raspberry Pi accessible at `raspberrypi.local`

### Usage

#### macOS/Linux

```bash
# Navigate to deployment directory
cd deployment/

# Execute SQL file
./run-sql-on-pi.sh ../api/db/insert-sqids.sql
```

#### Windows (PowerShell)

```powershell
# Navigate to deployment directory
cd deployment/

# Execute SQL file
.\run-sql-on-pi.ps1 -SqlFile ..\api\db\insert-sqids.sql
```

### What the script does

1. Copies the SQL file to the Raspberry Pi
2. Creates a backup of the database before execution
3. Executes the SQL file using SQLite3
4. Restores from backup if execution fails
5. Cleans up temporary files
6. Optionally restarts the Skorbord Cards App service

## Method 2: Direct Execution on Raspberry Pi

Log into your Raspberry Pi and execute SQL files directly using the Node.js executor.

### Steps for Direct Execution

1. **SSH into your Raspberry Pi:**

   ```bash
   ssh pi@raspberrypi.local
   ```

2. **Navigate to the app directory:**

   ```bash
   cd ~/skorbord-cards/api
   ```

3. **Execute SQL file using Node.js:**

   ```bash
   # Using npm script
   npm run sql:execute ./db/insert-sqids.sql
   
   # Or directly with node
   node execute-sql.js ./db/insert-sqids.sql
   ```

### Features of Node.js executor

- Automatic database backup before execution
- Transaction-based execution (all-or-nothing)
- Detailed logging and error reporting
- Foreign key constraint enforcement
- Statement-by-statement execution with progress tracking

## Method 3: Manual SQLite Command Line

For advanced users or debugging purposes.

### Steps for Manual Execution

1. **SSH into your Raspberry Pi:**

   ```bash
   ssh pi@raspberrypi.local
   ```

2. **Navigate to the app directory:**

   ```bash
   cd ~/skorbord-cards/api
   ```

3. **Create manual backup:**

   ```bash
   cp ./db/cards-sqlite.db ./db/cards-sqlite.db.backup.$(date +%Y%m%d_%H%M%S)
   ```

4. **Execute SQL file:**

   ```bash
   sqlite3 ./db/cards-sqlite.db < ./db/insert-sqids.sql
   ```

5. **Verify execution:**

   ```bash
   sqlite3 ./db/cards-sqlite.db "SELECT * FROM sqids;"
   ```

## Database Configuration

### Production Database Location

- **Path:** `/home/pi/skorbord-cards/api/db/cards-sqlite.db`
- **Format:** SQLite 3
- **WAL Mode:** Enabled for better concurrency
- **Foreign Keys:** Enabled

### Environment Variables

The database location can be configured using the `DATABASE_URL` environment variable:

```bash
export DATABASE_URL="sqlite:///db/cards-sqlite.db"
```

## Safety Features

### Automatic Backups

All execution methods create automatic backups before making changes:

- **Format:** `cards-sqlite.db.backup.YYYYMMDD_HHMMSS`
- **Location:** Same directory as the original database

### Transaction Safety

- All SQL statements are executed within a transaction
- If any statement fails, all changes are rolled back
- Database is restored from backup if needed

### Error Handling

- Detailed error messages for debugging
- Automatic cleanup of temporary files
- Service restart capability to apply changes

## Troubleshooting

### Common Issues

1. **SSH Connection Failed:**
   - Verify Raspberry Pi is accessible: `ping raspberrypi.local`
   - Check SSH service: `ssh pi@raspberrypi.local`

2. **Database File Not Found:**
   - Verify the database path: `/home/pi/skorbord-cards/api/db/cards-sqlite.db`
   - Check file permissions

3. **SQL Execution Failed:**
   - Check SQL syntax in the file
   - Verify table/column names exist
   - Review error messages in the output

4. **Service Restart Failed:**
   - Manually restart: `sudo systemctl restart skorbord-cards-app`
   - Check service status: `sudo systemctl status skorbord-cards-app`

### Recovery

If something goes wrong, restore from the automatic backup:

```bash
# Find the latest backup
ls -la ~/skorbord-cards/api/db/cards-sqlite.db.backup.*

# Restore from backup (replace with actual backup filename)
cp ~/skorbord-cards/api/db/cards-sqlite.db.backup.20250715_143022 ~/skorbord-cards/api/db/cards-sqlite.db

# Restart the service
sudo systemctl restart skorbord-cards-app
```

## Examples

### Execute insert-sqids.sql

```bash
# From development machine (macOS/Linux)
./deployment/run-sql-on-pi.sh api/db/insert-sqids.sql

# From development machine (Windows)
.\deployment\run-sql-on-pi.ps1 -SqlFile api\db\insert-sqids.sql

# On Raspberry Pi directly
npm run sql:execute ./db/insert-sqids.sql
```

### Verify the data was inserted

```bash
# SSH to Pi and check
ssh pi@raspberrypi.local
cd ~/skorbord-cards/api
sqlite3 ./db/cards-sqlite.db "SELECT * FROM sqids ORDER BY created_at DESC LIMIT 10;"
```

## Database Copy Operations

For managing database files between your development machine and the Raspberry Pi, use the provided copy scripts.

### Copy Database from Server to Local

Download the production database for local development or backup:

#### macOS/Linux (Copy from Server)

```bash
./deployment/copy-api-db-from-server.sh
```

#### Windows PowerShell (Copy from Server)

```powershell
.\deployment\copy-api-db-from-server.ps1
```

### Copy Database from Local to Server

Upload your local database to replace the production database:

#### macOS/Linux (Copy to Server)

```bash
./deployment/copy-api-db-to-server.sh
```

#### Windows PowerShell (Copy to Server)

```powershell
.\deployment\copy-api-db-to-server.ps1
```

### Safety Features for Database Copy

- **Automatic backup creation** before overwriting production database
- **File size verification** to ensure successful transfer
- **Empty file protection** prevents copying empty databases
- **Service restart** after successful copy to apply changes
- **Automatic restoration** from backup if copy fails

### When to Use Database Copy Scripts

- **Development:** Copy production data locally for testing
- **Deployment:** Push local changes to production
- **Backup:** Create local copies of production data
- **Migration:** Move databases between environments

**⚠️ Warning:** Copying to server will replace the production database. Always ensure you have backups before proceeding.

## Security Notes

- SQL files are temporarily copied to the Pi and deleted after execution
- Database backups are kept for recovery purposes
- All operations are logged for audit purposes
- Consider running these operations during maintenance windows for production systems
