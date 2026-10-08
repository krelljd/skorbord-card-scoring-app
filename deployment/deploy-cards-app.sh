#!/bin/bash
# Test, build and deploy Skorbord to the Raspberry Pi (bash version). Run it after you make changes.
#
# Usage (from anywhere):  ./deployment/deploy-cards-app.sh [--skip-tests] [--skip-backup] [--force]
#
#   --skip-tests   do not run the API and app tests first
#   --skip-backup  do not back up the database and code on the Pi first (no rollback possible)
#   --force        deploy even if nothing changed since the last deploy
#   --host / --user / --port   where the app lives (defaults: raspberrypi.local, pi, 2525)
#
# What it does:
#   1. Checks the Pi answers over SSH, and stops if the last deploy already has your code.
#   2. Installs local packages, runs the tests, then builds the frontend.
#   3. Runs pi-backup.sh on the Pi: stops the app, backs up the database and code.
#   4. Copies the frontend and backend, installs backend packages on the Pi.
#   5. Runs database migrations on the Pi (npm run migrate), starts the app and waits for /health.
#      The app does NOT run migrations by itself, so a release with a new migration needs this step.
#   6. If a step fails before the app is started again, it restores the old code on the Pi
#      and starts the old version. Migrations are additive, so the old code runs on a migrated
#      database. For a full undo (database too) run pi-rollback.sh on the Pi. If the app starts
#      but is unhealthy, it tells you the rollback commands and leaves the decision to you.
#
# api/.env on the Pi is never touched.

PI_HOST="raspberrypi.local"
PI_USER="pi"
PORT=2525
SKIP_TESTS=false
SKIP_BACKUP=false
FORCE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-tests)  SKIP_TESTS=true ;;
        --skip-backup) SKIP_BACKUP=true ;;
        --force)       FORCE=true ;;
        --host)        PI_HOST="$2"; shift ;;
        --user)        PI_USER="$2"; shift ;;
        --port)        PORT="$2"; shift ;;
        -h|--help)     sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *)             echo "Unknown option: $1"; exit 2 ;;
    esac
    shift
done

TARGET="$PI_USER@$PI_HOST"
SERVICE="skorbord-cards-app.service"
REMOTE_ROOT="~/skorbord-cards"
BACKEND_ARCHIVE="api-deploy.tar.gz"
SERVICE_STARTED=false
ROLLBACK_READY=false
FAILED_STEP=""

step() {
    echo ""
    echo "== $1"
}

# Run a command; if it fails, stop the deploy and name the step
run() {
    local step_name="$1"
    shift
    "$@"
    local code=$?
    if [[ $code -ne 0 ]]; then
        echo "❌ Step failed: $step_name (exit code $code)"
        FAILED_STEP="$step_name"
        exit 1
    fi
}

cleanup() {
    local code=$?
    if [[ $code -ne 0 ]]; then
        echo ""
        echo "DEPLOY FAILED${FAILED_STEP:+: $FAILED_STEP}"
        if [[ "$SERVICE_STARTED" == false && "$ROLLBACK_READY" == true ]]; then
            # Restore the old code only. Migrations are additive, so the old code runs on the migrated database.
            echo "⚠️  Restoring the old code on the Pi ..."
            if ssh "$TARGET" "cd $REMOTE_ROOT && ./pi-rollback.sh --code-only --yes"; then
                echo "⚠️  The old version is running again."
            else
                echo "❌ Automatic rollback failed. On the Pi run: cd $REMOTE_ROOT && ./pi-rollback.sh"
            fi
        elif [[ "$SERVICE_STARTED" == false ]]; then
            # No backup to restore from: at least do not leave the app down
            ssh "$TARGET" "sudo systemctl start $SERVICE"
            echo "⚠️  Tried to start $SERVICE again. Check: ssh $TARGET 'sudo journalctl -u skorbord-cards-app -n 50'"
        elif [[ "$ROLLBACK_READY" == true ]]; then
            echo "⚠️  The new version is running but unhealthy. Check: ssh $TARGET 'sudo journalctl -u skorbord-cards-app -n 50'"
            echo "Undo the code only (keeps scores entered since): ssh $TARGET 'cd $REMOTE_ROOT && ./pi-rollback.sh --code-only'"
            echo "Undo code and database (loses scores entered since the backup): ssh $TARGET 'cd $REMOTE_ROOT && ./pi-rollback.sh'"
        fi
    fi
    rm -f "$BACKEND_ARCHIVE"
    exit "$code"
}
trap cleanup EXIT

# Run from the project root, wherever the script is called from
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

# 1. Reach the Pi, and skip the deploy when it already has this exact code
step "Checking the Pi at $TARGET"
run "reach $TARGET over SSH" ssh -o ConnectTimeout=10 "$TARGET" "echo connected"

HEAD_SHA=""
DIRTY=false
if command -v git > /dev/null 2>&1; then
    HEAD_SHA=$(git rev-parse HEAD 2>/dev/null)
    if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
        DIRTY=true
    fi
