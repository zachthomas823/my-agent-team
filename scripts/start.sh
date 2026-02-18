#!/usr/bin/env bash
set -euo pipefail

echo "=== Starting Agent Orchestrator Stack ==="

# Check for .env
if [ ! -f .env ]; then
  echo "Error: .env file not found. Run: cp .env.example .env"
  exit 1
fi

# Source .env
set -a
source .env
set +a

# Build first
echo "Building TypeScript..."
yarn build

# Check if Docker is available
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "Starting with Docker Compose..."
  docker compose up --build -d
  echo "Stack started. Dashboard: cd dashboard && yarn dev"
else
  echo "Docker not available. Starting locally..."

  # Start Redis if not running
  if ! redis-cli ping >/dev/null 2>&1; then
    echo "Starting Redis..."
    redis-server --daemonize yes
  fi

  # Start orchestrator in background
  echo "Starting orchestrator..."
  DATA_DIR=./data REDIS_URL=redis://localhost:6379 node dist/orchestrator/index.js &
  ORCH_PID=$!
  echo "Orchestrator PID: $ORCH_PID"

  # Wait for orchestrator to be ready
  sleep 2

  # Start agents
  for role_id in "analyst:analyst-01" "product-manager:pm-01" "architect:architect-01" "developer:dev-01" "qa:qa-01"; do
    IFS=: read -r role id <<< "$role_id"
    echo "Starting agent: $role ($id)..."
    AGENT_ROLE=$role AGENT_ID=$id DATA_DIR=./data REDIS_URL=redis://localhost:6379 \
      node dist/agent/index.js &
    echo "  PID: $!"
  done

  echo ""
  echo "=== Stack running locally ==="
  echo "Orchestrator: http://localhost:3000"
  echo "Start dashboard: cd dashboard && yarn dev"
  echo "Press Ctrl+C to stop all processes"
  wait
fi
