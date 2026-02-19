# CLAUDE.md

This file provides guidance to Claude Code when working with the AI Agent Orchestration Platform.

## Project Overview

This is a containerized multi-agent orchestration system where specialized AI agents (analyst, product manager, architect, developer, QA) work together autonomously through structured workflows. The system uses the Claude Agent SDK, AWS Bedrock, Docker Compose, Redis, and a React dashboard.

### Core Architecture

- **Agent Runtime**: `@anthropic-ai/claude-agent-sdk` (TypeScript SDK v0.2.x)
- **Model Provider**: AWS Bedrock with Claude models
- **Container Orchestration**: Docker Compose
- **Message Bus**: Redis (pub/sub for agent notifications)
- **Artifact Storage**: File-based shared Docker volume at `/data/projects/`
- **State Database**: SQLite (embedded in orchestrator)
- **Frontend**: React + TypeScript + Vite (runs on host, not in Docker)
- **API**: Express.js with WebSocket support

## Critical Design Principles

### 1. File-Based Artifacts Over Database Blobs
The filesystem at `/data/projects/` IS the interface. All inter-agent communication happens through well-structured markdown and JSON files. Agents read upstream artifacts, produce downstream artifacts, and the filesystem is the source of truth. Never move artifact content into database blobs.

### 2. Agents Run Until Blocked
Agents do NOT stop after each step to ask permission. They continue communicating with each other and producing artifacts until they hit a genuine blocker that requires human input. System prompts emphasize autonomous operation.

### 3. Handoff Documents Are First-Class
When an agent completes work, it creates a structured handoff document (e.g., `handoffs/analyst-to-pm.md`) that tells the next agent what was done, what to focus on, and what's ambiguous.

### 4. Redis for Notifications, Filesystem for Data
Redis is the notification bus ("task assigned", "task complete", "blocked"). The actual content always lives in the filesystem. If Redis goes down, no data is lost.

### 5. Build ON TOP of the Agent SDK
The Claude Agent SDK provides the full agentic loop, built-in tools (Read, Write, Edit, Bash, Glob, Grep), and context management. The orchestrator manages workflow and inter-agent routing; the SDK manages each agent's internal reasoning loop. Never reimplement what the SDK does.

## Development Guidelines

### Package Management
- **ALWAYS use Yarn**: All dependency management uses `yarn`, never `npm install` (except for global CLI tools)
- Lock file: `yarn.lock` only, never `package-lock.json`
- Install commands: `yarn install`, `yarn add`, `yarn add -D`

### TypeScript Standards
- **Strict mode enabled**: `"strict": true` in all `tsconfig.json` files
- All agent code, orchestrator code, and React dashboard code MUST be TypeScript
- No plain JavaScript files (`.js`) in the codebase
- Use proper type definitions for all functions and interfaces

### Code Organization
- **Agent code**: `src/agent/` - entry point, config, MCP server, types
- **Orchestrator code**: `src/orchestrator/` - API server, workflow state, routes
- **Shared code**: `src/shared/` - types and filesystem helpers used by both
- **Dashboard**: `dashboard/` - separate React app with its own `package.json`

### Agent Configuration (`src/agent/config.ts`)
When modifying agent behavior:
- Each agent has a specific role, model, system prompt, allowed tools, and artifact types
- The `systemPromptBase` defines the agent's behavior - emphasize autonomous operation
- Only modify `allowedTools` if the agent genuinely needs new capabilities
- The `produces` and `consumes` fields document the artifact lifecycle

### Artifact Filesystem Structure
Projects live in `/data/projects/{project-id}/`:
```
{project-id}/
├── project.json              # project metadata
├── brief/                    # analyst output
├── requirements/             # PM output (prd.md, epics/, stories/)
├── architecture/             # architect output (architecture.md, adrs/, diagrams/)
├── implementation/           # developer output (src/, tests/)
├── qa/                       # QA output (test-plan.md, test-results/)
├── conversations/            # agent conversation logs (JSONL)
└── handoffs/                 # inter-agent handoff messages
    └── blocks/               # human input requests (JSON)
```

