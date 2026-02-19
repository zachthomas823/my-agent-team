import { mkdir, readFile, writeFile, readdir, stat } from "fs/promises";
import { join, dirname } from "path";

const PROJECT_SUBDIRS = [
  "brief",
  "requirements/epics",
  "requirements/stories",
  "architecture/adrs",
  "architecture/diagrams",
  "implementation/src",
  "implementation/tests",
  "qa/test-results",
  "conversations",
  "handoffs/blocks",
  "context",
];

/**
 * Creates the full directory structure for a new project.
 */
export async function initializeProjectDir(projectPath: string): Promise<void> {
  for (const subdir of PROJECT_SUBDIRS) {
    await mkdir(join(projectPath, subdir), { recursive: true });
  }

  // Create project.json metadata file
  const projectJson = {
    id: projectPath.split("/").pop(),
    created_at: new Date().toISOString(),
    status: "active",
    current_phase: "analysis",
  };
  await writeFile(
    join(projectPath, "project.json"),
    JSON.stringify(projectJson, null, 2),
    "utf-8"
  );
}

/**
 * Ensures the top-level data directory structure exists.
 */
export async function initializeDataDir(dataDir: string): Promise<void> {
  const dirs = ["templates", "knowledge", "db", "projects"];
  for (const dir of dirs) {
    await mkdir(join(dataDir, dir), { recursive: true });
  }
}

/**
 * Reads an artifact file from a project directory.
 */
export async function readArtifact(
  projectDir: string,
  relativePath: string
): Promise<string> {
  return readFile(join(projectDir, relativePath), "utf-8");
}

/**
 * Writes an artifact file, creating parent directories as needed.
 */
export async function writeArtifact(
  projectDir: string,
  relativePath: string,
  content: string
): Promise<void> {
  const fullPath = join(projectDir, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

/**
 * Recursively lists all files in a project directory (or subdirectory).
 */
export async function listArtifacts(
  projectDir: string,
  subdir?: string
): Promise<string[]> {
  const basePath = subdir ? join(projectDir, subdir) : projectDir;
  const results: string[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // directory doesn't exist yet
    }
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), relativePath);
      } else {
        results.push(relativePath);
      }
    }
  }

  await walk(basePath, "");
  return results.sort();
}

/**
 * Gets file info (size, mtime) for an artifact.
 */
export async function getArtifactInfo(
  projectDir: string,
  relativePath: string
): Promise<{ size: number; modified: string } | null> {
  try {
    const stats = await stat(join(projectDir, relativePath));
    return {
      size: stats.size,
      modified: stats.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}
