#!/bin/bash
# ---------------------------------------------------------------------------
# refresh-creds.sh — Refresh AWS credentials in running agent containers
#
# Usage:
#   ./scripts/refresh-creds.sh [--profile <aws-profile>]
#
# Run this when your STS session nears expiry (~1 hour for assumed roles).
# Resolves fresh credentials on the host and patches them into each running
# agent container's settings.json via docker exec.
# ---------------------------------------------------------------------------

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SETTINGS_TEMPLATE="$PROJECT_DIR/docker/settings-template.json"
SETTINGS_GENERATED="$PROJECT_DIR/docker/settings.json"
AWS_PROFILE_NAME="nfl-dm-api-dev"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --profile) AWS_PROFILE_NAME="$2"; shift 2 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

echo "Refreshing credentials for profile: $AWS_PROFILE_NAME"

CREDS_JSON=$(AWS_PROFILE="$AWS_PROFILE_NAME" aws configure export-credentials --format process 2>/dev/null) || {
    echo "ERROR: Failed to resolve credentials. Is your SAML session active?"
    echo "  saml2aws login --profile saml2aws-browser"
    exit 1
}

AWS_ACCESS_KEY_ID=$(echo "$CREDS_JSON" | jq -r '.AccessKeyId')
AWS_SECRET_ACCESS_KEY=$(echo "$CREDS_JSON" | jq -r '.SecretAccessKey')
AWS_SESSION_TOKEN=$(echo "$CREDS_JSON" | jq -r '.SessionToken')

if [[ -z "$AWS_ACCESS_KEY_ID" || "$AWS_ACCESS_KEY_ID" == "null" ]]; then
    echo "ERROR: Could not extract AccessKeyId from credentials."
    exit 1
fi

# Update the generated settings file on the host (picked up by new containers)
if [[ -f "$SETTINGS_GENERATED" ]]; then
    jq \
      --arg k "$AWS_ACCESS_KEY_ID" \
      --arg s "$AWS_SECRET_ACCESS_KEY" \
      --arg t "$AWS_SESSION_TOKEN" \
      '.env.AWS_ACCESS_KEY_ID = $k | .env.AWS_SECRET_ACCESS_KEY = $s | .env.AWS_SESSION_TOKEN = $t' \
      "$SETTINGS_GENERATED" > "${SETTINGS_GENERATED}.tmp" \
      && mv "${SETTINGS_GENERATED}.tmp" "$SETTINGS_GENERATED"
    echo "  Updated docker/settings.json"
fi

# Patch credentials into each running agent container
AGENT_SERVICES=(agent-analyst agent-pm agent-architect agent-developer agent-qa)
cd "$PROJECT_DIR"

for svc in "${AGENT_SERVICES[@]}"; do
    CONTAINER=$(docker compose ps -q "$svc" 2>/dev/null | head -1)
    if [[ -z "$CONTAINER" ]]; then
        echo "  $svc: not running, skipped"
        continue
    fi

    docker exec "$CONTAINER" sh -c "
        jq \
          --arg k '$AWS_ACCESS_KEY_ID' \
          --arg s '$AWS_SECRET_ACCESS_KEY' \
          --arg t '$AWS_SESSION_TOKEN' \
          '.env.AWS_ACCESS_KEY_ID = \$k | .env.AWS_SECRET_ACCESS_KEY = \$s | .env.AWS_SESSION_TOKEN = \$t' \
          /home/agent/.claude/settings.json > /tmp/settings_refresh.json \
        && cp /tmp/settings_refresh.json /home/agent/.claude/settings.json \
        && rm /tmp/settings_refresh.json
    " 2>/dev/null && echo "  $svc: refreshed (KeyId: ${AWS_ACCESS_KEY_ID:0:8}...)" \
               || echo "  $svc: failed (container may be restarting)"
done

echo ""
echo "Done. Note: in-flight agent tasks will pick up new credentials on the next API call."
