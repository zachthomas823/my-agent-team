# Agent Orchestration Platform — Claude Code Implementation Spec

## What This Document Is

This is a handoff document for Claude Code to implement an AI agent orchestration platform. Read this entire document before writing any code. Follow the implementation phases in order. Ask the user for clarification on any ambiguity — do not guess.

### Tooling Constraints (Non-Negotiable)
- **TypeScript everywhere** — all agent code, orchestrator code, and React dashboard code must be TypeScript. No plain JavaScript files.
- **Yarn only** — use `yarn` for all package management. Never use `npm install` or `npm ci` (exception: global CLI tools like `@anthropic-ai/claude-code` that require `npm install -g`). Use `yarn.lock`, not `package-lock.json`.
- **Strict mode** — enable `"strict": true` in all `tsconfig.json` files.

---

## 1. Project Overview

### Goal
Build a containerized multi-agent orchestration system where specialized AI agents (analyst, product manager, architect, developer, QA) work together autonomously through structured workflows, only stopping to request human input when blocked. The human operator (Zach) interacts through a React dashboard or SSH terminal.

### Design Principles
- **80/20 Rule**: Agents handle 80% of the work autonomously. The human focuses on the 20% that requires judgment — approvals, strategic decisions, disambiguation.
- **Agents Run Until Blocked**: Agents do NOT stop after each step to ask permission. They continue communicating with each other and producing artifacts until they hit a genuine blocker that requires human input.
- **File-Based Handoffs**: All inter-agent communication is mediated through a well-organized artifact filesystem. Agents read upstream artifacts, produce downstream artifacts, and the filesystem is the source of truth.
- **Container Isolation**: Each agent runs in its own Docker container. The orchestrator runs in a separate container. All containers share a volume for the artifact filesystem and communicate via Redis pub/sub.

### Technology Stack
- **Agent Runtime**: `@anthropic-ai/claude-agent-sdk` (TypeScript SDK, v0.2.x)
- **Model Provider**: AWS Bedrock (`CLAUDE_CODE_USE_BEDROCK=1`)
- **Container Orchestration**: Docker Compose (local dev), future migration to ECS/K8s
- **Message Bus**: Redis (pub/sub for agent notifications, streams for event log)
- **Artifact Storage**: Shared Docker volume, file-based (markdown/JSON)
- **State Database**: SQLite (embedded in orchestrator container, persisted to volume)
- **Language**: TypeScript throughout (agent, orchestrator, and dashboard)
- **Package Manager**: Yarn (use `yarn` for all installs, never `npm`)
- **Frontend**: React + TypeScript + Vite, runs locally on the host machine
- **API**: Express.js in the orchestrator container, exposed via mapped port

---

## 2. Architecture

### Container Layout

```
┌─────────────────────────────────────────────────────────┐
│  HOST MACHINE (Zach's workstation or remote VM)         │
│                                                         │
│  ┌──────────────┐                                       │
│  │ React App    │ ← runs on host, not in Docker         │
│  │ localhost:5173│                                       │
│  └──────┬───────┘                                       │
│         │ HTTP (localhost:3000)                          │
│         │ WebSocket (localhost:3001)                     │
│  ═══════╪═══════════════════════════════════════════    │
│  │ Docker Compose Network (agent-net, internal)  │      │
│  │                                               │      │
│  │  ┌──────────────┐    ┌──────────────┐        │      │
│  │  │ orchestrator │    │    redis     │        │      │
│  │  │ :3000 (API)  │◄──►│   :6379     │        │      │
│  │  │ :3001 (WS)   │    └──────────────┘        │      │
│  │  └──────┬───────┘           ▲                │      │
│  │         │                   │                │      │
│  │    ┌────┼────┬────┬────┬───┘                │      │
│  │    │    │    │    │    │                     │      │
│  │  ┌─┴─┐┌─┴─┐┌─┴─┐┌─┴─┐┌─┴─┐               │      │
│  │  │PM ││ARC││DEV││ANA││QA │  (agent pods)   │      │
│  │  └───┘└───┘└───┘└───┘└───┘               │      │
│  │                                               │      │
│  │  ┌────────────────────────────────────┐      │      │
│  │  │ Shared Volume: /data               │      │      │
│  │  │  /data/projects/                   │      │      │
│  │  │  /data/db/orchestrator.sqlite      │      │      │
│  │  └────────────────────────────────────┘      │      │
│  ═══════════════════════════════════════════════        │
└─────────────────────────────────────────────────────────┘
```

### Docker Compose Services

