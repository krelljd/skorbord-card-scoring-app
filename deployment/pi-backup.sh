#!/usr/bin/env bash
# Run ON THE PI before a release. Stops the app, backs up the database and the
# code, and sets the old node_modules aside so pi-rollback.sh can undo the release.
#
# Usage: ./pi-backup.sh [label]      (label defaults to "pre-release")
#
# Settings (environment variables, all optional):
#   APP_DIR      the API folder          default ~/skorbord-cards/api
#   BACKUP_ROOT  where backups are kept  default ~/skorbord-backups
#   SERVICE      systemd service name    default skorbord-cards-app
#   SYSTEMCTL    command used to stop it default "sudo systemctl"
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/skorbord-cards/api}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/skorbord-backups}"
SERVICE="${SERVICE:-skorbord-cards-app}"
SYSTEMCTL="${SYSTEMCTL:-sudo systemctl}"
LABEL="${1:-pre-release}"
DB="$APP_DIR/db/cards-sqlite.db"

fail() { echo "ERROR: $*" >&2; exit 1; }

[ -f "$DB" ] || fail "Database not found at $DB"
[ -d "$APP_DIR/node_modules" ] || fail "No node_modules in $APP_DIR (nothing to set aside)"
[ ! -e "$APP_DIR/node_modules.old" ] || fail "$APP_DIR/node_modules.old already exists from an earlier release. Delete it first if you no longer need it."

DIR="$BACKUP_ROOT/$LABEL-$(date +%F-%H%M%S)"
mkdir -p "$DIR"

echo "Stopping $SERVICE ..."
$SYSTEMCTL stop "$SERVICE"

echo "Backing up the database to $DIR ..."
for f in "$DB" "$DB-wal" "$DB-shm"; do
  [ -f "$f" ] && cp -p "$f" "$DIR/"
done

echo "Backing up the code ..."
tar --exclude=node_modules --exclude=node_modules.old --exclude='cards-sqlite.db*' \
    -czf "$DIR/api-code.tar.gz" -C "$APP_DIR" .

echo "Setting the old node_modules aside ..."
mv "$APP_DIR/node_modules" "$APP_DIR/node_modules.old"

# The manifest lets pi-rollback.sh prove the backup is intact before it restores anything.
( cd "$DIR" && sha256sum cards-sqlite.db* api-code.tar.gz > MANIFEST )
for f in "$DIR"/cards-sqlite.db*; do
  base="$(basename "$f")"
  cmp -s "$f" "$APP_DIR/db/$base" || fail "Backup of $base does not match the original. Do not deploy."
done

echo "$DIR" > "$BACKUP_ROOT/LATEST"
echo
echo "Backup done: $DIR"
cat "$DIR/MANIFEST"
echo
echo "The app is STOPPED. Continue with the deploy. To undo it later: ./pi-rollback.sh"
