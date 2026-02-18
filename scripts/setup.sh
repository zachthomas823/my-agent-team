#!/usr/bin/env bash
set -euo pipefail

echo "=== Agent Orchestrator Setup ==="

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Node.js is required. Install via nvm."; exit 1; }
command -v yarn >/dev/null 2>&1 || { echo "Yarn is required. Run: corepack enable && corepack prepare yarn@stable --activate"; exit 1; }

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — fill in your AWS credentials"
fi

# Install dependencies
echo "Installing dependencies..."
yarn install

# Build TypeScript
echo "Building TypeScript..."
yarn build

# Initialize data directories
mkdir -p data/{templates,knowledge,db,projects}

echo ""
echo "=== Setup Complete ==="
echo "Next steps:"
echo "  1. Edit .env with your AWS credentials"
echo "  2. Start Redis: redis-server --daemonize yes"
echo "  3. Start orchestrator: yarn dev:orchestrator"
echo "  4. Start an agent: AGENT_ROLE=analyst AGENT_ID=analyst-01 yarn dev:agent"
echo "  5. Start dashboard: cd dashboard && yarn dev"
