import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { upSection } from '../../db/migrations/migrationRunner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Applies the "Up" portion of every migration in db/migrations, in order,
 * against the given db handle. Tests use this instead of a hand-rolled
 * subset of tables so foreign keys, cascades, and unique indexes all
 * behave exactly like production.
 */
export async function applySchema(db) {
  const migrationsDir = join(__dirname, '..', '..', 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(join(migrationsDir, file), 'utf8');
    await db.exec(upSection(sql));
  }
}
