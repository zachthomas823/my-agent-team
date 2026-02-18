import type Database from "better-sqlite3";
import {
  WORKFLOW_SEQUENCE,
  PHASE_FOR_ROLE,
  AGENT_ID_MAP,
  type AgentRole,
  type WorkflowPhase,
} from "../shared/types.js";
import type { WorkflowState, PhaseState, ProjectRow } from "./types.js";

/**
 * Returns the next agent role in the workflow sequence after the given role.
 */
export function getNextAgent(currentRole: AgentRole): AgentRole | null {
  const idx = WORKFLOW_SEQUENCE.indexOf(currentRole);
  if (idx === -1 || idx === WORKFLOW_SEQUENCE.length - 1) return null;
  return WORKFLOW_SEQUENCE[idx + 1];
}

/**
 * Returns the workflow phase for a given agent role.
 */
export function getPhaseForRole(role: AgentRole): WorkflowPhase {
  return PHASE_FOR_ROLE[role];
}

/**
 * Builds a workflow state summary for a project.
 */
export function getWorkflowState(
  projectId: string,
  db: Database.Database
): WorkflowState {
  const project = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(projectId) as ProjectRow | undefined;

  const currentPhase = project?.current_phase ?? "analysis";

  const completedEvents = db
    .prepare(
      "SELECT DISTINCT data FROM events WHERE project_id = ? AND event_type IN ('task_completed', 'handoff_ready')"
    )
    .all(projectId) as { data: string }[];

  const completedAgents = new Set<string>();
  for (const row of completedEvents) {
    try {
      const data = JSON.parse(row.data);
      if (data.agent_id) completedAgents.add(data.agent_id);
    } catch {
      // skip malformed data
    }
  }

  const phases: PhaseState[] = WORKFLOW_SEQUENCE.map((role) => {
    const agentId = AGENT_ID_MAP[role];
    const phase = PHASE_FOR_ROLE[role];
    let status: PhaseState["status"] = "pending";

    if (completedAgents.has(agentId)) {
      status = "completed";
    } else if (phase === currentPhase) {
      status = "active";
    }

    return { name: phase, status, agent_id: agentId };
  });

  const pendingBlockers = (
    db
      .prepare(
        "SELECT COUNT(*) as count FROM blockers WHERE project_id = ? AND status = 'pending'"
      )
      .get(projectId) as { count: number }
  ).count;

  const totalEvents = (
    db
      .prepare(
        "SELECT COUNT(*) as count FROM events WHERE project_id = ?"
      )
      .get(projectId) as { count: number }
  ).count;

  return {
    current_phase: currentPhase,
    phases,
    pending_blockers: pendingBlockers,
    total_events: totalEvents,
  };
}

/**
 * Advances the project to the next workflow phase.
 */
export function advanceWorkflow(
  projectId: string,
  nextRole: AgentRole,
  db: Database.Database
): void {
  const nextPhase = PHASE_FOR_ROLE[nextRole];
  db.prepare(
    "UPDATE projects SET current_phase = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(nextPhase, projectId);
}
