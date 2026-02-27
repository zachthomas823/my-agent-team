import path from "path";
import fs from "fs";
import type { Express } from "express";
import archiver from "archiver";
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

  // Download all project artifacts as a ZIP
  app.get("/api/projects/:id/artifacts-zip", async (req, res) => {
    try {
      const projectDir = `${dataDir}/projects/${req.params.id}`;

      if (!fs.existsSync(projectDir)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const projectId = req.params.id;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="project-${projectId}-artifacts.zip"`
      );

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", (err) => {
        console.error("Archiver error:", err);
        // Headers already sent; can't send error response
      });

      archive.pipe(res);
      archive.directory(projectDir, false);
      await archive.finalize();
    } catch (error) {
      console.error("Error creating zip:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create zip" });
      }
    }
  });

  // Download a single artifact as raw file
  app.get("/api/projects/:id/artifacts-download/:artifactPath(*)", async (req, res) => {
    try {
      const artifactPath = (req.params as Record<string, string>).artifactPath;
      if (!artifactPath) {
        res.status(400).json({ error: "Artifact path required" });
        return;
      }

      const projectDir = `${dataDir}/projects/${req.params.id}`;
      const fullPath = path.join(projectDir, artifactPath);

      // Prevent path traversal: resolved path must be inside projectDir
      const resolvedProject = path.resolve(projectDir);
      const resolvedFile = path.resolve(fullPath);
      if (!resolvedFile.startsWith(resolvedProject + path.sep)) {
        res.status(400).json({ error: "Invalid path" });
        return;
      }

      if (!fs.existsSync(resolvedFile)) {
        res.status(404).json({ error: "Artifact not found" });
        return;
      }

      const filename = path.basename(resolvedFile);
      res.download(resolvedFile, filename);
    } catch (error) {
      console.error("Error downloading artifact:", error);
      res.status(500).json({ error: "Failed to download artifact" });
    }
  });

  // Read a specific artifact (catch-all for nested paths)
  app.get("/api/projects/:id/artifacts/:artifactPath(*)", async (req, res) => {
    try {
      // Express sets the key as "artifactPath" at runtime despite the (*) wildcard pattern;
      // the TS type incorrectly uses "artifactPath(*)" as the key name.
      const artifactPath = (req.params as Record<string, string>).artifactPath;
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