```yaml
# docker-compose.yml
version: "3.9"

volumes:
  shared-data:
  redis-data:

networks:
  agent-net:
    internal: true      # agents cannot reach the internet directly
  gateway-net:          # only orchestrator bridges to host

services:
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    networks:
      - agent-net
    restart: unless-stopped

  orchestrator:
    build:
      context: .
      dockerfile: docker/Dockerfile.orchestrator
    ports:
      - "127.0.0.1:3000:3000"    # API — bound to localhost only
      - "127.0.0.1:3001:3001"    # WebSocket — bound to localhost only
    volumes:
      - shared-data:/data
    environment:
      - CLAUDE_CODE_USE_BEDROCK=1
      - AWS_REGION=${AWS_REGION}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - REDIS_URL=redis://redis:6379
      - DATA_DIR=/data
    networks:
      - agent-net
      - gateway-net
    depends_on:
      - redis
    restart: unless-stopped

  agent-analyst:
    build:
      context: .
      dockerfile: docker/Dockerfile.agent
    environment:
      - AGENT_ROLE=analyst
      - AGENT_ID=analyst-01
      - CLAUDE_CODE_USE_BEDROCK=1
      - AWS_REGION=${AWS_REGION}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - REDIS_URL=redis://redis:6379
      - DATA_DIR=/data
      - ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
    volumes:
      - shared-data:/data
    networks:
      - agent-net
    depends_on:
      - redis
      - orchestrator
    restart: unless-stopped

  agent-pm:
    build:
      context: .
      dockerfile: docker/Dockerfile.agent
    environment:
      - AGENT_ROLE=product-manager
      - AGENT_ID=pm-01
      - CLAUDE_CODE_USE_BEDROCK=1
      - AWS_REGION=${AWS_REGION}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - REDIS_URL=redis://redis:6379
      - DATA_DIR=/data
      - ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
    volumes:
      - shared-data:/data
    networks:
      - agent-net
    depends_on:
      - redis
      - orchestrator
    restart: unless-stopped

  agent-architect:
    build:
      context: .
      dockerfile: docker/Dockerfile.agent
    environment:
      - AGENT_ROLE=architect
      - AGENT_ID=architect-01
      - CLAUDE_CODE_USE_BEDROCK=1
      - AWS_REGION=${AWS_REGION}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - REDIS_URL=redis://redis:6379
      - DATA_DIR=/data
      - ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
    volumes:
      - shared-data:/data
    networks:
      - agent-net
    depends_on:
      - redis
      - orchestrator
    restart: unless-stopped

  agent-developer:
    build:
      context: .
      dockerfile: docker/Dockerfile.agent
    environment:
      - AGENT_ROLE=developer
      - AGENT_ID=dev-01
      - CLAUDE_CODE_USE_BEDROCK=1
      - AWS_REGION=${AWS_REGION}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - REDIS_URL=redis://redis:6379
      - DATA_DIR=/data
      - ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
    volumes:
      - shared-data:/data
    networks:
      - agent-net
    depends_on:
      - redis
      - orchestrator
    restart: unless-stopped

  agent-qa:
    build:
      context: .
      dockerfile: docker/Dockerfile.agent
    environment:
      - AGENT_ROLE=qa
      - AGENT_ID=qa-01
      - CLAUDE_CODE_USE_BEDROCK=1
      - AWS_REGION=${AWS_REGION}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - REDIS_URL=redis://redis:6379
      - DATA_DIR=/data
      - ANTHROPIC_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
    volumes:
      - shared-data:/data
    networks:
      - agent-net
    depends_on:
      - redis
      - orchestrator
    restart: unless-stopped
```

---

## 3. Artifact Filesystem Structure

The shared volume at `/data` is the source of truth for all inter-agent communication. This is NOT a database — it is a human-readable filesystem that the operator can browse directly via SSH or through the React dashboard.

```
/data/
├── projects/
│   └── {project-id}/                    # e.g., "taskflow-app"
│       ├── project.json                 # project metadata, workflow state
│       ├── brief/
│       │   ├── project-brief.md         # analyst output
│       │   └── market-research.md       # optional analyst output
│       ├── requirements/
│       │   ├── prd.md                   # PM output
│       │   ├── epics/
│       │   │   ├── epic-001-auth.md
│       │   │   └── epic-002-tasks.md
│       │   └── stories/
│       │       ├── story-001-login.md
│       │       └── story-002-signup.md
│       ├── architecture/
│       │   ├── architecture.md          # architect output
│       │   ├── adrs/
│       │   │   ├── adr-001-database.md
│       │   │   └── adr-002-auth.md
│       │   └── diagrams/
│       │       └── system-topology.mermaid
│       ├── implementation/
│       │   ├── src/                     # developer output (actual code)
│       │   └── tests/
│       ├── qa/
│       │   ├── test-plan.md
│       │   └── test-results/
│       ├── conversations/               # agent conversation logs
│       │   ├── analyst-001.jsonl
│       │   ├── pm-001.jsonl
│       │   └── architect-001.jsonl
│       └── handoffs/                    # inter-agent handoff messages
│           ├── analyst-to-pm.md         # structured handoff with context
│           ├── pm-to-architect.md
│           ├── architect-to-dev.md
│           └── blocks/                  # human input requests
│               ├── block-001.json       # { agent, question, context, status }
│               └── block-002.json
├── templates/                           # shared templates agents use
│   ├── prd-template.md
│   ├── architecture-template.md
│   ├── adr-template.md
│   ├── epic-template.md
│   ├── story-template.md
│   └── handoff-template.md
├── knowledge/                           # shared knowledge base
│   ├── coding-standards.md
│   ├── tech-radar.md
│   └── design-principles.md
└── db/
    └── orchestrator.sqlite              # workflow state, event log
```

### Handoff Document Format

When an agent completes work and hands off to the next agent, it creates a structured handoff document:

```markdown
# Handoff: Analyst → Product Manager

## Project: TaskFlow App
## Date: 2026-02-17T15:30:00Z
## Status: READY_FOR_REVIEW

## Summary
Market analysis complete. Project brief generated with competitive landscape,
target user personas, and recommended feature set.

## Artifacts Produced
- `/projects/taskflow-app/brief/project-brief.md` — Full project brief
- `/projects/taskflow-app/brief/market-research.md` — Competitive analysis

## Key Decisions Made
1. Target market: Freelancers and small teams (2-10 people)
2. Pricing model: Freemium with $12/mo pro tier
3. Primary differentiator: Simplicity over features

## Open Questions for Next Agent
1. Should we support team permissions in v1 or defer to v2?
2. The brief assumes mobile-web only — confirm no native app needed?

## Blockers Requiring Human Input
- NONE (if there were blockers, they'd be listed here with block IDs)

## Context for PM
Read the full project brief before starting. Pay particular attention to
the "Out of Scope" section — the analyst has already ruled out several
features that competitors offer but that don't fit the target market.
```

### Block Document Format (Human Input Requests)

