// === Project & Workflow ===

export type ProjectStatus = "active" | "paused" | "completed" | "failed";

export type WorkflowPhase =
  | "analysis"
  | "requirements"
  | "architecture"
  | "development"
  | "qa"
  | "complete";

export type AgentRole =
  | "analyst"
  | "product-manager"
  | "architect"
  | "developer"
  | "qa";

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  current_phase: WorkflowPhase;
  created_at: string;
  updated_at: string;
}

// === Task Assignments ===

export interface TaskAssignment {
  id: string;
  project_id: string;
  prompt: string;
  phase: WorkflowPhase | "directed";
}

// === Agent Events ===

export type AgentEventType =
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "tool_used"
  | "blocker_created"
  | "handoff_ready"
  | "review_needed"
  | "cost_reported";

export interface AgentEvent {
  type: AgentEventType;
  agent_id: string;
  project_id?: string;
  task_id?: string;
  message?: string;
  next_agent?: AgentRole;
  block_id?: string;
  error?: string;
  tool?: string;
  result_summary?: string;
  cost_usd?: number;
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
  num_turns?: number;
  timestamp: string;
}

// === Blockers ===

export interface BlockerOption {
  id: string;
  label: string;
  impact: string;
}

export interface Blocker {
  id: string;
  project_id: string;
  agent_id: string;
  agent_role?: AgentRole;
  question: string;
  context: string;
  priority: "low" | "medium" | "high" | "critical";
  category?: string;
  options?: BlockerOption[];
  status: "pending" | "resolved";
  resolution?: string;
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
}

// === Workflow Constants ===

export const WORKFLOW_SEQUENCE: readonly AgentRole[] = [
  "analyst",
  "product-manager",
  "architect",
  "developer",
  "qa",
] as const;

export const PHASE_FOR_ROLE: Record<AgentRole, WorkflowPhase> = {
  analyst: "analysis",
  "product-manager": "requirements",
  architect: "architecture",
  developer: "development",
  qa: "qa",
};

export const AGENT_ID_MAP: Record<AgentRole, string> = {
  analyst: "analyst-01",
  "product-manager": "pm-01",
  architect: "architect-01",
  developer: "dev-01",
  qa: "qa-01",
};

export const ROLE_FOR_AGENT_ID: Record<string, AgentRole> = Object.fromEntries(
  Object.entries(AGENT_ID_MAP).map(([role, id]) => [id, role as AgentRole])
) as Record<string, AgentRole>;
