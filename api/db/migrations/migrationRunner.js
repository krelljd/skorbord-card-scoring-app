import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The migrations that existed before the baseline. A database that has applied
// all of them already has the baseline schema, so the baseline is recorded as
// applied for it without being run.
export const BASELINE_MIGRATION = '001_baseline.sql';
export const LEGACY_MIGRATIONS = ['001_initial_schema.sql', '002_add_player_order.sql'];

const DOWN_MARKER = '-- +migrate Down';

/**
 * Returns only the "Up" part of a migration file.
 */
export function upSection(sql) {
  const idx = sql.indexOf(DOWN_MARKER);
  return idx === -1 ? sql : sql.slice(0, idx);
}

/**
 * Migration runner for SQLite database
 */
export class MigrationRunner {
  constructor(db, { migrationsDir = __dirname } = {}) {
    this.db = db;
    this.migrationsDir = migrationsDir;
  }

  async createMigrationTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await this.db.run(sql);
  }

  async getAppliedMigrations() {
    try {
      const result = await this.db.query('SELECT name FROM migrations ORDER BY name');
      return result.map(row => row.name);
    } catch (error) {
      // If table doesn't exist, return empty array
      return [];
    }
  }

  async markMigrationAsApplied(migrationName) {
    await this.db.run('INSERT INTO migrations (name) VALUES (?)', [migrationName]);
  }

  async getMigrationFiles() {
    return fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
  }

  /**
   * Databases created before the baseline recorded 001_initial_schema.sql and
   * 002_add_player_order.sql. Mark the baseline as applied for them so it is
   * never run on top of existing tables. A database with only some of the
   * legacy migrations cannot be baselined safely and is rejected.
   */
  async baselineLegacyDatabase(applied) {
    if (applied.includes(BASELINE_MIGRATION)) return applied;

    const legacyApplied = LEGACY_MIGRATIONS.filter(name => applied.includes(name));
    if (legacyApplied.length === 0) return applied;

    if (legacyApplied.length !== LEGACY_MIGRATIONS.length) {
      throw new Error(
        `Database applied only part of the legacy migrations (${legacyApplied.join(', ')}). ` +
        `Bring it to ${LEGACY_MIGRATIONS[LEGACY_MIGRATIONS.length - 1]} before upgrading.`
      );
    }

    console.log(`📌 Existing database detected; recording ${BASELINE_MIGRATION} as applied`);
    await this.markMigrationAsApplied(BASELINE_MIGRATION);
    return [...applied, BASELINE_MIGRATION];
  }

  async runMigration(filename) {
    const sql = upSection(fs.readFileSync(join(this.migrationsDir, filename), 'utf8'));

    console.log(`🔄 Running migration: ${filename}`);

    // Wrap migration in a transaction. exec() runs the whole file, so
    // semicolons inside strings, comments, or triggers are handled by SQLite.
    try {
      await this.db.run('BEGIN TRANSACTION');
      await this.db.exec(sql);
      await this.markMigrationAsApplied(filename);
      await this.db.run('COMMIT');
      console.log(`✅ Migration completed: ${filename}`);
    } catch (err) {
      await this.db.run('ROLLBACK');
      console.error(`❌ Migration failed: ${filename}`);
      throw err;
    }
  }

  async run() {
    console.log('🔄 Starting database migrations...');
    // Create migrations table if it doesn't exist
    await this.createMigrationTable();
    // Get applied and pending migrations
    let appliedMigrations = await this.getAppliedMigrations();
    appliedMigrations = await this.baselineLegacyDatabase(appliedMigrations);
    const migrationFiles = await this.getMigrationFiles();
    console.log('🗂 Migration files found:', migrationFiles);
    console.log('📝 Applied migrations:', appliedMigrations);
    const pendingMigrations = migrationFiles.filter(
      file => !appliedMigrations.includes(file)
    );
    console.log('🕒 Pending migrations:', pendingMigrations);
    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }
    console.log(`🔄 Found ${pendingMigrations.length} pending migrations`);
    // Run pending migrations
    for (const migration of pendingMigrations) {
      await this.runMigration(migration);
    }
    console.log('✅ All migrations completed successfully');
  }
}


export async function runMigrations(db) {
  const runner = new MigrationRunner(db);
  await runner.run();
}

// Add top-level script runner for CLI usage

// ES module entry point check
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 migrationRunner.js starting...');
  import('../database.js').then(async ({ default: db }) => {
    try {
      await runMigrations(db);
      console.log('🏁 migrationRunner.js finished.');
      process.exit(0);
    } catch (err) {
      console.error('❌ migrationRunner.js error:', err);
      process.exit(1);
    }
  });
}