```json
{
  "id": "block-001",
  "project_id": "taskflow-app",
  "requesting_agent": "pm-01",
  "agent_role": "product-manager",
  "created_at": "2026-02-17T16:45:00Z",
  "status": "pending",
  "priority": "high",
  "category": "decision",
  "question": "The project brief mentions both 'simple time tracking' and 'no time tracking in v1' in different sections. Which is correct?",
  "context": "This affects 3 user stories and the data model. If time tracking is in v1, we need a timer component and a time_entries table.",
  "options": [
    { "id": "a", "label": "Include simple time tracking in v1", "impact": "Adds ~2 weeks dev time, 3 additional stories" },
    { "id": "b", "label": "Defer time tracking to v2", "impact": "Simpler v1, but some early users may churn" },
    { "id": "c", "label": "Include as optional/hidden feature", "impact": "Build it but don't promote it, gather usage data" }
  ],
  "resolution": null,
  "resolved_at": null,
  "resolved_by": null
}
```

---

## 4. Claude Agent SDK Integration

### How Each Agent Uses the SDK

Each agent container runs a long-lived Node.js process. The process:
1. Subscribes to Redis for task assignments
2. When a task arrives, invokes the Claude Agent SDK `query()` function
3. The SDK handles the full agentic loop (thinking → tool use → verification)
4. The agent's working directory is set to the project's directory within `/data/projects/`
5. The SDK has built-in tools (Read, Write, Edit, Bash, Glob, Grep) — these operate on the project filesystem
6. Custom MCP tools are registered for inter-agent communication

### Agent Process Entry Point

```typescript
// src/agent/index.ts — this runs in every agent container

import { query } from "@anthropic-ai/claude-agent-sdk";
import { createClient } from "redis";
import { getAgentConfig } from "./config";
import { createAgentMcpServer } from "./mcp-server";

const AGENT_ROLE = process.env.AGENT_ROLE!;
const AGENT_ID = process.env.AGENT_ID!;
const REDIS_URL = process.env.REDIS_URL!;
const DATA_DIR = process.env.DATA_DIR!;

async function main() {
  const config = getAgentConfig(AGENT_ROLE);
  const redis = createClient({ url: REDIS_URL });
  const subscriber = redis.duplicate();
  await redis.connect();
  await subscriber.connect();

  console.log(`[${AGENT_ID}] Agent online. Role: ${AGENT_ROLE}. Waiting for tasks...`);

  // Subscribe to task assignments for this agent
  await subscriber.subscribe(`tasks:${AGENT_ID}`, async (message) => {
    const task = JSON.parse(message);
    console.log(`[${AGENT_ID}] Received task: ${task.id}`);

    try {
      await executeTask(task, config, redis);
    } catch (error) {
      console.error(`[${AGENT_ID}] Task failed:`, error);
      await redis.publish("events:orchestrator", JSON.stringify({
        type: "task_failed",
        agent_id: AGENT_ID,
        task_id: task.id,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      }));
    }
  });

  // Also subscribe to direct messages from other agents
  await subscriber.subscribe(`agent:${AGENT_ID}:messages`, async (message) => {
    // Handle inter-agent communication
    const msg = JSON.parse(message);
    console.log(`[${AGENT_ID}] Message from ${msg.from}: ${msg.subject}`);
  });
}

async function executeTask(
  task: TaskAssignment,
  config: AgentConfig,
  redis: ReturnType<typeof createClient>
) {
  const projectDir = `${DATA_DIR}/projects/${task.project_id}`;

  // Build the system prompt from the agent's config
  const systemPrompt = buildSystemPrompt(config, task);

  // Publish status update
  await redis.publish("events:orchestrator", JSON.stringify({
    type: "task_started",
    agent_id: AGENT_ID,
    task_id: task.id,
    timestamp: new Date().toISOString(),
  }));

  // Run the agent SDK — this is where the magic happens
  // The SDK handles the entire agentic loop: thinking, reading files,
  // writing artifacts, running commands, etc.
  let finalResult = "";

  for await (const message of query({
    prompt: task.prompt,
    options: {
      model: config.model,
      systemPrompt: systemPrompt,
      workingDir: projectDir,
      permissionMode: "bypassPermissions",  // agents run headless
      maxTurns: 100,
      allowedTools: config.allowedTools,
      // Register custom MCP tools for inter-agent communication
      mcpServers: {
        orchestrator: createAgentMcpServer(AGENT_ID, redis, DATA_DIR),
      },
    },
  })) {
    // Stream events to the orchestrator
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if ("text" in block) {
          finalResult = block.text;
        }
        // Log tool usage
        if ("name" in block) {
          await redis.publish("events:orchestrator", JSON.stringify({
            type: "tool_used",
            agent_id: AGENT_ID,
            task_id: task.id,
            tool: block.name,
            timestamp: new Date().toISOString(),
          }));
        }
      }
    }

    if (message.type === "result") {
      finalResult = message.result;
    }
  }

  // Task complete — notify orchestrator
  await redis.publish("events:orchestrator", JSON.stringify({
    type: "task_completed",
    agent_id: AGENT_ID,
    task_id: task.id,
    result_summary: finalResult.substring(0, 500),
    timestamp: new Date().toISOString(),
  }));
}

main().catch(console.error);
```

### Agent Configuration

```typescript
// src/agent/config.ts

export interface AgentConfig {
  role: string;
  model: "sonnet" | "opus" | "haiku";
  systemPromptBase: string;
  allowedTools: string[];
  produces: string[];       // artifact types this agent creates
  consumes: string[];       // artifact types this agent reads
}

export function getAgentConfig(role: string): AgentConfig {
  const configs: Record<string, AgentConfig> = {
    analyst: {
      role: "analyst",
      model: "sonnet",
      systemPromptBase: `You are a Business Analyst. Your job is to take a raw project
