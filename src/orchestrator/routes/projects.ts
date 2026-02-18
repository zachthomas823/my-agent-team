import type { Express } from "express";
import { initializeProjectDir } from "../../shared/filesystem.js";
import { getWorkflowState } from "../workflow.js";
import type { AppDeps, ProjectRow, EventRow, CreateProjectBody } from "../types.js";

export function registerProjectRoutes(app: Express, deps: AppDeps): void {
  const { db, redis, dataDir } = deps;

  // Create a new project
  app.post("/api/projects", async (req, res) => {
    try {
      const { name, description } = req.body as CreateProjectBody;
      if (!name || !description) {
        res.status(400).json({ error: "name and description are required" });
        return;
      }

      const projectId = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const existing = db
        .prepare("SELECT id FROM projects WHERE id = ?")
        .get(projectId);
      if (existing) {
        res.status(409).json({ error: "Project already exists" });
        return;
      }

      const projectDir = `${dataDir}/projects/${projectId}`;
      await initializeProjectDir(projectDir);

      db.prepare(
        "INSERT INTO projects (id, name) VALUES (?, ?)"
      ).run(projectId, name);

      // Assign first task to analyst
      await redis.publish(
        "tasks:analyst-01",
        JSON.stringify({
          id: `task-${Date.now()}`,
          project_id: projectId,
          prompt: `Analyze this project idea and create a comprehensive project brief:\n\n${description}`,
          phase: "analysis",
        })
      );

      res.json({ id: projectId, status: "started" });
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  // List all projects
  app.get("/api/projects", (_req, res) => {
    const projects = db
      .prepare("SELECT * FROM projects ORDER BY updated_at DESC")
      .all() as ProjectRow[];
    res.json(projects);
  });

  // Get project details with workflow state
  app.get("/api/projects/:id", (req, res) => {
    const project = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(req.params.id) as ProjectRow | undefined;

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const workflow = getWorkflowState(req.params.id, db);
    res.json({ ...project, workflow });
  });

  // Get event stream for a project
  app.get("/api/projects/:id/events", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const events = db
      .prepare(
        "SELECT * FROM events WHERE project_id = ? ORDER BY created_at DESC LIMIT ?"
      )
      .all(req.params.id, limit) as EventRow[];
    res.json(events);
  });
}
