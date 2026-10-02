import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RETRYABLE_CODES = new Set(['SQLITE_BUSY', 'SQLITE_IOERR', 'SQLITE_LOCKED']);

/**
 * Normalize bind parameters. better-sqlite3 is stricter than the old driver:
 * it rejects booleans, undefined, and Dates, which routes pass today.
 * Booleans become 1/0, undefined becomes NULL, Dates become ISO strings.
 * @param {any[]} params
 */
export function bindParams(params = []) {
  return params.map((value) => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    return value;
  });
}

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

    this.db = new Database(dbPath);

    // PRAGMAs run directly against the handle, and initialization is only
    // marked complete once they have all been applied.
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');

    this.isInitialized = true;
    console.log(`📊 SQLite database initialized: ${dbPath}`);
    return this.db;
  }

  // All statements run synchronously on the one connection; the methods stay
  // async so callers do not change. Statements that return rows (SELECT,
  // PRAGMA reads) go through all(); everything else through run().
  _all(sql, params) {
    const stmt = this.db.prepare(sql);
    return stmt.reader ? stmt.all(...bindParams(params)) : (stmt.run(...bindParams(params)), []);
  }

  _run(sql, params) {
    const stmt = this.db.prepare(sql);
    if (stmt.reader) {
      stmt.all(...bindParams(params));
      return { changes: 0, lastID: 0 };
    }
    const info = stmt.run(...bindParams(params));
    return { changes: info.changes, lastID: Number(info.lastInsertRowid) };
  }

  _get(sql, params) {
    const stmt = this.db.prepare(sql);
    if (!stmt.reader) {
      stmt.run(...bindParams(params));
      return undefined;
    }
    return stmt.get(...bindParams(params));
  }

  _logged(kind, fn) {
    try {
      return fn();
    } catch (error) {
      console.error(`❌ Database ${kind} error:`, error);
      throw error;
    }
  }

  async query(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return retryOnBusy(async () => this._logged('query', () => this._all(sql, params)));
  }

  async run(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return retryOnBusy(async () => this._logged('run', () => this._run(sql, params)));
  }

  // Run a multi-statement SQL script (migrations). No parameters.
  async exec(sql) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return retryOnBusy(async () => this._logged('exec', () => { this.db.exec(sql); }));
  }

  async get(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return retryOnBusy(async () => this._logged('get', () => this._get(sql, params)));
  }

  async close() {
    if (this.db) {
      try {
        this.db.close();
      } catch (error) {
        console.error('❌ Database close error:', error);
      }
    }
    this.db = null;
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
