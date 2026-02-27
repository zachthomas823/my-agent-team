#!/bin/bash
# ---------------------------------------------------------------------------
# entrypoint.agent.sh — Agent container startup
#
# settings.json is generated on the host by scripts/launch-agents.sh from
# docker/settings-template.json with STS credentials injected, then mounted
# at ~/.claude/settings.json. This script validates it exists and starts the
# agent process.
# ---------------------------------------------------------------------------
set -e

CLAUDE_SETTINGS="${HOME}/.claude/settings.json"

if [[ ! -f "$CLAUDE_SETTINGS" ]]; then
    echo "[entrypoint] ERROR: $CLAUDE_SETTINGS not found."
    echo "             Was scripts/launch-agents.sh used to start the stack?"
    exit 1
fi

echo "[entrypoint] Agent: ${AGENT_ROLE:-unknown} (${AGENT_ID:-unknown})"
echo "[entrypoint] Claude settings loaded."

exec "$@"
