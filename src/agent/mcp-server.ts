import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { RedisClientType } from "redis";

export function createAgentMcpServer(
  agentId: string,
  redis: RedisClientType,
  projectId: string
) {
  return createSdkMcpServer({
    name: "orchestrator",
    version: "1.0.0",
    tools: [
      tool(
        "notify_orchestrator",
        "Notify the orchestrator of a status change. Use when: " +
          "(1) you complete your task, (2) you hit a blocker needing human input, " +
          "(3) you want to hand off to the next agent.",
        {
          event_type: z.enum([
            "task_complete",
            "blocked",
            "handoff_ready",
            "review_needed",
          ]),
          message: z.string().describe("What happened"),
          next_agent: z
            .enum([
              "analyst",
              "product-manager",
              "architect",
              "developer",
              "qa",
            ])
            .optional()
            .describe("Which agent should work next (if handoff)"),
          block_id: z
            .string()
            .optional()
            .describe("ID of the block file created (if blocked)"),
        },
        async (args) => {
          await redis.publish(
            "events:orchestrator",
            JSON.stringify({
              type: args.event_type,
              agent_id: agentId,
              project_id: projectId,
              message: args.message,
              next_agent: args.next_agent,
              block_id: args.block_id,
              timestamp: new Date().toISOString(),
            })
          );
          return {
            content: [{ type: "text" as const, text: "Orchestrator notified successfully" }],
          };
        }
      ),

      tool(
        "create_blocker",
        "Create a blocker that requires human input. The orchestrator will " +
          "surface this in the dashboard. Only use when you genuinely cannot " +
          "proceed without a human decision.",
        {
          question: z.string().describe("What you need answered"),
          context: z.string().describe("Why this matters"),
          priority: z.enum(["low", "medium", "high", "critical"]),
          options: z
            .array(
              z.object({
                id: z.string(),
                label: z.string(),
                impact: z.string(),
              })
            )
            .optional()
            .describe("Possible choices for the human"),
        },
        async (args) => {
          const blockId = `block-${Date.now()}`;
          await redis.publish(
            "events:orchestrator",
            JSON.stringify({
              type: "blocker_created",
              agent_id: agentId,
              project_id: projectId,
              block_id: blockId,
              priority: args.priority,
              question: args.question,
              message: args.question,
              timestamp: new Date().toISOString(),
            })
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Blocker created: ${blockId}. Write the full block JSON to handoffs/blocks/${blockId}.json using the Write tool.`,
              },
            ],
          };
        }
      ),
    ],
  });
}
