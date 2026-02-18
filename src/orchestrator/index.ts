import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";
import Database from "better-sqlite3";
import { resolve } from "path";
import { initializeDataDir } from "../shared/filesystem.js";
import { AGENT_ID_MAP, ROLE_FOR_AGENT_ID } from "../shared/types.js";
import type { AgentEvent, AgentRole } from "../shared/types.js";
import { advanceWorkflow } from "./workflow.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerBlockerRoutes } from "./routes/blockers.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerArtifactRoutes } from "./routes/artifacts.js";
import type { AppDeps } from "./types.js";

const DATA_DIR = resolve(process.env.DATA_DIR || "./data");
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const PORT = Number(process.env.PORT) || 3000;

async function main() {
  // Initialize data directory structure
  await initializeDataDir(DATA_DIR);

  // SQLite database
  const db = new Database(`${DATA_DIR}/db/orchestrator.sqlite`);
  db.pragma("journal_mode = WAL");
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
    CREATE TABLE IF NOT EXISTS cost_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT,
      agent_id TEXT,
      task_id TEXT,
      cost_usd REAL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      duration_ms INTEGER,
      num_turns INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id);
    CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id);
    CREATE INDEX IF NOT EXISTS idx_blockers_status ON blockers(status);
    CREATE INDEX IF NOT EXISTS idx_cost_project ON cost_log(project_id);
  `);

  // Redis
  const redis = createClient({ url: REDIS_URL });
  const subscriber = redis.duplicate();
  await redis.connect();
  await subscriber.connect();
  console.log("Connected to Redis");

  // Express + HTTP + WebSocket
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  app.use(express.json());

  // CORS for local development
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (_req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // Register route modules
  const deps: AppDeps = { db, redis: redis as any, wss, dataDir: DATA_DIR };
  registerProjectRoutes(app, deps);
  registerBlockerRoutes(app, deps);
  registerAgentRoutes(app, deps);
  registerArtifactRoutes(app, deps);

  // WebSocket connections
  wss.on("connection", (ws) => {
    console.log("Dashboard client connected");
    ws.on("close", () => console.log("Dashboard client disconnected"));
  });

  function broadcastToClients(data: unknown) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  }

  // Track retry counts for failed tasks
  const taskRetryCount = new Map<string, number>();
  const MAX_RETRIES = 2;

  // Cost tracking API
  app.get("/api/projects/:id/costs", (req, res) => {
    const costs = db
      .prepare(
        "SELECT * FROM cost_log WHERE project_id = ? ORDER BY created_at DESC"
      )
      .all(req.params.id);
    const total = db
      .prepare(
        "SELECT COALESCE(SUM(cost_usd), 0) as total_cost, COALESCE(SUM(input_tokens), 0) as total_input, COALESCE(SUM(output_tokens), 0) as total_output FROM cost_log WHERE project_id = ?"
      )
      .get(req.params.id) as { total_cost: number; total_input: number; total_output: number };
    res.json({ entries: costs, summary: total });
  });

  // Agent event handler
  async function handleAgentEvent(event: AgentEvent) {
    // Log to database
    db.prepare(
      "INSERT INTO events (project_id, agent_id, event_type, data) VALUES (?, ?, ?, ?)"
    ).run(
      event.project_id || null,
      event.agent_id,
      event.type,
      JSON.stringify(event)
    );

    // Broadcast to dashboard
    broadcastToClients(event);

    switch (event.type) {
      case "task_completed":
      case "handoff_ready": {
        // Clear retry count on success
        if (event.project_id) {
          taskRetryCount.delete(`${event.agent_id}:${event.project_id}`);
        }
        // Route to next agent if specified
        if (event.next_agent && event.project_id) {
          const nextAgentId = AGENT_ID_MAP[event.next_agent as AgentRole];
          if (nextAgentId) {
            console.log(
              `Routing from ${event.agent_id} to ${nextAgentId} for project ${event.project_id}`
            );

            await redis.publish(
              `tasks:${nextAgentId}`,
              JSON.stringify({
                id: `task-${Date.now()}`,
                project_id: event.project_id,
                prompt:
                  "Pick up work on this project. Read the handoff document and upstream artifacts, then begin your work. Continue autonomously until you complete your deliverables or are blocked.",
                phase: event.next_agent,
              })
            );

            advanceWorkflow(
              event.project_id,
              event.next_agent as AgentRole,
              db
            );
          }
        }

        // Mark project complete if QA finished with no next agent
        if (
          !event.next_agent &&
          event.project_id &&
          ROLE_FOR_AGENT_ID[event.agent_id] === "qa"
        ) {
          db.prepare(
            "UPDATE projects SET status = 'completed', current_phase = 'complete', updated_at = datetime('now') WHERE id = ?"
          ).run(event.project_id);
        }
        break;
      }

      case "cost_reported": {
        if (event.project_id && event.task_id) {
          db.prepare(
            "INSERT INTO cost_log (project_id, agent_id, task_id, cost_usd, input_tokens, output_tokens, duration_ms, num_turns) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          ).run(
            event.project_id,
            event.agent_id,
            event.task_id,
            event.cost_usd || 0,
            event.input_tokens || 0,
            event.output_tokens || 0,
            event.duration_ms || 0,
            event.num_turns || 0
          );
        }
        break;
      }

      case "blocker_created": {
        if (event.block_id && event.project_id) {
          db.prepare(
            "INSERT OR REPLACE INTO blockers (id, project_id, agent_id, question, priority, status) VALUES (?, ?, ?, ?, ?, 'pending')"
          ).run(
            event.block_id,
            event.project_id,
            event.agent_id,
            event.message || "No question provided",
            "medium"
          );
        }
        break;
      }

      case "task_failed": {
        console.error(
          `Agent ${event.agent_id} failed on project ${event.project_id}: ${event.error}`
        );

        // Retry logic
        if (event.task_id && event.project_id) {
          const retryKey = `${event.agent_id}:${event.project_id}`;
          const retries = taskRetryCount.get(retryKey) || 0;
          if (retries < MAX_RETRIES) {
            taskRetryCount.set(retryKey, retries + 1);
            console.log(
              `Retrying ${event.agent_id} for ${event.project_id} (attempt ${retries + 2})`
            );
            const role = ROLE_FOR_AGENT_ID[event.agent_id];
            await redis.publish(
              `tasks:${event.agent_id}`,
              JSON.stringify({
                id: `task-${Date.now()}`,
                project_id: event.project_id,
                prompt:
                  "A previous attempt on this task failed. Read the handoff documents and upstream artifacts, then begin your work. Continue autonomously until you complete your deliverables or are blocked.",
                phase: role || "directed",
              })
            );
          } else {
            console.error(
              `Max retries exceeded for ${event.agent_id} on ${event.project_id}`
            );
          }
        }
        break;
      }

    }
  }

  // Subscribe to orchestrator events from all agents
  await subscriber.subscribe("events:orchestrator", async (message) => {
    try {
      const event = JSON.parse(message) as AgentEvent;
      await handleAgentEvent(event);
    } catch (error) {
      console.error("Error handling agent event:", error);
    }
  });

  // Start server
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Orchestrator API running on :${PORT}`);
    console.log(`WebSocket available at ws://0.0.0.0:${PORT}/ws`);
    console.log(`Data directory: ${DATA_DIR}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("Shutting down...");
    server.close();
    redis.quit();
    subscriber.quit();
    db.close();
  });
}

main().catch((error) => {
  console.error("Failed to start orchestrator:", error);
  process.exit(1);
});
