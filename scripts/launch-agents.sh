#!/bin/bash
# ---------------------------------------------------------------------------
# launch-agents.sh — Start the agent orchestration stack
#
# Usage:
#   ./scripts/launch-agents.sh [--profile <aws-profile>] [--rebuild] [--down]
#
#   --profile   AWS profile to resolve credentials from.
#               Defaults to: nfl-dm-api-dev
#   --rebuild   Force Docker image rebuild before starting.
#   --down      Stop and remove the stack instead of starting it.
#
# What this does:
#   1. Resolves short-lived AWS STS credentials on the host (handles
#      credential_process / saml2aws which can't run inside containers)
#   2. Generates docker/settings.json from docker/settings-template.json
#      with STS credentials injected — this file is mounted into every
#      agent container at ~/.claude/settings.json
#   3. Starts the Docker Compose stack
#   4. Runs a background credential refresh loop (every 45 min) that patches
#      fresh credentials into each running agent container via docker exec
# ---------------------------------------------------------------------------

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SETTINGS_TEMPLATE="$PROJECT_DIR/docker/settings-template.json"
SETTINGS_GENERATED="$PROJECT_DIR/docker/settings.json"
AWS_PROFILE_NAME="nfl-dm-api-dev"
REBUILD=false
DOWN=false
REFRESH_PID=""

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --profile) AWS_PROFILE_NAME="$2"; shift 2 ;;
        --rebuild) REBUILD=true; shift ;;
        --down)    DOWN=true; shift ;;
        --help|-h)
            head -30 "$0" | grep "^#" | sed 's/^# \?//'
            exit 0
            ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# --down: stop the stack and clean up generated settings
# ---------------------------------------------------------------------------
if [[ "$DOWN" == "true" ]]; then
    echo "Stopping agent stack..."
    cd "$PROJECT_DIR" && docker compose down
    rm -f "$SETTINGS_GENERATED"
    echo "Done."
    exit 0
fi

echo "============================================================"
echo "  AI Agent Orchestration Stack"
echo "============================================================"
echo "  Profile:  $AWS_PROFILE_NAME"
echo "  Template: docker/settings-template.json"
echo "  Rebuild:  $REBUILD"
echo "============================================================"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Resolve AWS STS credentials on the host
# ---------------------------------------------------------------------------
echo "[1/3] Resolving AWS credentials for profile: $AWS_PROFILE_NAME ..."

CREDS_JSON=$(AWS_PROFILE="$AWS_PROFILE_NAME" aws configure export-credentials --format process 2>/dev/null) || {
    echo ""
    echo "ERROR: Failed to resolve AWS credentials for profile '$AWS_PROFILE_NAME'."
    echo ""
    echo "Your SAML session may have expired. Try:"
    echo "  saml2aws login --profile saml2aws-browser"
    echo "  granted assume $AWS_PROFILE_NAME"
    echo ""
    exit 1
}

AWS_ACCESS_KEY_ID=$(echo "$CREDS_JSON" | jq -r '.AccessKeyId')
AWS_SECRET_ACCESS_KEY=$(echo "$CREDS_JSON" | jq -r '.SecretAccessKey')
AWS_SESSION_TOKEN=$(echo "$CREDS_JSON" | jq -r '.SessionToken')

if [[ -z "$AWS_ACCESS_KEY_ID" || "$AWS_ACCESS_KEY_ID" == "null" ]]; then
    echo "ERROR: Could not extract AccessKeyId from credentials."
    exit 1
fi

echo "  Credentials resolved. (KeyId: ${AWS_ACCESS_KEY_ID:0:8}...)"
echo ""

# ---------------------------------------------------------------------------
# Step 2: Generate docker/settings.json from template with injected creds
# ---------------------------------------------------------------------------
echo "[2/3] Generating docker/settings.json ..."

if [[ ! -f "$SETTINGS_TEMPLATE" ]]; then
    echo "ERROR: Settings template not found: $SETTINGS_TEMPLATE"
    exit 1
fi

jq \
  --arg k "$AWS_ACCESS_KEY_ID" \
  --arg s "$AWS_SECRET_ACCESS_KEY" \
  --arg t "$AWS_SESSION_TOKEN" \
  --arg r "${AWS_REGION:-us-east-1}" \
  'del(.env.AWS_PROFILE) |
   .env.AWS_ACCESS_KEY_ID = $k |
   .env.AWS_SECRET_ACCESS_KEY = $s |
   .env.AWS_SESSION_TOKEN = $t |
   .env.AWS_REGION = $r' \
  "$SETTINGS_TEMPLATE" > "$SETTINGS_GENERATED"

