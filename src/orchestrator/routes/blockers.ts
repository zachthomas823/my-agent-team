import type { Express } from "express";
import type { AppDeps, BlockerRow, ResolveBlockerBody } from "../types.js";

export function registerBlockerRoutes(app: Express, deps: AppDeps): void {
  const { db, redis, wss } = deps;

  // List pending blockers
  app.get("/api/blockers", (req, res) => {
    const projectId = req.query.project_id as string | undefined;
    let blockers: BlockerRow[];

    if (projectId) {
      blockers = db
        .prepare(
          "SELECT * FROM blockers WHERE status = 'pending' AND project_id = ? ORDER BY priority DESC, created_at ASC"
        )
        .all(projectId) as BlockerRow[];
    } else {
      blockers = db
        .prepare(
          "SELECT * FROM blockers WHERE status = 'pending' ORDER BY priority DESC, created_at ASC"
        )
        .all() as BlockerRow[];
    }

    // Parse options JSON for each blocker
    const parsed = blockers.map((b) => ({
      ...b,
      options: b.options ? JSON.parse(b.options) : null,
    }));

    res.json(parsed);
  });

  // Get a single blocker
  app.get("/api/blockers/:id", (req, res) => {
    const blocker = db
      .prepare("SELECT * FROM blockers WHERE id = ?")
      .get(req.params.id) as BlockerRow | undefined;

    if (!blocker) {
      res.status(404).json({ error: "Blocker not found" });
      return;
    }

    res.json({
      ...blocker,
      options: blocker.options ? JSON.parse(blocker.options) : null,
    });
  });

  // Resolve a blocker
  app.post("/api/blockers/:id/resolve", async (req, res) => {
    try {
      const { resolution, selected_option } = req.body as ResolveBlockerBody;
      if (!resolution) {
        res.status(400).json({ error: "resolution is required" });
        return;
      }

      const blocker = db
        .prepare("SELECT * FROM blockers WHERE id = ?")
        .get(req.params.id) as BlockerRow | undefined;

      if (!blocker) {
        res.status(404).json({ error: "Blocker not found" });
        return;
      }

      if (blocker.status === "resolved") {
        res.status(409).json({ error: "Blocker already resolved" });
        return;
      }

      db.prepare(
        "UPDATE blockers SET status = 'resolved', resolution = ?, resolved_at = datetime('now') WHERE id = ?"
      ).run(JSON.stringify({ resolution, selected_option }), req.params.id);

      // Notify the blocked agent
      await redis.publish(
        `agent:${blocker.agent_id}:messages`,
        JSON.stringify({
          type: "blocker_resolved",
          block_id: req.params.id,
          resolution,
          selected_option,
          from: "human",
        })
      );

      // Re-dispatch agent with resolution context so it can resume work
      const taskPayload = {
        id: `task-${Date.now()}`,
        project_id: blocker.project_id,
        prompt: `Your blocker "${blocker.question}" has been resolved.\n\nResolution: ${resolution}${selected_option ? `\nSelected option: ${selected_option}` : ""}\n\nResume your work. Read your previous artifacts and handoff to understand where you left off.`,
        phase: "directed" as const,
      };
      await redis.publish(
        `tasks:${blocker.agent_id}`,
        JSON.stringify(taskPayload)
      );

      // Broadcast to dashboard clients
      broadcastToWss(wss, {
        type: "blocker_resolved",
        blocker_id: req.params.id,
      });

      res.json({ status: "resolved" });
    } catch (error) {
      console.error("Error resolving blocker:", error);
      res.status(500).json({ error: "Failed to resolve blocker" });
    }
  });
}

function broadcastToWss(wss: import("ws").WebSocketServer, data: unknown) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(message);
  });
}