idea and produce a comprehensive project brief with market analysis, target
user personas, competitive landscape, and recommended feature set.

CRITICAL BEHAVIORS:
- Read any existing materials in the project directory before starting
- Write your output to the brief/ subdirectory
- Create a handoff document at handoffs/analyst-to-pm.md when done
- If you need human input, create a block file at handoffs/blocks/
- Do NOT stop to ask permission — work autonomously until blocked
- Use the notify_orchestrator tool when you complete work or hit a blocker`,
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Task"],
      produces: ["project-brief", "market-research"],
      consumes: [],
    },

    "product-manager": {
      role: "product-manager",
      model: "sonnet",
      systemPromptBase: `You are a Product Manager. Your job is to read the project brief
from the analyst and produce a Product Requirements Document (PRD) with user
personas, user stories with acceptance criteria, success metrics, and scope.

CRITICAL BEHAVIORS:
- Read the project brief at brief/project-brief.md before starting
- Read the handoff document at handoffs/analyst-to-pm.md for context
- Write your PRD to requirements/prd.md
- Create epics in requirements/epics/ and stories in requirements/stories/
- Create a handoff document at handoffs/pm-to-architect.md when done
- If the brief has ambiguities, try to resolve them yourself first
- Only create a blocker if you genuinely cannot proceed without human input
- Use the notify_orchestrator tool when you complete work or hit a blocker`,
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Task"],
      produces: ["prd", "epics", "stories"],
      consumes: ["project-brief"],
    },

    architect: {
      role: "architect",
      model: "sonnet",
      systemPromptBase: `You are a Solutions Architect. Your job is to read the PRD and
project brief and produce a system architecture document with component
design, data model, API contracts, technology decisions (as ADRs), and
deployment topology.

CRITICAL BEHAVIORS:
- Read the PRD at requirements/prd.md and brief at brief/project-brief.md
- Read the handoff at handoffs/pm-to-architect.md for context
- Write your architecture doc to architecture/architecture.md
- Create ADRs in architecture/adrs/ for every major tech decision
- Create Mermaid diagrams in architecture/diagrams/
- Create a handoff at handoffs/architect-to-dev.md when done
- If the PRD has gaps that block architecture decisions, create a blocker
- Use the notify_orchestrator tool when you complete work or hit a blocker`,
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Task"],
      produces: ["architecture-doc", "adrs"],
      consumes: ["prd", "project-brief"],
    },

    developer: {
      role: "developer",
      model: "sonnet",
      systemPromptBase: `You are a Senior Developer. Your job is to read the architecture
doc, stories, and PRD, then implement the code in the implementation/ directory.

CRITICAL BEHAVIORS:
- Read the architecture doc, stories, and ADRs before starting
- Read the handoff at handoffs/architect-to-dev.md for context
- Write code to implementation/src/
- Write tests to implementation/tests/
- Follow the coding standards in /data/knowledge/coding-standards.md
- Implement one story at a time, writing tests for each
- Use the notify_orchestrator tool when stories are complete
- If a story is unclear, check with the PM via create_blocker before guessing`,
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Task"],
      produces: ["code", "tests"],
      consumes: ["architecture-doc", "stories", "prd"],
    },

    qa: {
      role: "qa",
      model: "haiku",
      systemPromptBase: `You are a QA Engineer. Your job is to review artifacts produced
by other agents for quality, completeness, and consistency.

CRITICAL BEHAVIORS:
- When asked to review a PRD, check for missing acceptance criteria,
  conflicting requirements, and unmeasurable success metrics
- When asked to review architecture, check for missing error handling,
  security gaps, and inconsistencies with the PRD
- When asked to review code, check for missing tests, security issues,
  and deviations from the architecture
- Write review reports to qa/
- Create blockers for any critical issues found
- Use the notify_orchestrator tool with your findings`,
      allowedTools: ["Read", "Glob", "Grep", "Write", "Task"],
      produces: ["test-plan", "review-report"],
      consumes: ["prd", "architecture-doc", "code"],
    },
  };

  const config = configs[role];
  if (!config) throw new Error(`Unknown agent role: ${role}`);
  return config;
}
```

### Custom MCP Server for Agent Communication

Each agent gets a custom MCP server that provides tools for inter-agent communication:

