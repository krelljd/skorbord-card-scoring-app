#!/usr/bin/env bash
# Run ON THE PI to undo a release made after pi-backup.sh.
# Restores the database, the code and the old node_modules, then starts the app.
# Anything scored after the backup is lost. The database you roll back FROM is
# kept in the backup folder, so even a rollback can be reversed by hand.
#
# Usage: ./pi-rollback.sh [--code-only] [--yes] [--dry-run] [backup-folder]
#   backup-folder defaults to the one named in $BACKUP_ROOT/LATEST.
#   --code-only  restore the code and node_modules but leave the database as it is.
#                Use it when the new code misbehaves but the data is fine. The old code
#                does not read the round tables, so games scored since will keep their
#                round detail unused, and old code adds to totals directly.
#   --dry-run  print what would happen and change nothing.
#   --yes      skip the typed confirmation.
#
# Settings (environment variables, all optional): APP_DIR, BACKUP_ROOT, SERVICE,
# SYSTEMCTL as in pi-backup.sh, plus HEALTH_URL (default http://localhost:2525/health).
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/skorbord-cards/api}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/skorbord-backups}"
SERVICE="${SERVICE:-skorbord-cards-app}"
SYSTEMCTL="${SYSTEMCTL:-sudo systemctl}"
HEALTH_URL="${HEALTH_URL-http://localhost:2525/health}"  # set to empty to skip the check

YES=0
DRY=0
CODE_ONLY=0
DIR=""
for arg in "$@"; do
  case "$arg" in
    --yes) YES=1 ;;
    --code-only) CODE_ONLY=1 ;;
    --dry-run) DRY=1 ;;
    *) DIR="$arg" ;;
  esac
done

fail() { echo "ERROR: $*" >&2; exit 1; }
run() {
  if [ "$DRY" = 1 ]; then echo "[dry run] $*"; else "$@"; fi
}

[ -n "$DIR" ] || { [ -f "$BACKUP_ROOT/LATEST" ] && DIR="$(cat "$BACKUP_ROOT/LATEST")"; }
[ -n "$DIR" ] || fail "No backup folder given and $BACKUP_ROOT/LATEST does not exist"
[ -d "$DIR" ] || fail "Backup folder not found: $DIR"
[ -f "$DIR/MANIFEST" ] || fail "No MANIFEST in $DIR"
[ -f "$DIR/api-code.tar.gz" ] || fail "No api-code.tar.gz in $DIR"
[ -f "$DIR/cards-sqlite.db" ] || fail "No cards-sqlite.db in $DIR"

echo "Checking the backup is intact ..."
( cd "$DIR" && sha256sum -c MANIFEST ) || fail "Backup failed its checksum. Nothing was changed."

if [ "$YES" != 1 ] && [ "$DRY" != 1 ]; then
  echo
  if [ "$CODE_ONLY" = 1 ]; then
    echo "This restores the code and node_modules from:"
    echo "  $DIR"
    echo "The database is left as it is."
  else
    echo "This restores the database and code from:"
    echo "  $DIR"
    echo "Anything scored since that backup will be lost."
  fi
  read -r -p "Type ROLLBACK to continue: " answer
  [ "$answer" = "ROLLBACK" ] || fail "Cancelled. Nothing was changed."
fi

TS="$(date +%F-%H%M%S)"
KEEP="$DIR/rolled-back-$TS"

echo "Stopping $SERVICE ..."
run $SYSTEMCTL stop "$SERVICE"

if [ "$CODE_ONLY" != 1 ]; then
  echo "Keeping the current database in $KEEP ..."
  run mkdir -p "$KEEP"
  for f in "$APP_DIR"/db/cards-sqlite.db "$APP_DIR"/db/cards-sqlite.db-wal "$APP_DIR"/db/cards-sqlite.db-shm; do
    if [ -f "$f" ]; then run cp -p "$f" "$KEEP/"; fi
  done
fi

echo "Restoring node_modules ..."
if [ -d "$APP_DIR/node_modules.old" ]; then
  if [ -d "$APP_DIR/node_modules" ]; then run mv "$APP_DIR/node_modules" "$APP_DIR/node_modules.failed-$TS"; fi
  run mv "$APP_DIR/node_modules.old" "$APP_DIR/node_modules"
else
  echo "WARNING: no node_modules.old found. Keeping the current node_modules." >&2
  echo "         The old code may need its old packages: run 'npm ci' with the old package-lock.json." >&2
fi

echo "Restoring the code ..."
run tar xzf "$DIR/api-code.tar.gz" -C "$APP_DIR"

if [ "$CODE_ONLY" != 1 ]; then
  echo "Restoring the database ..."
  run rm -f "$APP_DIR"/db/cards-sqlite.db "$APP_DIR"/db/cards-sqlite.db-wal "$APP_DIR"/db/cards-sqlite.db-shm
  for f in "$DIR"/cards-sqlite.db*; do
    run cp -p "$f" "$APP_DIR/db/"
  done
  if [ "$DRY" != 1 ]; then
    for f in "$DIR"/cards-sqlite.db*; do
      cmp -s "$f" "$APP_DIR/db/$(basename "$f")" || fail "Restored $(basename "$f") does not match the backup. The app is still stopped."
    done
  fi
fi

echo "Starting $SERVICE ..."
run $SYSTEMCTL start "$SERVICE"

if [ "$DRY" != 1 ] && [ -n "$HEALTH_URL" ] && command -v curl >/dev/null 2>&1; then
  echo "Waiting for the app to answer at $HEALTH_URL ..."
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fs "$HEALTH_URL" >/dev/null 2>&1; then
      echo "App is healthy."
      echo "Rollback done."
      [ "$CODE_ONLY" = 1 ] || echo "The database you rolled back from is in $KEEP"
      exit 0
    fi
    sleep 2
  done
  echo "WARNING: the app did not answer. Check: sudo journalctl -u $SERVICE -n 50" >&2
  exit 2
fi
echo "Rollback done."
[ "$CODE_ONLY" = 1 ] || echo "The database you rolled back from is in $KEEP"
