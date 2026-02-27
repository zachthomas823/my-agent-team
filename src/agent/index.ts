import { query } from "@anthropic-ai/claude-agent-sdk";
import { createClient, type RedisClientType } from "redis";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { getAgentConfig } from "./config.js";
import { createAgentMcpServer } from "./mcp-server.js";
import type { AgentConfig } from "./types.js";
import type { TaskAssignment } from "../shared/types.js";

const AGENT_ROLE = process.env.AGENT_ROLE;
const AGENT_ID = process.env.AGENT_ID;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const DATA_DIR = process.env.DATA_DIR || "./data";

if (!AGENT_ROLE || !AGENT_ID) {
  console.error("AGENT_ROLE and AGENT_ID environment variables are required");
  process.exit(1);
}

// If short-term STS credentials are injected (AWS_ACCESS_KEY_ID is set), unset AWS_PROFILE
// so the AWS SDK doesn't try to resolve it via credential_process (saml2aws), which is not
// available inside Docker containers.
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_PROFILE) {
  console.log(`[${AGENT_ID}] Injected STS credentials detected — unsetting AWS_PROFILE to prevent credential_process chain`);
  delete process.env.AWS_PROFILE;
}

async function main() {
  const config = getAgentConfig(AGENT_ROLE!);
  const redis = createClient({ url: REDIS_URL }) as RedisClientType;
  const subscriber = redis.duplicate() as RedisClientType;
  await redis.connect();
  await subscriber.connect();

  console.log(
    `[${AGENT_ID}] Agent online. Role: ${AGENT_ROLE}. Waiting for tasks...`
  );

  // Subscribe to task assignments
  await subscriber.subscribe(`tasks:${AGENT_ID}`, async (message: string) => {
    const task: TaskAssignment = JSON.parse(message);
    console.log(`[${AGENT_ID}] Received task: ${task.id}`);

    try {
      await executeTask(task, config, redis);
    } catch (error) {
      console.error(`[${AGENT_ID}] Task failed:`, error);
      await redis.publish(
        "events:orchestrator",
        JSON.stringify({
          type: "task_failed",
          agent_id: AGENT_ID,
          task_id: task.id,
          project_id: task.project_id,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        })
      );
    }
  });

  // Subscribe to direct messages (e.g., blocker resolutions)
  await subscriber.subscribe(
    `agent:${AGENT_ID}:messages`,
    async (message: string) => {
      const msg = JSON.parse(message);
      console.log(`[${AGENT_ID}] Message received:`, msg.type);
    }
  );
}