fi
if [[ -n "$HEAD_SHA" && "$DIRTY" == false && "$FORCE" == false ]]; then
    DEPLOYED_SHA=$(ssh "$TARGET" "cat $REMOTE_ROOT/DEPLOYED_SHA 2>/dev/null" | tr -d '[:space:]')
    if [[ -n "$DEPLOYED_SHA" && "$DEPLOYED_SHA" == "$HEAD_SHA" ]]; then
        echo "✅ Nothing to deploy: the Pi already has commit ${HEAD_SHA:0:7}. Use --force to deploy anyway."
        exit 0
    fi
fi
if [[ "$DIRTY" == true ]]; then
    echo "⚠️  Note: you have uncommitted changes. They will be deployed."
fi

# 2. Local packages, tests, then build
# Always run install: it is quick when nothing changed, and it picks up new dependencies
step "Installing API packages"
run "npm install (api)" npm --prefix api install
step "Installing app packages"
run "npm install (app)" npm --prefix app install

if [[ "$SKIP_TESTS" == false ]]; then
    step "Running API tests"
    run "API tests" npm --prefix api test

    step "Running app tests"
    run "app tests" npm --prefix app run test:run
fi

step "Building the frontend"
run "npm run build" npm --prefix app run build

step "Packing the backend"
run "tar backend files" tar --exclude='node_modules' --exclude='scoreboards.db*' --exclude='cards-sqlite.db*' --exclude='*.test.js' -czf "$BACKEND_ARCHIVE" -C ./api .

# 3. Back up on the Pi. pi-backup.sh stops the app, so from here on a failure must not leave it down.
if [[ "$SKIP_BACKUP" == false ]]; then
    step "Backing up on the Pi (this stops the app)"
    run "mkdir $REMOTE_ROOT on Pi" ssh "$TARGET" "mkdir -p $REMOTE_ROOT"
    run "scp backup and rollback scripts" scp deployment/pi-backup.sh deployment/pi-rollback.sh "$TARGET:$REMOTE_ROOT/"
    # pi-backup.sh refuses to run while the last release's node_modules.old is still there.
    # This release's backup replaces it, so clear it first.
    run "clear the previous release's node_modules.old" ssh "$TARGET" "rm -rf $REMOTE_ROOT/api/node_modules.old"
    # A Windows checkout can carry CRLF line endings, which bash cannot run
    run "pi-backup.sh" ssh "$TARGET" "cd $REMOTE_ROOT && sed -i 's/\r$//' pi-backup.sh pi-rollback.sh && chmod +x pi-backup.sh pi-rollback.sh && ./pi-backup.sh pre-release"
    ROLLBACK_READY=true
else
    step "Stopping the app (backup skipped)"
    run "stop $SERVICE" ssh "$TARGET" "sudo systemctl stop $SERVICE"
fi

# 4. Frontend: replace the built files so old hashed assets do not pile up
step "Copying the frontend"
run "reset app/dist on Pi" ssh "$TARGET" "rm -rf $REMOTE_ROOT/api/app/dist && mkdir -p $REMOTE_ROOT/api/app/dist"
run "scp frontend dist" scp -r app/dist/* "$TARGET:$REMOTE_ROOT/api/app/dist/"

# Backend: rsync is not on the Pi, so use tar + scp. node_modules is not copied since native
# modules like sqlite3 must be built for the Pi, so install packages there.
step "Copying the backend and installing packages"
run "scp backend archive" scp "$BACKEND_ARCHIVE" "$TARGET:$REMOTE_ROOT/"
run "extract backend archive and install dependencies on Pi" ssh "$TARGET" "mkdir -p $REMOTE_ROOT/api && tar xzf $REMOTE_ROOT/$BACKEND_ARCHIVE -C $REMOTE_ROOT/api && rm $REMOTE_ROOT/$BACKEND_ARCHIVE && cd $REMOTE_ROOT/api && npm install --omit=dev"

# 5. Migrate while the app is stopped (each migration runs in its own transaction), then start.
step "Running database migrations"
run "npm run migrate on Pi" ssh "$TARGET" "cd $REMOTE_ROOT/api && npm run migrate"

# Start and check health
step "Starting the app"
run "start $SERVICE" ssh "$TARGET" "sudo systemctl start $SERVICE"
SERVICE_STARTED=true

HEALTHY=false
for i in $(seq 1 15); do
    if ssh "$TARGET" "curl -fs http://localhost:$PORT/health > /dev/null"; then
        HEALTHY=true
        break
    fi
    sleep 2
done
if [[ "$HEALTHY" == false ]]; then
    echo "❌ The app started but /health did not answer on port $PORT"
    FAILED_STEP="health check on port $PORT"
    exit 1
fi

# Remember what is deployed, so the next run can tell when there is nothing new.
# Uncommitted changes are not a commit, so forget the marker and the next run deploys.
if [[ -n "$HEAD_SHA" && "$DIRTY" == false ]]; then
    ssh "$TARGET" "echo $HEAD_SHA > $REMOTE_ROOT/DEPLOYED_SHA"
else
    ssh "$TARGET" "rm -f $REMOTE_ROOT/DEPLOYED_SHA"
fi

echo ""
echo "✅ Deployed. $SERVICE is running and healthy on $PI_HOST."