### Docker and Containers
- **Agent containers**: Built from `docker/Dockerfile.agent`, run indefinitely waiting for tasks
- **Orchestrator container**: Built from `docker/Dockerfile.orchestrator`, serves API and WebSocket
- **Network isolation**: `agent-net` is internal (no internet access), only orchestrator bridges to `gateway-net`
- **Shared volume**: `shared-data` mounted at `/data` for all containers

### Security
- API ports bound to `127.0.0.1` only - no internet exposure
- AWS credentials in `.env` file (git-ignored, never committed)
- For remote access, use SSH tunneling or WireGuard VPN
- Container network isolation: agents cannot reach internet directly

## Development Workflow

### Building and Running
```bash
# Install dependencies
yarn install
cd dashboard && yarn install && cd ..

# Build TypeScript
yarn build

# Start containers
docker-compose up --build

# Start dashboard (separate terminal)
cd dashboard && yarn dev
```

### Adding a New Agent
1. Add agent configuration in `src/agent/config.ts`
2. Add agent service in `docker-compose.yml`
3. Update orchestrator routing logic to include the new agent in workflow
4. Update agent type enums in `src/shared/types.ts`

### Modifying Workflows
- Workflow state management: `src/orchestrator/workflow.ts`
- Agent event handling: `src/orchestrator/index.ts` in `handleAgentEvent()`
- Handoff routing logic determines which agent runs next based on project phase

### Testing Changes
- Test agents locally: `yarn dev:agent` (set env vars for AGENT_ROLE, AGENT_ID)
- Test orchestrator locally: `yarn dev:orchestrator`
- Full integration testing requires Docker Compose stack running

## Common Tasks

### Creating Custom MCP Tools
Add new tools in `src/agent/mcp-server.ts`:
- `notify_orchestrator`: Notify orchestrator of status changes
- `create_blocker`: Request human input for decisions
- `read_upstream_artifact`: Semantic wrapper for reading artifacts

### Handling Agent Events
The orchestrator listens for these event types:
- `task_started`, `task_completed`, `task_failed`
- `handoff_ready`, `blocker_created`, `tool_used`

Events are logged to SQLite and broadcast via WebSocket to the dashboard.

### Modifying the Dashboard
- React app uses Vite for dev server
- TailwindCSS for styling
- React Query (`@tanstack/react-query`) for API state management
- WebSocket connection at `ws://localhost:3001/ws` for real-time updates

## Troubleshooting

### Agents Not Starting
- Check Redis is running: `docker-compose ps`
- Check agent logs: `docker-compose logs agent-analyst`
- Verify AWS credentials in `.env` file
- Ensure Bedrock models are enabled in AWS console

### Orchestrator API Errors
- Check SQLite database exists: `ls data/db/orchestrator.sqlite`
- Check port conflicts: `lsof -i :3000` and `lsof -i :3001`
- Verify Redis connection: `docker-compose logs redis`

### Dashboard Not Connecting
- Ensure orchestrator is running: `curl http://localhost:3000/api/projects`
- Check CORS if accessing from different origin
- Verify WebSocket connection in browser dev tools

## Key Files Reference

- `HANDOFF.md`: Complete implementation specification (read this for full context)
- `src/agent/index.ts`: Agent entry point, SDK integration
- `src/orchestrator/index.ts`: Orchestrator API server
- `src/shared/types.ts`: Shared type definitions
- `docker-compose.yml`: Container orchestration configuration
- `data/templates/`: Templates agents use for creating artifacts
- `data/knowledge/`: Shared knowledge base for coding standards

## Version Management

When making changes to infrastructure or scripts:
- Bump version numbers in comments where appropriate
- Update `package.json` version when releasing
- Document breaking changes in comments

## Testing Philosophy

- Integration testing via full Docker Compose stack
- Unit tests for shared utilities in `src/shared/`
- Agent behavior testing requires AWS Bedrock access
- Manual QA via React dashboard for workflow verification