```typescript
// src/agent/mcp-server.ts

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";

export function createAgentMcpServer(
  agentId: string,
  redis: RedisClient,
  dataDir: string
) {
  return createSdkMcpServer({
    name: "orchestrator-tools",
    tools: [
      tool({
        name: "notify_orchestrator",
        description:
          "Notify the orchestrator of a status change. Use when: " +
          "(1) you complete a task, (2) you hit a blocker needing human input, " +
          "(3) you want to hand off to the next agent.",
        parameters: {
          type: "object",
          properties: {
            event_type: {
              type: "string",
              enum: ["task_complete", "blocked", "handoff_ready", "review_needed"],
            },
            message: { type: "string", description: "What happened" },
            next_agent: {
              type: "string",
              description: "Which agent should work next (if handoff)",
              enum: ["analyst", "product-manager", "architect", "developer", "qa"],
            },
            block_id: {
              type: "string",
              description: "ID of the block file created (if blocked)",
            },
          },
          required: ["event_type", "message"],
        },
        execute: async (input) => {
          await redis.publish("events:orchestrator", JSON.stringify({
            type: input.event_type,
            agent_id: agentId,
            message: input.message,
            next_agent: input.next_agent,
            block_id: input.block_id,
            timestamp: new Date().toISOString(),
          }));
          return { result: "Orchestrator notified" };
        },
      }),

      tool({
        name: "create_blocker",
        description:
          "Create a blocker that requires human input. The orchestrator will " +
          "surface this in the React dashboard. Only use when you genuinely " +
          "cannot proceed without a human decision.",
        parameters: {
          type: "object",
          properties: {
            question: { type: "string", description: "What you need answered" },
            context: { type: "string", description: "Why this matters" },
            priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
            options: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  impact: { type: "string" },
                },
              },
              description: "Possible choices for the human",
            },
          },
          required: ["question", "context", "priority"],
        },
        execute: async (input) => {
          const blockId = `block-${Date.now()}`;
          const blockPath = `${dataDir}/projects/CURRENT_PROJECT/handoffs/blocks/${blockId}.json`;
          // Write block file to filesystem
          const block = {
            id: blockId,
            requesting_agent: agentId,
            created_at: new Date().toISOString(),
            status: "pending",
            ...input,
          };
          // The agent will write this via its own Write tool
          // We just return the block ID for reference
          await redis.publish("events:orchestrator", JSON.stringify({
            type: "blocker_created",
            agent_id: agentId,
            block_id: blockId,
            priority: input.priority,
            question: input.question,
            timestamp: new Date().toISOString(),
          }));
          return { result: `Blocker created: ${blockId}. Write the full block JSON to handoffs/blocks/${blockId}.json` };
        },
      }),

      tool({
        name: "read_upstream_artifact",
        description:
          "Read an artifact produced by an upstream agent. Use this to " +
          "understand what was already done before starting your work.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative path within the project directory" },
          },
          required: ["path"],
        },
        execute: async (input) => {
          // The agent's Read tool already handles this, but this provides
          // a semantic wrapper that the orchestrator can track
          const fs = await import("fs/promises");
          try {
            const content = await fs.readFile(
              `${dataDir}/projects/CURRENT_PROJECT/${input.path}`,
              "utf-8"
            );
            return { result: content };
          } catch {
            return { result: `File not found: ${input.path}` };
          }
        },
      }),
    ],
  });
}
```

---

## 5. Orchestrator

The orchestrator is the central coordinator. It does NOT do AI work itself — it manages workflow state, routes tasks to agents, handles human input, and serves the API.

### Orchestrator Responsibilities
1. Receive new project requests from the human (via API/React)
2. Initialize the project directory structure
3. Assign the first task to the analyst agent
4. Listen for agent events (task complete, blocked, handoff)
5. When an agent completes, check if the next agent can start
6. When an agent is blocked, surface the blocker in the React dashboard
7. When the human resolves a blocker, notify the blocked agent
8. Serve the REST API and WebSocket connections for the React dashboard

### Orchestrator Process

```typescript
// src/orchestrator/index.ts

import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createClient } from "redis";
import Database from "better-sqlite3";
import { initializeProjectDir, getWorkflowState } from "./workflow";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

app.use(express.json());

// Database for event log and workflow state
const db = new Database("/data/db/orchestrator.sqlite");
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    current_phase TEXT DEFAULT 'analysis',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    agent_id TEXT,
    event_type TEXT,
    data TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS blockers (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    agent_id TEXT,
    question TEXT,
    context TEXT,
    priority TEXT,
    options TEXT,
    status TEXT DEFAULT 'pending',
    resolution TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT
  );
`);

// Redis for pub/sub
const redis = createClient({ url: process.env.REDIS_URL });
const subscriber = redis.duplicate();

