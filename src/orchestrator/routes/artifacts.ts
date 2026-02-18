import type { Express } from "express";
import { listArtifacts, readArtifact, getArtifactInfo } from "../../shared/filesystem.js";
import type { AppDeps } from "../types.js";

export function registerArtifactRoutes(app: Express, deps: AppDeps): void {
  const { dataDir } = deps;

  // List artifact tree for a project
  app.get("/api/projects/:id/artifacts", async (req, res) => {
    try {
      const projectDir = `${dataDir}/projects/${req.params.id}`;
      const files = await listArtifacts(projectDir);

      // Build a tree structure
      const tree = buildFileTree(files);
      res.json({ files, tree });
    } catch (error) {
      console.error("Error listing artifacts:", error);
      res.status(500).json({ error: "Failed to list artifacts" });
    }
  });

  // Read a specific artifact (catch-all for nested paths)
  app.get("/api/projects/:id/artifacts/:artifactPath(*)", async (req, res) => {
    try {
      const artifactPath = req.params["artifactPath(*)"];
      if (!artifactPath) {
        res.status(400).json({ error: "Artifact path required" });
        return;
      }

      const projectDir = `${dataDir}/projects/${req.params.id}`;
      const content = await readArtifact(projectDir, artifactPath);
      const info = await getArtifactInfo(projectDir, artifactPath);

      res.json({ path: artifactPath, content, ...info });
    } catch {
      res.status(404).json({ error: "Artifact not found" });
    }
  });
}

interface FileTreeNode {
  name: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

function buildFileTree(files: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const filePath of files) {
    const parts = filePath.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      let existing = current.find((n) => n.name === part);
      if (!existing) {
        existing = {
          name: part,
          type: isFile ? "file" : "directory",
          ...(isFile ? {} : { children: [] }),
        };
        current.push(existing);
      }

      if (!isFile && existing.children) {
        current = existing.children;
      }
    }
  }

  return root;
}
