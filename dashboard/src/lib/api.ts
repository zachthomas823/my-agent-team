const API_BASE = "/api";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const isFormData = init?.body instanceof FormData;
  const { headers: extraHeaders, ...rest } = init ?? {};
  const defaultHeaders: Record<string, string> = isFormData ? {} : { "Content-Type": "application/json" };

  console.debug(`[api] ${method} ${path}`);

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...defaultHeaders, ...extraHeaders },
    ...rest,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const message = body.error || `HTTP ${res.status}`;
    console.error(`[api] ${method} ${path} → ${res.status}`, message);
    throw new Error(message);
  }

  const data = await res.json();
  console.debug(`[api] ${method} ${path} → ${res.status}`, data);
  return data;
}

export const api = {
  listProjects: () => fetchJSON<Project[]>("/projects"),

  getProject: (id: string) => fetchJSON<ProjectDetail>(`/projects/${id}`),

  createProject: (name: string, description: string, contextFiles: File[] = []) => {
    const form = new FormData();
    form.append("name", name);
    form.append("description", description);
    for (const file of contextFiles) {
      form.append("context_files", file);
    }
    return fetchJSON<{ id: string; status: string; context_files: number }>("/projects", {
      method: "POST",
      headers: {}, // let browser set Content-Type with boundary
      body: form,
    });
  },

  deleteProject: (id: string) =>
    fetchJSON<{ status: string }>(`/projects/${id}`, { method: "DELETE" }),

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

  /** Returns the URL for downloading a single artifact file (use with <a href> or window.open). */
  getArtifactDownloadUrl: (projectId: string, artifactPath: string) =>
    `${API_BASE}/projects/${projectId}/artifacts-download/${artifactPath}`,

  /** Returns the URL for downloading all project artifacts as a ZIP. */
  getArtifactsZipUrl: (projectId: string) =>
    `${API_BASE}/projects/${projectId}/artifacts-zip`,
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
  last_event: {
    type: string;
    created_at: string;
    tool: string | null;
    message: string | null;
    result_summary: string | null;
    error: string | null;
    next_agent: string | null;
    project_id: string | null;
  } | null;
}

export interface FileTreeNode {
  name: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}
