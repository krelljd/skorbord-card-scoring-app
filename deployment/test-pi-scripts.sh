#!/usr/bin/env bash
# Tests pi-backup.sh and pi-rollback.sh against a throwaway folder. No Pi needed.
# Usage: bash deployment/test-pi-scripts.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

export APP_DIR="$T/api" BACKUP_ROOT="$T/backups" SYSTEMCTL="echo systemctl" SERVICE=svc HEALTH_URL=""
pass() { echo "PASS $1"; }
bad() { echo "FAIL $1"; exit 1; }

mkdir -p "$APP_DIR/db" "$APP_DIR/node_modules/old-driver" "$APP_DIR/routes"
echo "old database" > "$APP_DIR/db/cards-sqlite.db"
echo "old wal" > "$APP_DIR/db/cards-sqlite.db-wal"
echo "old driver" > "$APP_DIR/node_modules/old-driver/index.js"
echo "old routes" > "$APP_DIR/routes/games.js"

bash "$HERE/pi-backup.sh" pre-test > "$T/backup.log"
[ ! -d "$APP_DIR/node_modules" ] && [ -d "$APP_DIR/node_modules.old" ] && pass "backup sets node_modules aside" || bad "node_modules.old"
[ -f "$BACKUP_ROOT/LATEST" ] && pass "backup records LATEST" || bad "LATEST"
grep -q "systemctl stop svc" "$T/backup.log" && pass "backup stops the service" || bad "stop"

if bash "$HERE/pi-backup.sh" pre-test >/dev/null 2>&1; then bad "second backup should refuse while node_modules.old exists"; else pass "second backup refuses while node_modules.old exists"; fi

# Simulate the release: new modules, new code, migrated database, a game played afterwards
mkdir -p "$APP_DIR/node_modules/new-driver"
echo "new driver" > "$APP_DIR/node_modules/new-driver/index.js"
echo "new routes" > "$APP_DIR/routes/games.js"
echo "new file" > "$APP_DIR/routes/rounds.js"
echo "migrated database + new game" > "$APP_DIR/db/cards-sqlite.db"
rm -f "$APP_DIR/db/cards-sqlite.db-wal"

bash "$HERE/pi-rollback.sh" --dry-run > "$T/dry.log"
grep -q "migrated" "$APP_DIR/db/cards-sqlite.db" && pass "dry run changes nothing" || bad "dry run changed the database"

bash "$HERE/pi-rollback.sh" --yes > "$T/rollback.log"
[ "$(cat "$APP_DIR/db/cards-sqlite.db")" = "old database" ] && pass "database restored" || bad "database"
[ "$(cat "$APP_DIR/db/cards-sqlite.db-wal")" = "old wal" ] && pass "wal file restored" || bad "wal"
[ "$(cat "$APP_DIR/routes/games.js")" = "old routes" ] && pass "code restored" || bad "code"
[ -f "$APP_DIR/node_modules/old-driver/index.js" ] && [ ! -d "$APP_DIR/node_modules/new-driver" ] && pass "old node_modules restored" || bad "node_modules"
ls "$APP_DIR"/node_modules.failed-* >/dev/null 2>&1 && pass "failed node_modules kept aside" || bad "failed node_modules"
KEPT="$(ls -d "$BACKUP_ROOT"/pre-test-*/rolled-back-* | head -1)"
grep -q "migrated" "$KEPT/cards-sqlite.db" && pass "rolled-back-from database kept" || bad "kept database"
grep -q "systemctl start svc" "$T/rollback.log" && pass "rollback starts the service" || bad "start"

# A damaged backup must stop the rollback before it touches anything
echo "migrated again" > "$APP_DIR/db/cards-sqlite.db"
BK="$(cat "$BACKUP_ROOT/LATEST")"
echo "tampered" > "$BK/cards-sqlite.db"
if bash "$HERE/pi-rollback.sh" --yes >/dev/null 2>&1; then bad "rollback should refuse a damaged backup"; else pass "damaged backup refused"; fi
[ "$(cat "$APP_DIR/db/cards-sqlite.db")" = "migrated again" ] && pass "damaged backup left everything untouched" || bad "untouched"

# Typed confirmation: anything but ROLLBACK cancels
echo "old database" > "$BK/cards-sqlite.db"; ( cd "$BK" && sha256sum cards-sqlite.db* api-code.tar.gz > MANIFEST )
if echo "no" | bash "$HERE/pi-rollback.sh" >/dev/null 2>&1; then bad "wrong confirmation should cancel"; else pass "wrong confirmation cancels"; fi
[ "$(cat "$APP_DIR/db/cards-sqlite.db")" = "migrated again" ] && pass "cancel left everything untouched" || bad "cancel changed data"

# --code-only restores code and modules but leaves the database alone
echo "old database" > "$BK/cards-sqlite.db"; ( cd "$BK" && sha256sum cards-sqlite.db* api-code.tar.gz > MANIFEST )
rm -rf "$APP_DIR/node_modules"; mkdir -p "$APP_DIR/node_modules/new-driver"; mv "$APP_DIR"/node_modules.failed-* "$APP_DIR/node_modules.old" 2>/dev/null || mkdir -p "$APP_DIR/node_modules.old/old-driver"
echo "new routes" > "$APP_DIR/routes/games.js"
bash "$HERE/pi-rollback.sh" --code-only --yes >/dev/null
[ "$(cat "$APP_DIR/routes/games.js")" = "old routes" ] && pass "code-only restores code" || bad "code-only code"
[ "$(cat "$APP_DIR/db/cards-sqlite.db")" = "migrated again" ] && pass "code-only leaves the database alone" || bad "code-only touched the database"
