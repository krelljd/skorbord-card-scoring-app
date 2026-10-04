#!/bin/bash
# Add a sqid to the production database. Run this on the Pi.
#
# Usage: ./add-sqid.sh <sqid> [owner-email]
# Example: ./add-sqid.sh abc123
#
# The sqid is used as both the id and the name. created_at is the current
# system time (UTC). The owner is a placeholder unless you pass one.
# Override the database with DB_PATH=/path/to/cards-sqlite.db

set -euo pipefail

DB_PATH="${DB_PATH:-$HOME/skorbord-cards/api/db/cards-sqlite.db}"
SQID="${1:-}"
OWNER="${2:-owner@example.com}"

if [ -z "$SQID" ]; then
    echo "Usage: $0 <sqid> [owner-email]" >&2
    exit 1
fi

# The API accepts 4-36 lowercase letters or digits, or a UUID. This also keeps quotes out of the SQL.
if ! [[ "$SQID" =~ ^[a-z0-9]{4,36}$ ]] && ! [[ "$SQID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]]; then
    echo "Invalid sqid '$SQID': use 4-36 lowercase letters or digits, or a UUID." >&2
    exit 1
fi

# Only a plain email is allowed, so it is safe inside the SQL string
if ! [[ "$OWNER" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]]; then
    echo "Invalid owner email '$OWNER'." >&2
    exit 1
fi

if [ ! -f "$DB_PATH" ]; then
    echo "Database not found: $DB_PATH" >&2
    exit 1
fi

NOW="$(date -u '+%Y-%m-%d %H:%M:%S')"

sqlite3 "$DB_PATH" "INSERT INTO \"main\".\"sqids\" (\"id\", \"name\", \"created_at\", \"owner\") VALUES ('$SQID', '$SQID', '$NOW', '$OWNER');"

echo "Added sqid '$SQID' (owner $OWNER, created $NOW UTC)."
