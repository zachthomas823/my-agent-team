# AI Agent Orchestration Platform

A containerized multi-agent system where specialized AI agents collaborate autonomously to complete software development workflows. Agents handle analysis, requirements, architecture, implementation, and QA — pausing only when they genuinely need human input.

## How It Works

Five AI agents work in sequence, each reading the previous agent's output and producing structured artifacts:

```
Analyst → Product Manager → Architect → Developer → QA
```

Each agent runs the Claude Agent SDK internally, with access to file system tools (Read, Write, Edit, Glob, Grep, Bash). All inter-agent communication happens through structured markdown files on a shared Docker volume — no database blobs, no magic queues.

When an agent is blocked (ambiguous requirement, conflicting specs, a decision that requires human judgment), it creates a **blocker** and pauses. You resolve the blocker in the dashboard, and the agent continues.

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ and Yarn 4
- AWS credentials with Bedrock access **or** an Anthropic API key

## Quick Start

**1. Install dependencies**
```bash
yarn install
cd dashboard && yarn install && cd ..
```

**2. Build TypeScript**
```bash
yarn build
```

**3. Start the stack**
```bash
./scripts/launch-agents.sh
# With a specific AWS profile:
./scripts/launch-agents.sh --profile nfl-dm-analyst
# Force image rebuild:
./scripts/launch-agents.sh --rebuild
```

This resolves your AWS STS credentials on the host, generates `docker/settings.json` with credentials and Bedrock model ARNs injected, starts Docker Compose, and runs a background loop that refreshes credentials every 45 minutes without restarting containers.

**4. Start the dashboard** (separate terminal)
```bash
cd dashboard && yarn dev
```

**5. Open the dashboard at http://localhost:5173**

Create a project, add a description, optionally attach context files, and watch the agents work.

**To stop:**
```bash
# Ctrl+C in the launch-agents.sh terminal (stops cleanly), or:
./scripts/launch-agents.sh --down
```

**To refresh credentials manually** (if your SAML session expires):
```bash
./scripts/refresh-creds.sh
# or with a specific profile:
./scripts/refresh-creds.sh --profile nfl-dm-analyst
```

## Project Structure

```
src/
├── agent/          # Agent code (runs in each container)
│   ├── index.ts    # Entry point — subscribes to Redis task queue
│   ├── config.ts   # Agent roles, system prompts, allowed tools
│   └── mcp-server.ts  # Custom MCP tools for orchestration
├── orchestrator/   # API server
│   ├── index.ts    # Express + WebSocket server
│   ├── workflow.ts # Workflow phase state machine
│   └── routes/     # API endpoints
└── shared/         # Types and filesystem utilities

dashboard/          # React frontend (Vite, runs on host)
docker/             # Dockerfiles and entrypoint scripts
data/
├── templates/      # Markdown templates agents use to create artifacts
├── knowledge/      # Shared coding standards and design principles
├── projects/       # Created at runtime — one directory per project
└── db/             # SQLite database
```

## Artifact Layout

Each project gets a directory under `/data/projects/{project-id}/`:

```
{project-id}/
├── project.json          # Project metadata
├── brief/                # Analyst output
├── requirements/         # PM output (prd.md, epics/, stories/)
├── architecture/         # Architect output (architecture.md, adrs/, diagrams/)
├── implementation/       # Developer output (src/, tests/)
├── qa/                   # QA output (test-plan.md, test-results/)
├── conversations/        # Agent conversation logs (JSONL)
└── handoffs/             # Inter-agent handoff documents
    └── blocks/           # Pending human input requests (JSON)
```

The filesystem **is** the interface. Agents read upstream artifacts, produce downstream artifacts, and the filesystem is the source of truth.

## Dashboard

- **Projects list** — create and track projects, see status at a glance
- **Project view** — workflow timeline, agent status, activity feed, artifact browser, cost summary
- **Blocker resolution** — review what the agent is stuck on, provide guidance or select from options
- **Artifact browser** — browse and download any file produced by any agent; export as ZIP
- **Real-time updates** — WebSocket pushes agent events to the dashboard as they happen

## API

The orchestrator runs on `localhost:3000`. Key endpoints:

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/projects` | Create a new project |
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/projects/:id` | Get project details and workflow state |
| `GET` | `/api/blockers?project_id=:id` | List pending blockers |
| `POST` | `/api/blockers/:id/resolve` | Resolve a blocker |
| `GET` | `/api/projects/:id/artifacts` | List all artifacts |
| `GET` | `/api/projects/:id/artifacts-zip` | Download all artifacts as ZIP |
| `GET` | `/api/agents/status` | Get status of all agents |
| `GET` | `/api/health` | Health check |

WebSocket available at `ws://localhost:3001/ws` for real-time event streaming.

## Container Architecture

```
                    ┌─────────────────────────────┐
                    │         agent-net (internal) │
                    │                              │
  [orchestrator] ───┤── redis ──┬── agent-analyst  │
  (3000, 3001)      │           ├── agent-pm        │
       │            │           ├── agent-architect │
  gateway-net       │           ├── agent-developer │
  (host access)     │           └── agent-qa        │
                    └─────────────────────────────┘
```

- Agents are on an internal network with no internet access
- Only the orchestrator bridges to the host network
- AWS credentials mounted read-only from the host (`~/.aws`)
- All containers share the `shared-data` volume at `/data`

## Development

**Run orchestrator locally** (outside Docker):
```bash
yarn dev:orchestrator
```

**Run a single agent locally**:
```bash
AGENT_ROLE=analyst AGENT_ID=analyst-01 yarn dev:agent
```

**View container logs**:
```bash
docker-compose logs -f orchestrator
docker-compose logs -f agent-analyst
```

**Add a new agent**:
1. Add the agent config to `src/agent/config.ts` (role, model, system prompt, tools)
2. Add the service to `docker-compose.yml`
3. Update the workflow sequence in `src/shared/types.ts`
4. Update routing logic in `src/orchestrator/index.ts`

## AWS Credentials

Credentials are resolved on the **host** (not inside containers), because `credential_process` / `saml2aws` requires a browser and can't run in Docker.

`scripts/launch-agents.sh` calls `aws configure export-credentials` to get a short-lived STS token, injects it into `docker/settings.json`, and mounts that file into every agent container at `~/.claude/settings.json`. A background loop refreshes it every 45 minutes via `docker exec` — no container restart needed.

If your base SAML session expires (typically ~8 hours), re-authenticate on the host:
```bash
saml2aws login --profile saml2aws-browser
```
Then run `./scripts/refresh-creds.sh` to push fresh credentials into the running containers.

## Tech Stack

| Component | Technology |
|---|---|
| Agent runtime | `@anthropic-ai/claude-agent-sdk` v0.2.x (TypeScript) |
| AI models | AWS Bedrock (Claude via inference profiles) |
| API server | Express.js + WebSocket |
| Message bus | Redis 7 (pub/sub) |
| State store | SQLite (embedded) |
| Artifact storage | Filesystem (shared Docker volume) |
| Frontend | React 19 + Vite + TailwindCSS |
| Containers | Docker Compose |