async function executeTask(
  task: TaskAssignment,
  config: AgentConfig,
  redis: RedisClientType
) {
  const projectDir = `${DATA_DIR}/projects/${task.project_id}`;
  const systemPrompt = buildSystemPrompt(config, task);
  const mcpServer = createAgentMcpServer(AGENT_ID!, redis, task.project_id);

  // Publish task_started event
  await redis.publish(
    "events:orchestrator",
    JSON.stringify({
      type: "task_started",
      agent_id: AGENT_ID,
      task_id: task.id,
      project_id: task.project_id,
      timestamp: new Date().toISOString(),
    })
  );

  console.log(`[${AGENT_ID}] Starting query for task ${task.id}...`);

  let finalResult = "";
  const conversationLog: string[] = [];

  for await (const message of query({
    prompt: task.prompt,
    options: {
      model: config.model,
      systemPrompt,
      cwd: projectDir,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 100,
      allowedTools: config.allowedTools,
      mcpServers: {
        orchestrator: mcpServer,
      },
    },
  })) {
    // Log every message for conversation persistence
    conversationLog.push(JSON.stringify(message));

    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if ("text" in block && typeof block.text === "string") {
          finalResult = block.text;
        }
        if ("name" in block && typeof block.name === "string") {
          await redis.publish(
            "events:orchestrator",
            JSON.stringify({
              type: "tool_used",
              agent_id: AGENT_ID,
              task_id: task.id,
              project_id: task.project_id,
              tool: block.name,
              timestamp: new Date().toISOString(),
            })
          );
        }
      }
    }

    if (message.type === "result") {
      if (message.subtype === "success") {
        finalResult = message.result;
      } else {
        console.warn(
          `[${AGENT_ID}] Query ended with subtype: ${message.subtype}`
        );
      }

      const costUsd = message.total_cost_usd || 0;
      const numTurns = message.num_turns || 0;
      const durationMs = message.duration_ms || 0;
      const usage = message.usage || { input_tokens: 0, output_tokens: 0 };

      console.log(
        `[${AGENT_ID}] Query complete. Cost: $${costUsd.toFixed(4)}, Turns: ${numTurns}`
      );

      // Report cost to orchestrator
      await redis.publish(
        "events:orchestrator",
        JSON.stringify({
          type: "cost_reported",
          agent_id: AGENT_ID,
          task_id: task.id,
          project_id: task.project_id,
          cost_usd: costUsd,
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          duration_ms: durationMs,
          num_turns: numTurns,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }

  // Persist conversation log
  try {
    const convDir = join(projectDir, "conversations");
    await mkdir(convDir, { recursive: true });
    const logPath = join(convDir, `${config.role}-${task.id}.jsonl`);
    await writeFile(logPath, conversationLog.join("\n") + "\n", "utf-8");
    console.log(`[${AGENT_ID}] Conversation saved to ${logPath}`);
  } catch (err) {
    console.warn(`[${AGENT_ID}] Failed to save conversation log:`, err);
  }

  // Publish task_completed event
  await redis.publish(
    "events:orchestrator",
    JSON.stringify({
      type: "task_completed",
      agent_id: AGENT_ID,
      task_id: task.id,
      project_id: task.project_id,
      result_summary: finalResult.substring(0, 500),
      timestamp: new Date().toISOString(),
    })
  );

  console.log(`[${AGENT_ID}] Task ${task.id} completed.`);
}

function buildSystemPrompt(config: AgentConfig, task: TaskAssignment): string {
  return `${config.systemPromptBase}

PROJECT: ${task.project_id}
PHASE: ${task.phase}
DATA_DIR: ${DATA_DIR}

Your working directory is set to the project directory. You can read/write files relative to it.

Available project directories:
- brief/ — project brief and analysis
- requirements/ — PRD, epics, stories
- architecture/ — architecture doc, ADRs, diagrams
- implementation/ — source code and tests
- qa/ — test plans and results
- handoffs/ — handoff documents between agents
- handoffs/blocks/ — blocker JSON files for human input
- contracts/ — shared source-of-truth documents (data model, API contracts, project scope)
- contracts/proposals/ — proposed changes to contracts (require human approval)
- context/ — original input context files (read-only, never modify)

Templates: ${DATA_DIR}/templates/
Knowledge base: ${DATA_DIR}/knowledge/

=== CONTRACT SYSTEM ===
Contract files in contracts/ are the shared source of truth for all agents.
Key contracts:
- contracts/project-scope.md — what's in scope, what's not, core constraints
- contracts/data-model.md — canonical entity definitions, relationships, field types
- contracts/api-contracts.md — API endpoints, request/response schemas

CONTRACT RULES:
1. Read ALL existing contracts before starting your work
2. Your output MUST NOT contradict any active contract
3. If you need to change a contract, write a proposal to contracts/proposals/ AND raise a blocker via create_blocker
4. Never silently override a contract — escalate disagreements

=== ANTI-FABRICATION RULES ===
Read the full policy at ${DATA_DIR}/knowledge/anti-fabrication-policy.md

1. NEVER present unverified information as fact
2. NEVER fabricate statistics, quotes, benchmarks, or citations
3. If you don't know something, say "TBD" or raise a blocker
4. Hypotheses are welcome IF accompanied by stated assumptions and a validation plan
5. Any fabrication in a handoff that misleads a downstream agent is critical severity

=== OUTPUT FORMAT RULES ===
You produce for TWO audiences:
- Human operators: concise, scannable, max signal. Use the base filename (e.g., brief.md, prd.md, architecture.md, qa-report.md)
- Other agents: comprehensive, structured, all detail needed. Use the -detailed suffix (e.g., brief-detailed.md, prd-detailed.md)

Additional rules:
- Handoff documents: MAX 30 lines. Use the template at ${DATA_DIR}/templates/handoff-template.md
- No copy-paste from upstream documents — reference file paths instead
- No ceremony text ("In conclusion...", "As a seasoned...", "It's worth noting...")
- No redundant restatement of what upstream agents already wrote
- Every section must add NEW information or analysis

=== BLOCKER USAGE (80-20 RULE) ===
Read the full guidelines at ${DATA_DIR}/knowledge/blocker-guidelines.md

80% of work can proceed with reasonable defaults. The 20% that is ambiguous, risky, or irreversible MUST be escalated via create_blocker. Failure to raise blockers for genuine ambiguity is as problematic as raising false blockers.

=== COMPLETION CHECKLIST ===
Before calling notify_orchestrator with "handoff_ready":
1. Verify your output does not contradict any contract in contracts/
2. Verify you have not fabricated any data — all claims are sourced or marked TBD
3. Verify your handoff document is ≤30 lines and follows the template
4. Call report_summary with files produced and key decisions
5. Then call notify_orchestrator with event_type "handoff_ready"`;
}

main().catch((error) => {
  console.error("Agent startup failed:", error);
  process.exit(1);
});