async function main() {
  await redis.connect();
  await subscriber.connect();

  // Listen for all agent events
  await subscriber.subscribe("events:orchestrator", async (message) => {
    const event = JSON.parse(message);
    handleAgentEvent(event);
  });

  // --- REST API ---

  // Create a new project
  app.post("/api/projects", async (req, res) => {
    const { name, description } = req.body;
    const projectId = name.toLowerCase().replace(/\s+/g, "-");
    await initializeProjectDir(`/data/projects/${projectId}`);
    db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run(projectId, name);

    // Assign first task to analyst
    await redis.publish(`tasks:analyst-01`, JSON.stringify({
      id: `task-${Date.now()}`,
      project_id: projectId,
      prompt: `Analyze this project idea and create a comprehensive project brief:\n\n${description}`,
      phase: "analysis",
    }));

    res.json({ id: projectId, status: "started" });
  });

  // Get project status
  app.get("/api/projects/:id", (req, res) => {
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    const state = getWorkflowState(req.params.id, db);
    res.json({ ...project, workflow: state });
  });

  // List all projects
  app.get("/api/projects", (req, res) => {
    const projects = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all();
    res.json(projects);
  });

  // Get pending blockers
  app.get("/api/blockers", (req, res) => {
    const blockers = db.prepare(
      "SELECT * FROM blockers WHERE status = 'pending' ORDER BY priority DESC, created_at ASC"
    ).all();
    res.json(blockers);
  });

  // Resolve a blocker
  app.post("/api/blockers/:id/resolve", async (req, res) => {
    const { resolution, selected_option } = req.body;
    db.prepare(
      "UPDATE blockers SET status = 'resolved', resolution = ?, resolved_at = datetime('now') WHERE id = ?"
    ).run(JSON.stringify({ resolution, selected_option }), req.params.id);

    const blocker = db.prepare("SELECT * FROM blockers WHERE id = ?").get(req.params.id) as any;

    // Notify the agent that was blocked
    await redis.publish(`agent:${blocker.agent_id}:messages`, JSON.stringify({
      type: "blocker_resolved",
      block_id: req.params.id,
      resolution,
      selected_option,
      from: "human",
    }));

    // Also write the resolution to the block file
    // so the agent can read it from the filesystem
    broadcastToClients({
      type: "blocker_resolved",
      blocker_id: req.params.id,
    });

    res.json({ status: "resolved" });
  });

  // Get event stream for a project
  app.get("/api/projects/:id/events", (req, res) => {
    const events = db.prepare(
      "SELECT * FROM events WHERE project_id = ? ORDER BY created_at DESC LIMIT 100"
    ).all(req.params.id);
    res.json(events);
  });

  // Get artifact content
  app.get("/api/projects/:id/artifacts/*", async (req, res) => {
    const artifactPath = req.params[0];
    const fullPath = `/data/projects/${req.params.id}/${artifactPath}`;
    try {
      const fs = await import("fs/promises");
      const content = await fs.readFile(fullPath, "utf-8");
      res.json({ path: artifactPath, content });
    } catch {
      res.status(404).json({ error: "Artifact not found" });
    }
  });

  // Send a message to a specific agent (human directing work)
  app.post("/api/agents/:agentId/message", async (req, res) => {
    const { message, project_id } = req.body;
    await redis.publish(`tasks:${req.params.agentId}`, JSON.stringify({
      id: `task-${Date.now()}`,
      project_id,
      prompt: message,
      phase: "directed",
    }));
    res.json({ status: "sent" });
  });

  // --- WebSocket for real-time updates ---
  wss.on("connection", (ws) => {
    console.log("Dashboard client connected");
    ws.on("close", () => console.log("Dashboard client disconnected"));
  });

  function broadcastToClients(data: unknown) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(message);
    });
  }

  // --- Agent Event Handler ---
  async function handleAgentEvent(event: any) {
    // Log to database
    db.prepare(
      "INSERT INTO events (project_id, agent_id, event_type, data) VALUES (?, ?, ?, ?)"
    ).run(event.project_id, event.agent_id, event.type, JSON.stringify(event));

    // Broadcast to dashboard
    broadcastToClients(event);

    switch (event.type) {
      case "task_completed":
      case "handoff_ready": {
        // Check if next agent should be triggered
        if (event.next_agent) {
          const agentIdMap: Record<string, string> = {
            analyst: "analyst-01",
            "product-manager": "pm-01",
            architect: "architect-01",
            developer: "dev-01",
            qa: "qa-01",
          };
          const nextAgentId = agentIdMap[event.next_agent];
          if (nextAgentId) {
            // Auto-advance to next agent
            await redis.publish(`tasks:${nextAgentId}`, JSON.stringify({
              id: `task-${Date.now()}`,
              project_id: event.project_id,
              prompt: `Pick up work on this project. Read the handoff document and upstream artifacts, then begin your work. Continue autonomously until you complete your deliverables or are blocked.`,
              phase: event.next_agent,
            }));

            db.prepare(
              "UPDATE projects SET current_phase = ?, updated_at = datetime('now') WHERE id = ?"
            ).run(event.next_agent, event.project_id);
          }
        }
        break;
      }

      case "blocker_created": {
        db.prepare(
          "INSERT OR REPLACE INTO blockers (id, project_id, agent_id, question, priority, status) VALUES (?, ?, ?, ?, ?, 'pending')"
        ).run(event.block_id, event.project_id, event.agent_id, event.question, event.priority);
        break;
      }

      case "task_failed": {
        console.error(`Agent ${event.agent_id} failed:`, event.error);
        break;
      }
    }
  }

  server.listen(3000, "0.0.0.0", () => {
    console.log("Orchestrator API running on :3000");
  });
}

main().catch(console.error);
```

---

## 6. React Dashboard

The React app runs locally on the host machine (NOT in Docker). It connects to the orchestrator API on `localhost:3000` and WebSocket on `localhost:3001`.

### Pages

1. **Dashboard Home** — List of all projects with status badges (active, blocked, complete)
2. **Project View** — For a specific project:
   - **Workflow Timeline** — Visual pipeline showing phases (analysis → requirements → architecture → development → QA) with current position highlighted
   - **Blockers Panel** — Pending human input requests with resolve buttons, prioritized by urgency
   - **Artifact Browser** — File tree of the project's artifact directory with markdown rendering
   - **Activity Feed** — Real-time stream of agent events (who did what, when)
   - **Agent Status** — Which agents are idle, working, or blocked
3. **Agent Chat** — Direct message interface to any specific agent (for when you want to direct work manually)

### Key UI Components

```
┌─────────────────────────────────────────────────────────────────┐
│  🏠 Projects    │  TaskFlow App                               │
├─────────────────┤                                              │
│                 │  ┌─ Workflow ──────────────────────────────┐  │
│  ● TaskFlow     │  │ ✅ Analysis → ✅ Requirements →        │  │
│    (In Progress)│  │ 🔄 Architecture → ○ Development → ○ QA │  │
│                 │  └────────────────────────────────────────┘  │
│  ○ CRM System   │                                              │
│    (Planning)   │  ┌─ Blockers (1 pending) ─────────────────┐  │
│                 │  │ 🔴 HIGH: Architect needs DB decision    │  │
│                 │  │    "PostgreSQL vs DynamoDB for the..."  │  │
│                 │  │    [Option A] [Option B] [Custom Answer]│  │
│                 │  └────────────────────────────────────────┘  │
│                 │                                              │
│                 │  ┌─ Artifacts ──────┐ ┌─ Activity ────────┐ │
│                 │  │ 📁 brief/        │ │ 14:32 architect   │ │
│                 │  │   project-brief  │ │   wrote ADR-001   │ │
│                 │  │ 📁 requirements/ │ │ 14:28 architect   │ │
│                 │  │   prd.md ✅      │ │   read prd.md     │ │
│                 │  │   epics/ (3)     │ │ 14:25 pm → arch   │ │
│                 │  │   stories/ (12)  │ │   handoff created │ │
│                 │  │ 📁 architecture/ │ │ 14:20 pm          │ │
│                 │  │   🔄 in progress │ │   wrote prd.md    │ │
│                 │  └─────────────────┘ └────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### React App Setup

