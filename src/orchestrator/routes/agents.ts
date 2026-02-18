import type { Express } from "express";
import { AGENT_ID_MAP, ROLE_FOR_AGENT_ID } from "../../shared/types.js";
import type { AppDeps, EventRow, SendMessageBody } from "../types.js";

export function registerAgentRoutes(app: Express, deps: AppDeps): void {
  const { db, redis } = deps;

  // Send a direct message/task to a specific agent
  app.post("/api/agents/:agentId/message", async (req, res) => {
    try {
      const { message, project_id } = req.body as SendMessageBody;
      const agentId = req.params.agentId;

      if (!message || !project_id) {
        res
          .status(400)
          .json({ error: "message and project_id are required" });
        return;
      }

      // Verify agent ID is valid
      if (!ROLE_FOR_AGENT_ID[agentId]) {
        res.status(404).json({ error: `Unknown agent: ${agentId}` });
        return;
      }

      await redis.publish(
        `tasks:${agentId}`,
        JSON.stringify({
          id: `task-${Date.now()}`,
          project_id,
          prompt: message,
          phase: "directed",
        })
      );

      res.json({ status: "sent" });
    } catch (error) {
      console.error("Error sending message to agent:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Get agent statuses (derived from recent events)
  app.get("/api/agents/status", (_req, res) => {
    const statuses = Object.entries(AGENT_ID_MAP).map(([role, agentId]) => {
      // Check for most recent event from this agent
      const lastEvent = db
        .prepare(
          "SELECT * FROM events WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1"
        )
        .get(agentId) as EventRow | undefined;

      // Check for pending blockers from this agent
      const pendingBlocker = db
        .prepare(
          "SELECT COUNT(*) as count FROM blockers WHERE agent_id = ? AND status = 'pending'"
        )
        .get(agentId) as { count: number };

      let status = "idle";
      if (pendingBlocker.count > 0) {
        status = "blocked";
      } else if (lastEvent) {
        const eventData = JSON.parse(lastEvent.data);
        if (
          eventData.type === "task_started" ||
          eventData.type === "tool_used"
        ) {
          status = "working";
        }
      }

      return {
        agent_id: agentId,
        role,
        status,
        last_event: lastEvent
          ? {
              type: lastEvent.event_type,
              created_at: lastEvent.created_at,
            }
          : null,
      };
    });

    res.json(statuses);
  });
}
