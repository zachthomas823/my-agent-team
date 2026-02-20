#!/bin/bash
# Writes ~/.claude/settings.json at startup from runtime env vars,
# so the Claude Code CLI uses Bedrock or Anthropic API without interactive auth.
set -e

CLAUDE_DIR="${HOME}/.claude"
mkdir -p "$CLAUDE_DIR"

if [ "${CLAUDE_CODE_USE_BEDROCK:-}" = "1" ]; then
  # If short-term credentials were injected directly, use them instead of a profile.
  # This avoids the credential_process (saml2aws) chain which cannot run in a container.
  # We also unset AWS_PROFILE so the AWS SDK doesn't try to resolve it and invoke
  # credential_process (which requires saml2aws, not available in Docker).
  if [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
    cat > "$CLAUDE_DIR/settings.json" << EOF
{
  "env": {
    "CLAUDE_CODE_USE_BEDROCK": "1",
    "AWS_REGION": "${AWS_REGION:-us-east-1}",
    "AWS_ACCESS_KEY_ID": "${AWS_ACCESS_KEY_ID}",
    "AWS_SECRET_ACCESS_KEY": "${AWS_SECRET_ACCESS_KEY}",
    "AWS_SESSION_TOKEN": "${AWS_SESSION_TOKEN:-}",
    "ANTHROPIC_MODEL": "${ANTHROPIC_MODEL:-}"
  }
}
EOF
    # Unset profile so the AWS SDK uses the injected creds, not credential_process
    unset AWS_PROFILE
    echo "[entrypoint] Claude configured for AWS Bedrock (injected STS credentials, AWS_PROFILE unset)"
  else
    cat > "$CLAUDE_DIR/settings.json" << EOF
{
  "env": {
    "CLAUDE_CODE_USE_BEDROCK": "1",
    "AWS_REGION": "${AWS_REGION:-us-east-1}",
    "AWS_PROFILE": "${AWS_PROFILE:-}",
    "ANTHROPIC_MODEL": "${ANTHROPIC_MODEL:-}"
  }
}
EOF
    echo "[entrypoint] Claude configured for AWS Bedrock (profile: ${AWS_PROFILE:-default})"
  fi
else
  cat > "$CLAUDE_DIR/settings.json" << EOF
{
  "env": {
    "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY:-}"
  }
}
EOF
  echo "[entrypoint] Claude configured for Anthropic API"
fi

exec "$@"
