#!/usr/bin/env bash
# Pushes and commits the Knock workflows in knock/workflows to Development.
# Workflow categories must exist in Knock's preference category catalog before
# a workflow can use them, and the CLI can't create them, so upsert each one
# through the Management API first. Needs KNOCK_SERVICE_TOKEN in .env.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
: "${KNOCK_SERVICE_TOKEN:?KNOCK_SERVICE_TOKEN missing from .env}"

for category in $(jq -r '.categories[]?' knock/workflows/*/workflow.json | sort -u); do
  curl -fsS -X PUT -o /dev/null \
    -H "Authorization: Bearer $KNOCK_SERVICE_TOKEN" \
    "https://control.knock.app/v1/preference_categories/$category"
  echo "category $category ✓"
done

npx --yes @knocklabs/cli@1.5.0 workflow push --all \
  --workflows-dir=knock/workflows \
  --environment=development \
  --commit -m "Sync Cadence workflows"
