import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseManager {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      return this.db;
    }

    try {
      // Parse database URL
      const dbUrl = process.env.DATABASE_URL || 'sqlite:///db/cards-sqlite.db';
      let dbPath = dbUrl.replace(/^sqlite:\/\/\//, '');
      
      // Handle relative paths
      if (!dbPath.startsWith('/')) {
        dbPath = join(__dirname, '..', dbPath);
      }

      // Ensure directory exists
      const dbDir = dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Initialize SQLite with sqlite3
      this.db = new sqlite3.Database(dbPath);
      
      // Set initialized flag before running PRAGMA statements to avoid infinite recursion
      this.isInitialized = true;
      
      // Enable foreign key constraints
      await this.run('PRAGMA foreign_keys = ON');
      
      // Enable WAL mode for better concurrency
      await this.run('PRAGMA journal_mode = WAL');

      console.log(`📊 SQLite database initialized: ${dbPath}`);
      
      return this.db;
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      this.isInitialized = false; // Reset flag on error
      throw error;
    }
  }

  async query(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('❌ Database query error:', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async run(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          console.error('❌ Database run error:', err);
          reject(err);
        } else {
          resolve({ changes: this.changes, lastID: this.lastID });
        }
      });
    });
  }

  async get(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          console.error('❌ Database get error:', err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close((err) => {
          if (err) {
            console.error('❌ Database close error:', err);
          }
          this.isInitialized = false;
          resolve();
        });
      });
    }
    this.isInitialized = false;
  }

  // Transaction support
  async transaction(callback) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.run('BEGIN TRANSACTION');
      const result = await callback(this);
      await this.run('COMMIT');
      return result;
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const result = await this.query('SELECT 1 as health');
      return result.length > 0 && result[0].health === 1;
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      return false;
    }
  }
}

// Create singleton instance
const db = new DatabaseManager();

export default db;
