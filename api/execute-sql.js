#!/usr/bin/env node

/**
 * SQL Executor for Raspberry Pi Production Database
 * 
 * This script executes SQL files against the production SQLite database
 * with proper error handling, backup creation, and transaction management.
 * 
 * Usage:
 *   node execute-sql.js <sql-file-path>
 *   
 * Example:
 *   node execute-sql.js ./insert-sqids.sql
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DB_PATH = process.env.DATABASE_URL 
  ? process.env.DATABASE_URL.replace(/^sqlite:\/\/\//, '')
  : path.join(__dirname, 'db', 'cards-sqlite.db');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logInfo(message) {
  log(`[INFO] ${message}`, colors.green);
}

function logWarning(message) {
  log(`[WARNING] ${message}`, colors.yellow);
}

function logError(message) {
  log(`[ERROR] ${message}`, colors.red);
}

function logSuccess(message) {
  log(`[SUCCESS] ${message}`, colors.cyan);
}

/**
 * Create a consistent backup of the database. VACUUM INTO reads through the
 * WAL, so it is safe while the app is running (a plain file copy is not).
 */
async function createBackup(dbPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.backup.${timestamp}`;

  const db = new Database(dbPath, { fileMustExist: true });
  try {
    db.prepare('VACUUM INTO ?').run(backupPath);
  } finally {
    db.close();
  }
  return backupPath;
}

/**
 * Execute SQL file against the database, all in one transaction.
 * Returns the number of rows changed by the whole file.
 */
async function executeSqlFile(sqlFilePath, dbPath) {
  if (!fs.existsSync(sqlFilePath)) {
    throw new Error(`SQL file not found: ${sqlFilePath}`);
  }
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
  if (!sqlContent.trim()) {
    throw new Error('SQL file is empty');
  }

  let db;
  try {
    db = new Database(dbPath, { fileMustExist: true });
  } catch (err) {
    throw new Error(`Failed to connect to database: ${err.message}`);
  }

  try {
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    const before = db.prepare('SELECT total_changes() AS n').get().n;
    db.exec('BEGIN TRANSACTION');
    try {
      db.exec(sqlContent);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`SQL execution failed, transaction rolled back: ${err.message}`);
    }
    return db.prepare('SELECT total_changes() AS n').get().n - before;
  } finally {
    db.close();
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    logError('Usage: node execute-sql.js <sql-file-path>');
    logError('Example: node execute-sql.js ./insert-sqids.sql');
    process.exit(1);
  }

  const sqlFilePath = path.resolve(args[0]);
  const dbPath = path.resolve(DB_PATH);

  logInfo('SQLite SQL Executor for Raspberry Pi');
  logInfo('=====================================');
  logInfo(`SQL file: ${sqlFilePath}`);
  logInfo(`Database: ${dbPath}`);
  logInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  try {
    // Create backup
    logInfo('Creating database backup...');
    const backupPath = await createBackup(dbPath);
    logSuccess(`Backup created: ${backupPath}`);

    // Execute SQL
    logInfo('Executing SQL file...');
    const changedRows = await executeSqlFile(sqlFilePath, dbPath);
    
    logSuccess(`SQL execution completed successfully!`);
    logSuccess(`Rows changed: ${changedRows}`);
    logInfo(`Database backup available at: ${backupPath}`);

  } catch (error) {
    logError(`Operation failed: ${error.message}`);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logError(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError(`Unhandled rejection at:`, promise, 'reason:', reason);
  process.exit(1);
});

// Run main function
main();