echo "  Written to docker/settings.json"
echo ""

# ---------------------------------------------------------------------------
# Step 3: Start Docker Compose stack
# ---------------------------------------------------------------------------
echo "[3/3] Starting Docker Compose stack..."
cd "$PROJECT_DIR"

COMPOSE_ARGS=()
[[ "$REBUILD" == "true" ]] && COMPOSE_ARGS+=(--build)

docker compose up -d "${COMPOSE_ARGS[@]}"

echo ""
echo "  Stack started."
echo "  Orchestrator API: http://localhost:3000"
echo "  Dashboard:        cd dashboard && yarn dev  (http://localhost:5173)"
echo ""

# ---------------------------------------------------------------------------
# Background credential refresh loop (every 45 minutes)
# Patches fresh STS credentials into each running agent container via
# docker exec so they never need a restart for credential expiry.
# ---------------------------------------------------------------------------
AGENT_SERVICES=(agent-analyst agent-pm agent-architect agent-developer agent-qa)

refresh_credentials() {
    FRESH_JSON=$(AWS_PROFILE="$AWS_PROFILE_NAME" aws configure export-credentials --format process 2>/dev/null) || return 1
    FRESH_KEY=$(echo "$FRESH_JSON" | jq -r '.AccessKeyId')
    FRESH_SECRET=$(echo "$FRESH_JSON" | jq -r '.SecretAccessKey')
    FRESH_TOKEN=$(echo "$FRESH_JSON" | jq -r '.SessionToken')

    [[ -z "$FRESH_KEY" || "$FRESH_KEY" == "null" ]] && return 1

    # Update the generated settings file on the host (picked up by new containers)
    jq \
      --arg k "$FRESH_KEY" \
      --arg s "$FRESH_SECRET" \
      --arg t "$FRESH_TOKEN" \
      '.env.AWS_ACCESS_KEY_ID = $k | .env.AWS_SECRET_ACCESS_KEY = $s | .env.AWS_SESSION_TOKEN = $t' \
      "$SETTINGS_GENERATED" > "${SETTINGS_GENERATED}.tmp" \
      && mv "${SETTINGS_GENERATED}.tmp" "$SETTINGS_GENERATED"

    # Patch credentials into each running agent container
    for svc in "${AGENT_SERVICES[@]}"; do
        # Find the container name for this compose service
        CONTAINER=$(docker compose ps -q "$svc" 2>/dev/null | head -1)
        [[ -z "$CONTAINER" ]] && continue

        docker exec "$CONTAINER" sh -c "
            jq \
              --arg k '$FRESH_KEY' \
              --arg s '$FRESH_SECRET' \
              --arg t '$FRESH_TOKEN' \
              '.env.AWS_ACCESS_KEY_ID = \$k | .env.AWS_SECRET_ACCESS_KEY = \$s | .env.AWS_SESSION_TOKEN = \$t' \
              /home/agent/.claude/settings.json > /tmp/settings_refresh.json \
            && cp /tmp/settings_refresh.json /home/agent/.claude/settings.json \
            && rm /tmp/settings_refresh.json
        " 2>/dev/null && echo "[refresh] $svc: credentials refreshed. (KeyId: ${FRESH_KEY:0:8}...)"
    done
}

(
    while sleep 2700; do
        refresh_credentials || echo "[refresh] WARNING: Could not refresh credentials. SAML session may have expired."
    done
) &
REFRESH_PID=$!

trap '[[ -n "$REFRESH_PID" ]] && kill "$REFRESH_PID" 2>/dev/null || true' EXIT

echo "  Credential auto-refresh started (every 45 min, PID: $REFRESH_PID)"
echo "  Run scripts/refresh-creds.sh to refresh manually."
echo ""
echo "  Press Ctrl+C to stop the stack."
echo "------------------------------------------------------------"

# Keep the script alive so the refresh loop and trap stay active.
# On Ctrl+C, bring the stack down cleanly.
trap 'echo ""; echo "Stopping stack..."; cd "$PROJECT_DIR" && docker compose down; [[ -n "$REFRESH_PID" ]] && kill "$REFRESH_PID" 2>/dev/null || true; exit 0' INT TERM

wait $REFRESH_PID
