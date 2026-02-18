#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-}"

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: ./scripts/reset-project.sh <project-id>"
  echo "Example: ./scripts/reset-project.sh taskflow-app"
  exit 1
fi

DATA_DIR="${DATA_DIR:-./data}"
PROJECT_DIR="$DATA_DIR/projects/$PROJECT_ID"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Project not found: $PROJECT_DIR"
  exit 1
fi

echo "Resetting project: $PROJECT_ID"
echo "This will delete all artifacts in: $PROJECT_DIR"
read -p "Are you sure? (y/N) " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Cancelled."
  exit 0
fi

rm -rf "$PROJECT_DIR"
echo "Project directory deleted."

# Also clean up database entries if sqlite3 is available
DB_PATH="$DATA_DIR/db/orchestrator.sqlite"
if command -v sqlite3 >/dev/null 2>&1 && [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" "DELETE FROM events WHERE project_id = '$PROJECT_ID';"
  sqlite3 "$DB_PATH" "DELETE FROM blockers WHERE project_id = '$PROJECT_ID';"
  sqlite3 "$DB_PATH" "DELETE FROM projects WHERE id = '$PROJECT_ID';"
  echo "Database entries cleaned."
fi

echo "Done. Project $PROJECT_ID has been reset."