```bash
# Create with Vite
yarn create vite dashboard --template react-ts
cd dashboard
yarn install
yarn add @tanstack/react-query socket.io-client react-markdown
yarn add -D tailwindcss @tailwindcss/typography
```

### Key Data Hooks

```typescript
// src/hooks/useProject.ts
import { useQuery } from "@tanstack/react-query";

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetch(`http://localhost:3000/api/projects/${projectId}`).then(r => r.json()),
    refetchInterval: 5000,
  });
}

export function useBlockers() {
  return useQuery({
    queryKey: ["blockers"],
    queryFn: () => fetch("http://localhost:3000/api/blockers").then(r => r.json()),
    refetchInterval: 3000,
  });
}

// src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback } from "react";

export function useAgentEvents(onEvent: (event: any) => void) {
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    ws.current = new WebSocket("ws://localhost:3001/ws");
    ws.current.onmessage = (e) => onEvent(JSON.parse(e.data));
    return () => ws.current?.close();
  }, [onEvent]);
}
```

---

## 7. Security

### Principle: Zero Exposed Ports to the Internet

The Docker Compose config binds API ports to `127.0.0.1` only. Nothing is accessible from outside the host machine unless you explicitly set up a tunnel.

### Local Access (Default)
When running on your workstation, the React app at `localhost:5173` talks to the orchestrator at `localhost:3000`. No additional setup needed. This is the most secure configuration.

### Remote Access via SSH Tunnel

If the Docker containers run on a remote VM (e.g., an EC2 instance), use SSH port forwarding to securely access the orchestrator:

```bash
# On your local machine — creates a secure tunnel
ssh -L 3000:localhost:3000 -L 3001:localhost:3001 -N -f user@your-vm-ip

# Now localhost:3000 on your machine tunnels to the VM's localhost:3000
# The React app works identically — it still connects to localhost:3000
```

SSH tunnel setup for the remote VM:

```bash
# On the remote VM: /etc/ssh/sshd_config
# Ensure these settings:
PasswordAuthentication no          # key-based auth only
PermitRootLogin no                 # no root SSH
AllowUsers zach                    # whitelist your user
Port 2222                          # non-standard port (optional)
MaxAuthTries 3
LoginGraceTime 30

# Generate SSH key pair (on your local machine, if you haven't already)
ssh-keygen -t ed25519 -C "orchestrator-access"

# Copy public key to the VM
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@your-vm-ip
```

### Alternative: WireGuard VPN

For a more persistent connection than SSH tunneling (especially if you want mobile access to the dashboard):

```bash
# On the remote VM
sudo apt install wireguard
wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key

# /etc/wireguard/wg0.conf
[Interface]
PrivateKey = <server_private_key>
Address = 10.0.0.1/24
ListenPort = 51820

[Peer]
PublicKey = <client_public_key>
AllowedIPs = 10.0.0.2/32

# On your local machine
sudo apt install wireguard
wg genkey | tee /etc/wireguard/client_private.key | wg pubkey > /etc/wireguard/client_public.key

# /etc/wireguard/wg0.conf
[Interface]
PrivateKey = <client_private_key>
Address = 10.0.0.2/24

[Peer]
PublicKey = <server_public_key>
Endpoint = your-vm-ip:51820
AllowedIPs = 10.0.0.1/32
PersistentKeepalive = 25
```

With WireGuard active, the React app connects to `10.0.0.1:3000` instead of `localhost:3000`.

### AWS Credentials for Bedrock

The `.env` file with AWS credentials should NEVER be committed to git. The Docker Compose file references environment variables that are loaded from `.env`:

```bash
# .env (git-ignored)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

For production, replace static credentials with IAM instance roles (if running on EC2) or OIDC federation. The Agent SDK supports all standard AWS credential chain methods via `CLAUDE_CODE_USE_BEDROCK=1`.

### Container Network Isolation

- The `agent-net` network is marked `internal: true` — agent containers cannot reach the internet directly
- Only the orchestrator bridges to `gateway-net` for the host-mapped ports
- Agents communicate exclusively through Redis (on `agent-net`) and the shared volume
- If an agent needs internet access (e.g., for web research), add it to `gateway-net` explicitly and document why

---

## 8. Docker Image

### Agent Dockerfile

```dockerfile
# docker/Dockerfile.agent
FROM node:20-slim

# Install Claude Code CLI (required by the Agent SDK)
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

# Copy agent source
COPY dist/agent/ ./agent/

# Non-root user
RUN useradd -m -d /home/agent agent
USER agent

# The agent process runs indefinitely, waiting for tasks
CMD ["node", "agent/index.js"]
```

### Orchestrator Dockerfile

```dockerfile
# docker/Dockerfile.orchestrator
FROM node:20-slim

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

COPY dist/orchestrator/ ./orchestrator/

RUN useradd -m -d /home/orch orch
USER orch

EXPOSE 3000 3001

CMD ["node", "orchestrator/index.js"]
```

---

## 9. Project File Structure

