import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RETRYABLE_CODES = new Set(['SQLITE_BUSY', 'SQLITE_IOERR', 'SQLITE_LOCKED']);

/**
 * Retry a DB operation on transient SQLite errors with linear backoff.
 * @param {() => Promise<any>} fn
 * @param {{ retries?: number, delayMs?: number }} [opts]
 */
export async function retryOnBusy(fn, { retries = 3, delayMs = 50 } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!RETRYABLE_CODES.has(error?.code) || attempt >= retries) {
        throw error;
      }
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}

class DatabaseManager {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.initPromise = null;
    this.transactionQueue = Promise.resolve(); // serializes transaction()
  }

  initialize() {
    // Cache the in-flight promise so concurrent first callers await one init.
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize().catch((error) => {
      // Allow a later retry if init failed.
      this.initPromise = null;
      this.isInitialized = false;
      throw error;
    });
    return this.initPromise;
  }

  async _doInitialize() {
    const dbUrl = process.env.DATABASE_URL || 'sqlite:///db/cards-sqlite.db';
    let dbPath = dbUrl.replace(/^sqlite:\/\/\//, '');

    if (!dbPath.startsWith('/')) {
      dbPath = join(__dirname, '..', dbPath);
    }

    const dbDir = dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new sqlite3.Database(dbPath);

    // Run PRAGMAs directly against the handle (not through the guarded run()),
    // and only mark initialized once they have all completed.
    await this._runRaw('PRAGMA foreign_keys = ON');
    await this._runRaw('PRAGMA journal_mode = WAL');
    await this._runRaw('PRAGMA busy_timeout = 5000');

    this.isInitialized = true;
    console.log(`📊 SQLite database initialized: ${dbPath}`);
    return this.db;
  }

  // Raw run that does NOT trigger initialize() — used only during init.
  _runRaw(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  }

  async query(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return retryOnBusy(() => new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) { console.error('❌ Database query error:', err); reject(err); }
        else resolve(rows);
      });
    }));
  }

  async run(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return retryOnBusy(() => new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) { console.error('❌ Database run error:', err); reject(err); }
        else resolve({ changes: this.changes, lastID: this.lastID });
      });
    }));
  }

  async get(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return retryOnBusy(() => new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) { console.error('❌ Database get error:', err); reject(err); }
        else resolve(row);
      });
    }));
  }

  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close((err) => {
          if (err) {
            console.error('❌ Database close error:', err);
          }
          this.isInitialized = false;
          this.initPromise = null;
          resolve();
        });
      });
    }
    this.isInitialized = false;
    this.initPromise = null;
  }

  // Transaction support — serialized so a second transaction's BEGIN can
  // never be issued before the first transaction's COMMIT/ROLLBACK has
  // actually completed on the one shared connection.
  async transaction(callback) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const run = async () => {
      try {
        await this.run('BEGIN TRANSACTION');
        const result = await callback(this);
        await this.run('COMMIT');
        return result;
      } catch (error) {
        await this.run('ROLLBACK');
        throw error;
      }
    };

    const result = this.transactionQueue.then(run, run);
    this.transactionQueue = result.then(() => {}, () => {});
    return result;
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
