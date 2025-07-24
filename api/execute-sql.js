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
import sqlite3 from 'sqlite3';
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
 * Create a backup of the database
 */
async function createBackup(dbPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.backup.${timestamp}`;
  
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(dbPath);
    const writeStream = fs.createWriteStream(backupPath);
    
    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', () => resolve(backupPath));
    
    readStream.pipe(writeStream);
  });
}

/**
 * Execute SQL file against the database
 */
async function executeSqlFile(sqlFilePath, dbPath) {
  return new Promise((resolve, reject) => {
    // Check if SQL file exists
    if (!fs.existsSync(sqlFilePath)) {
      return reject(new Error(`SQL file not found: ${sqlFilePath}`));
    }

    // Check if database exists
    if (!fs.existsSync(dbPath)) {
      return reject(new Error(`Database file not found: ${dbPath}`));
    }

    // Read SQL content
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    if (!sqlContent.trim()) {
      return reject(new Error('SQL file is empty'));
    }

    // Connect to database
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        return reject(new Error(`Failed to connect to database: ${err.message}`));
      }
    });

    // Enable foreign key constraints
    db.run('PRAGMA foreign_keys = ON', (err) => {
      if (err) {
        logWarning(`Failed to enable foreign key constraints: ${err.message}`);
      }
    });

    // Execute SQL in a transaction
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          db.close();
          return reject(new Error(`Failed to begin transaction: ${err.message}`));
        }

        // Split SQL content by semicolons and execute each statement
        const statements = sqlContent
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0);

        let executedStatements = 0;
        let hasError = false;

        if (statements.length === 0) {
          db.run('ROLLBACK', () => {
            db.close();
            reject(new Error('No valid SQL statements found'));
          });
          return;
        }

        const executeStatement = (index) => {
          if (index >= statements.length) {
            // All statements executed successfully
            db.run('COMMIT', (err) => {
              db.close();
              if (err) {
                reject(new Error(`Failed to commit transaction: ${err.message}`));
              } else {
                resolve(executedStatements);
              }
            });
            return;
          }

          if (hasError) return;

          const statement = statements[index];
          logInfo(`Executing statement ${index + 1}/${statements.length}...`);
          
          db.run(statement, function(err) {
            if (err) {
              hasError = true;
              logError(`Statement ${index + 1} failed: ${err.message}`);
              logError(`Statement: ${statement}`);
              
              db.run('ROLLBACK', () => {
                db.close();
                reject(new Error(`SQL execution failed at statement ${index + 1}: ${err.message}`));
              });
              return;
            }

            executedStatements++;
            if (this.changes > 0) {
              logInfo(`Statement ${index + 1} completed successfully (${this.changes} rows affected)`);
            } else {
              logInfo(`Statement ${index + 1} completed successfully`);
            }
            
            executeStatement(index + 1);
          });
        };

        executeStatement(0);
      });
    });
  });
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
    const executedStatements = await executeSqlFile(sqlFilePath, dbPath);
    
    logSuccess(`SQL execution completed successfully!`);
    logSuccess(`Executed ${executedStatements} SQL statements`);
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
