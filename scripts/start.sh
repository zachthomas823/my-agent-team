#!/usr/bin/env bash
set -euo pipefail

echo "=== Agent Orchestrator Stack ==="

# ── Mode selection ─────────────────────────────────────────────────────────────

MODE=""
for arg in "$@"; do
  case $arg in
    --bedrock)   MODE=bedrock ;;
    --anthropic) MODE=anthropic ;;
  esac
done

if [ -z "$MODE" ]; then
  echo ""
  echo "Select provider:"
  echo "  1) AWS Bedrock  (uses ~/.aws credentials + .claude-bedrock/settings.json)"
  echo "  2) Anthropic API (uses ANTHROPIC_API_KEY from .env)"
  echo ""
  read -rp "Choice [1/2]: " choice
  case $choice in
    1) MODE=bedrock ;;
    2) MODE=anthropic ;;
    *) echo "Invalid choice. Use 1 or 2."; exit 1 ;;
  esac
fi

# ── Mode-specific setup ────────────────────────────────────────────────────────

COMPOSE_FILES="-f docker-compose.yml"

if [ "$MODE" = "bedrock" ]; then
  SETTINGS=".claude-bedrock/settings.json"
  if [ ! -f "$SETTINGS" ]; then
    echo ""
    echo "Error: $SETTINGS not found."
    echo "Create it with your Bedrock config, e.g.:"
    echo '  { "env": { "CLAUDE_CODE_USE_BEDROCK": "1", "AWS_PROFILE": "my-profile", "AWS_REGION": "us-east-1", "ANTHROPIC_MODEL": "<inference-profile-arn>" } }'
    exit 1
  fi

  echo "Mode: AWS Bedrock"

  # Export env vars from .claude-bedrock/settings.json (CLAUDE_CODE_USE_BEDROCK, AWS_PROFILE,
  # AWS_REGION, ANTHROPIC_MODEL).
  while IFS='=' read -r key val; do
    export "$key=$val"
  done < <(python3 -c "
import json, sys
s = json.load(open('$SETTINGS'))
for k, v in s.get('env', {}).items():
    print(f'{k}={v}')
")

  COMPOSE_FILES="-f docker-compose.yml"

elif [ "$MODE" = "anthropic" ]; then
  # Load .env so we can check ANTHROPIC_API_KEY
  if [ -f .env ]; then
    set -a; source .env; set +a
  fi

  if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    echo ""
    echo "Error: ANTHROPIC_API_KEY is not set."
    echo "Add it to your .env file: ANTHROPIC_API_KEY=sk-ant-..."
    exit 1
  fi

  echo "Mode: Anthropic API"
  export CLAUDE_CODE_USE_BEDROCK=""
fi

# ── Credential resolution (Bedrock only) ───────────────────────────────────────

# Resolves the AWS profile to short-term STS credentials on the host and injects
# them into all running agent containers via `docker exec`. This avoids the
# credential_process (saml2aws) chain which cannot run inside Docker containers.
#
# Prints KEY=VALUE lines for AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
# AWS_SESSION_TOKEN, and AWS_CREDENTIAL_EXPIRATION to stdout.
# Exits with code 1 and prints an error to stderr on failure.
resolve_aws_credentials() {
  python3 - <<'PYEOF'
import json, subprocess, sys, os

profile = os.environ.get("AWS_PROFILE", "default")
region  = os.environ.get("AWS_REGION", "us-east-1")

try:
    out = subprocess.check_output(
        ["aws", "configure", "export-credentials",
         "--profile", profile, "--format", "env-no-export"],
        stderr=subprocess.PIPE,
    )
    pairs = {}
    for line in out.decode().splitlines():
        if line.startswith("AWS_"):
            k, _, v = line.partition("=")
            pairs[k] = v
    if not pairs.get("AWS_ACCESS_KEY_ID"):
        raise RuntimeError("No credentials returned")
    for k, v in pairs.items():
        print(f"{k}={v}")
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
}

# Injects the given credentials into all agent containers by rewriting
# ~/.claude/settings.json inside each container. Does not restart anything.
inject_credentials_into_containers() {
  local key="$1" secret="$2" token="$3"
  local model="${ANTHROPIC_MODEL:-}"
  local region="${AWS_REGION:-us-east-1}"

  local settings
  settings=$(python3 -c "
import json
print(json.dumps({
    'env': {
        'CLAUDE_CODE_USE_BEDROCK': '1',
        'AWS_REGION': '$region',
        'AWS_ACCESS_KEY_ID': '$key',
        'AWS_SECRET_ACCESS_KEY': '$secret',
        'AWS_SESSION_TOKEN': '$token',
        'ANTHROPIC_MODEL': '$model',
    }
}))
")

  local updated=0
  for svc in agent-analyst agent-pm agent-architect agent-developer agent-qa; do
    local container
    container=$(docker compose $COMPOSE_FILES ps -q "$svc" 2>/dev/null || true)
    if [ -n "$container" ]; then
      docker exec "$container" sh -c "echo '$settings' > /home/agent/.claude/settings.json" 2>/dev/null && \
        updated=$((updated + 1))
    fi
  done
  echo "  Credentials injected into $updated container(s)."
}

# Background loop: refreshes credentials every REFRESH_INTERVAL_SECONDS.
# Writes a PID file so the loop can be killed on exit.
start_credential_refresh_loop() {
  local interval="${1:-2700}"  # default: 45 minutes
  local pidfile="/tmp/agent-cred-refresh-$$.pid"

  (
    while true; do
      sleep "$interval"
      echo "[cred-refresh] Refreshing AWS credentials ($(date '+%H:%M:%S'))..."

      local creds key secret token expiry
      if creds=$(resolve_aws_credentials 2>/dev/null); then
        key=$(echo "$creds"   | grep ^AWS_ACCESS_KEY_ID=     | cut -d= -f2-)
        secret=$(echo "$creds" | grep ^AWS_SECRET_ACCESS_KEY= | cut -d= -f2-)
        token=$(echo "$creds"  | grep ^AWS_SESSION_TOKEN=     | cut -d= -f2-)
        expiry=$(echo "$creds" | grep ^AWS_CREDENTIAL_EXPIRATION= | cut -d= -f2-)

        if [ -n "$key" ]; then
          inject_credentials_into_containers "$key" "$secret" "$token"
          echo "[cred-refresh] Done. Expiry: ${expiry:-unknown}"
        else
          echo "[cred-refresh] Warning: resolved empty credentials, skipping injection."
        fi
      else
        echo "[cred-refresh] Warning: credential resolution failed. Containers will use existing (possibly expired) credentials."
        echo "[cred-refresh] Run 'saml2aws login --profile saml2aws-browser' on the host to re-authenticate."
      fi
    done
  ) &

  echo $! > "$pidfile"
  echo "$pidfile"  # return pidfile path to caller
}

# ── Build & start ──────────────────────────────────────────────────────────────

# Check for .env (needed for REDIS_URL etc. regardless of mode)
if [ ! -f .env ]; then
  echo "Warning: .env not found, using defaults. Run: cp .env.example .env"
fi

echo ""
echo "Building TypeScript..."
yarn build

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  # ── Bedrock: resolve and inject credentials before starting containers ──────
  if [ "$MODE" = "bedrock" ]; then
    echo "  Resolving AWS credentials for profile: ${AWS_PROFILE:-default}..."
    _creds=""
    if _creds=$(resolve_aws_credentials); then
      while IFS='=' read -r key val; do
        [ -n "$key" ] && export "$key=$val"
      done <<< "$_creds"

      _expiry="${AWS_CREDENTIAL_EXPIRATION:-unknown}"
      echo "  Credentials resolved. Expiry: $_expiry"
    else
      echo "  Warning: Could not resolve credentials. Containers will fall back to profile-based auth."
    fi
  fi

  echo "Starting with Docker Compose ($MODE mode)..."
  # shellcheck disable=SC2086
  docker compose $COMPOSE_FILES up --build -d
  echo ""
  echo "Stack started."
  echo "  API:       http://127.0.0.1:3000"
  echo "  Dashboard: cd dashboard && yarn dev  →  http://localhost:5173"

  # ── Bedrock: start background credential refresh loop ──────────────────────
  if [ "$MODE" = "bedrock" ]; then
    echo ""
    echo "Starting credential refresh loop (every 45 min)..."
    _pidfile=$(start_credential_refresh_loop 2700)
    _refresh_pid=$(cat "$_pidfile")
    echo "  Refresh loop PID: $_refresh_pid (pidfile: $_pidfile)"
    echo ""
    echo "Press Ctrl+C to stop the refresh loop (containers keep running)."
    echo "To stop containers: docker compose down"
    echo ""

    # Trap Ctrl+C: kill the refresh loop, leave containers running
    trap '
      echo ""
      echo "Stopping credential refresh loop (PID $_refresh_pid)..."
      kill "$_refresh_pid" 2>/dev/null || true
      rm -f "$_pidfile"
      echo "Containers are still running. To stop them: docker compose down"
      exit 0
    ' INT TERM

    # Wait for the refresh loop so the script stays alive
    wait "$_refresh_pid" 2>/dev/null || true
  fi

else
  echo "Docker not available. Starting locally..."

  if ! redis-cli ping >/dev/null 2>&1; then
    echo "Starting Redis..."
    redis-server --daemonize yes
  fi

  echo "Starting orchestrator..."
  DATA_DIR=./data REDIS_URL=redis://localhost:6379 node dist/orchestrator/index.js &
  echo "Orchestrator PID: $!"

  sleep 2

  for role_id in "analyst:analyst-01" "product-manager:pm-01" "architect:architect-01" "developer:dev-01" "qa:qa-01"; do
    IFS=: read -r role id <<< "$role_id"
    echo "Starting agent: $role ($id)..."
    AGENT_ROLE=$role AGENT_ID=$id DATA_DIR=./data REDIS_URL=redis://localhost:6379 \
      node dist/agent/index.js &
    echo "  PID: $!"
  done

  echo ""
  echo "Stack running locally. Press Ctrl+C to stop."
  wait
fi