```
agent-orchestrator/
├── docker/
│   ├── Dockerfile.agent
│   └── Dockerfile.orchestrator
├── docker-compose.yml
├── .env                          # AWS creds, git-ignored
├── .env.example                  # template
├── package.json
├── tsconfig.json
├── src/
│   ├── agent/
│   │   ├── index.ts              # agent entry point
│   │   ├── config.ts             # agent role configurations
│   │   ├── mcp-server.ts         # custom MCP tools
│   │   └── types.ts
│   ├── orchestrator/
│   │   ├── index.ts              # orchestrator entry point (express + ws)
│   │   ├── workflow.ts           # workflow state management
│   │   ├── routes/
│   │   │   ├── projects.ts
│   │   │   ├── blockers.ts
│   │   │   ├── agents.ts
│   │   │   └── artifacts.ts
│   │   └── types.ts
│   └── shared/
│       ├── types.ts              # shared types between agent and orchestrator
│       └── filesystem.ts         # helpers for artifact filesystem
├── dashboard/                    # React app (separate npm project)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ProjectView.tsx
│   │   │   └── AgentChat.tsx
│   │   ├── components/
│   │   │   ├── WorkflowTimeline.tsx
│   │   │   ├── BlockerPanel.tsx
│   │   │   ├── ArtifactBrowser.tsx
│   │   │   ├── ActivityFeed.tsx
│   │   │   └── AgentStatus.tsx
│   │   └── hooks/
│   │       ├── useProject.ts
│   │       ├── useBlockers.ts
│   │       └── useWebSocket.ts
│   └── index.html
├── data/                         # mounted as shared volume
│   ├── templates/
│   │   ├── prd-template.md
│   │   ├── architecture-template.md
│   │   ├── adr-template.md
│   │   ├── epic-template.md
│   │   ├── story-template.md
│   │   └── handoff-template.md
│   └── knowledge/
│       ├── coding-standards.md
│       ├── tech-radar.md
│       └── design-principles.md
└── scripts/
    ├── setup.sh                  # first-time setup
    ├── start.sh                  # docker-compose up
    └── reset-project.sh          # clear a project's data
```

---

## 10. Implementation Phases

### Phase 1: Foundation (Do This First)
1. Initialize the monorepo with TypeScript, configure build
2. Create the shared types (`src/shared/types.ts`)
3. Create the artifact filesystem helpers (`src/shared/filesystem.ts`) — functions to initialize project directories, read/write artifacts, list projects
4. Create the orchestrator with Express + WebSocket + SQLite — just the API routes, no agent integration yet
5. Verify: You can `POST /api/projects` and see the directory structure created
6. Create the React dashboard with Vite — wire up to the API, show project list and empty project view
7. Verify: You can create a project from the React UI and see it listed

### Phase 2: Single Agent (Proof of Concept)
1. Implement the agent entry point (`src/agent/index.ts`) with the Claude Agent SDK
2. Implement the analyst agent config only
3. Create the Dockerfiles
4. Create a minimal docker-compose with just redis + orchestrator + analyst
5. Wire up Redis pub/sub: orchestrator publishes task → analyst receives it → analyst runs SDK → analyst publishes completion
6. Verify: Create a project, analyst automatically produces a project brief, you can read it in the React UI

### Phase 3: Multi-Agent Pipeline
1. Add PM, architect, developer agent configs
2. Implement the handoff flow: analyst completes → orchestrator routes to PM → PM completes → orchestrator routes to architect
3. Implement the blocker system: agent creates block file + publishes event → orchestrator surfaces in API → React shows in blocker panel → human resolves → agent is notified
4. Add all agent containers to docker-compose
5. Verify: End-to-end flow from project creation through at least architecture phase, with at least one blocker resolved by the human

### Phase 4: Dashboard Polish
1. Implement the artifact browser with markdown rendering
2. Implement the workflow timeline visualization
3. Implement the activity feed with real-time WebSocket updates
4. Implement the agent chat interface for direct human→agent messages
5. Add status badges, timestamps, and progress indicators

### Phase 5: Hardening
1. Add error recovery — if an agent crashes, orchestrator detects and can restart the task
2. Add conversation persistence — save full SDK transcripts to the conversations/ directory
3. Add cost tracking — log token usage per task from SDK results
4. Add the QA agent loop — after each phase, QA reviews the output before advancing
5. Add `docker-compose.prod.yml` for remote VM deployment with proper resource limits

---

## 11. Key Design Decisions to Preserve

These decisions were made deliberately. Do not change them without discussing with the user.

1. **File-based artifacts over database blobs**: The filesystem IS the interface. Zach should be able to `ls /data/projects/` and see exactly what every agent has produced. This also means agents can use the SDK's built-in Read/Write/Edit tools directly on the artifact files.

2. **Agents run until blocked, not step-by-step**: The system prompt for every agent says "continue autonomously until you complete your deliverables or are blocked." Agents should NOT stop after each small step to ask permission. They read upstream artifacts, do their full job, write downstream artifacts, create a handoff, and then notify the orchestrator.

3. **Handoff documents are first-class artifacts**: When an agent finishes, it creates a structured handoff markdown file that tells the next agent what was done, what to focus on, and what's ambiguous. This is how agents "communicate" — through well-structured documents, not chat messages.

4. **Redis pub/sub for notifications, filesystem for data**: Redis is the notification bus ("hey, I'm done" / "hey, you have a task"). The actual content always lives in the filesystem. If Redis goes down and comes back, no data is lost — just pick up where you left off by scanning the filesystem.

5. **Claude Agent SDK, not raw API calls**: The SDK provides the full agentic loop, built-in tools, and context management. We're building ON TOP of the SDK, not reimplementing what it does. Our orchestrator manages workflow and inter-agent routing; the SDK manages the agent's internal reasoning loop.

6. **Bedrock via environment variable**: Setting `CLAUDE_CODE_USE_BEDROCK=1` with standard AWS credential environment variables. No custom Bedrock integration code needed — the SDK handles it.

---

## 12. Environment Setup Checklist

Before running anything:

```bash
# 1. AWS Bedrock access
# Ensure Claude models are enabled in your Bedrock console (us-east-1)
# Models needed: claude-sonnet-4-5, claude-haiku-4-5

# 2. Create .env from template
cp .env.example .env
# Fill in AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION

# 3. Install dependencies
yarn install
cd dashboard && yarn install && cd ..

# 4. Build TypeScript
yarn build

# 5. Start the stack
docker-compose up --build

# 6. Start the dashboard (separate terminal)
cd dashboard && yarn dev

# 7. Open http://localhost:5173
```
