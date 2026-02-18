const API_BASE = "/api";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  listProjects: () => fetchJSON<Project[]>("/projects"),

  getProject: (id: string) => fetchJSON<ProjectDetail>(`/projects/${id}`),

  createProject: (name: string, description: string) =>
    fetchJSON<{ id: string; status: string }>("/projects", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    }),

  getProjectEvents: (id: string) =>
    fetchJSON<ProjectEvent[]>(`/projects/${id}/events`),

  listBlockers: (projectId?: string) =>
    fetchJSON<Blocker[]>(
      `/blockers${projectId ? `?project_id=${projectId}` : ""}`
    ),

  resolveBlocker: (id: string, resolution: string, selectedOption?: string) =>
    fetchJSON<{ status: string }>(`/blockers/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution, selected_option: selectedOption }),
    }),

  getAgentStatuses: () => fetchJSON<AgentStatus[]>("/agents/status"),

  sendAgentMessage: (agentId: string, message: string, projectId: string) =>
    fetchJSON<{ status: string }>(`/agents/${agentId}/message`, {
      method: "POST",
      body: JSON.stringify({ message, project_id: projectId }),
    }),

  listArtifacts: (projectId: string) =>
    fetchJSON<{ files: string[]; tree: FileTreeNode[] }>(
      `/projects/${projectId}/artifacts`
    ),

  getArtifact: (projectId: string, path: string) =>
    fetchJSON<{
      path: string;
      content: string;
      size?: number;
      modified?: string;
    }>(`/projects/${projectId}/artifacts/${path}`),
};

// Types
export interface Project {
  id: string;
  name: string;
  status: string;
  current_phase: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends Project {
  workflow: {
    current_phase: string;
    phases: {
      name: string;
      status: "completed" | "active" | "pending";
      agent_id: string;
    }[];
    pending_blockers: number;
    total_events: number;
  };
}

export interface ProjectEvent {
  id: number;
  project_id: string;
  agent_id: string;
  event_type: string;
  data: string;
  created_at: string;
}

export interface Blocker {
  id: string;
  project_id: string;
  agent_id: string;
  question: string;
  context: string;
  priority: string;
  options: { id: string; label: string; impact: string }[] | null;
  status: string;
  resolution: string | null;
  created_at: string;
}

export interface AgentStatus {
  agent_id: string;
  role: string;
  status: "idle" | "working" | "blocked";
  last_event: { type: string; created_at: string } | null;
}

export interface FileTreeNode {
  name: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}
