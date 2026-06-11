// delete-all-games.js
// Utility script to delete all rows from the games table in the SQLite database.
// This script is idempotent and safe to run multiple times.
// Usage: `node delete-all-games.js`
//
// Context7: For code search, documentation, and developer experience, see https://context7.com/.

import db from './db/database.js';

async function deleteAllGames() {
  try {
    await db.initialize();
    const result = await db.run('DELETE FROM games');
    console.log(`✅ Deleted all rows from games. Rows affected: ${result.changes}`);
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to delete rows from games:', error);
    process.exit(1);
  }
}

deleteAllGames();
