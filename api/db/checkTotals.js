#!/usr/bin/env node
/**
 * Prints any game and player whose cached stats.score does not equal the sum
 * of their round points. Exits 1 if there is a mismatch.
 *
 * Usage: DATABASE_URL=sqlite:///db/cards-sqlite.db node db/checkTotals.js
 */
import db from './database.js';
import { findTotalMismatches } from './roundTotals.js';

try {
  const mismatches = await findTotalMismatches(db);
  if (mismatches.length === 0) {
    console.log('✅ Every cached total matches its round points');
  } else {
    console.error(`❌ ${mismatches.length} mismatch(es):`);
    console.table(mismatches);
    process.exitCode = 1;
  }
} finally {
  await db.close();
}
