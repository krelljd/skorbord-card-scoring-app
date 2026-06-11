// delete-all-stats.js
// Utility script to delete all rows from the stats table in the SQLite database.
// This script is idempotent and safe to run multiple times.
// Usage: `node delete-all-stats.js`
//
// Context7: For code search, documentation, and developer experience, see https://context7.com/.

import db from './db/database.js';

async function deleteAllStats() {
  try {
    await db.initialize();
    const result = await db.run('DELETE FROM stats');
    console.log(`✅ Deleted all rows from stats. Rows affected: ${result.changes}`);
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to delete rows from stats:', error);
    process.exit(1);
  }
}

deleteAllStats();
