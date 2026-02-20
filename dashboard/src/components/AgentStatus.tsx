import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AgentStatus } from "../lib/api";
import { useSendAgentMessage } from "../hooks/useProject";

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  idle:    { bg: "bg-gray-700",      text: "text-gray-300",  label: "Idle" },
  working: { bg: "bg-green-900/50",  text: "text-green-400", label: "Working" },
  blocked: { bg: "bg-red-900/50",    text: "text-red-400",   label: "Blocked" },
};

const ROLE_LABELS: Record<string, string> = {
  analyst:          "Analyst",
  "product-manager": "PM",
  architect:         "Architect",
  developer:         "Developer",
  qa:                "QA",
};

const DEFAULT_PROMPTS: Record<string, string> = {
  analyst:
    "Review the project context and produce a comprehensive project brief and market analysis. Write your outputs to brief/ and create a handoff document at handoffs/analyst-to-pm.md when done.",
  "product-manager":
    "Read the analyst handoff and brief, then produce the PRD, epics, and user stories. Write outputs to requirements/ and create a handoff at handoffs/pm-to-architect.md when done.",
  architect:
    "Read the PM handoff and requirements, then produce the architecture document and ADRs. Write outputs to architecture/ and create a handoff at handoffs/architect-to-developer.md when done.",
  developer:
    "Read the architect handoff and architecture docs, then implement the solution. Write code to implementation/ and create a handoff at handoffs/developer-to-qa.md when done.",
  qa: "Read the developer handoff and implementation, then produce a test plan and results. Write outputs to qa/ and notify the orchestrator when complete.",
};

function lastActionSummary(ev: AgentStatus["last_event"]): string {
  if (!ev) return "No activity yet";

  switch (ev.type) {
    case "task_started":
      return "Started task";
    case "task_completed":
      if (ev.result_summary) return truncate(ev.result_summary, 120);
      return "Completed task";
    case "task_failed":
      if (ev.error) return `Failed: ${truncate(ev.error, 100)}`;
      return "Task failed";
    case "tool_used":
      if (ev.tool) return `Used ${ev.tool}`;
      return "Used tool";
    case "handoff_ready":
      if (ev.next_agent) return `Handed off to ${ROLE_LABELS[ev.next_agent] ?? ev.next_agent}`;
      if (ev.message) return truncate(ev.message, 100);
      return "Handoff ready";
    case "blocker_created":
      if (ev.message) return `Blocked: ${truncate(ev.message, 100)}`;
      return "Waiting for input";
    case "review_needed":
      return "Needs review";
    default:
      if (ev.message) return truncate(ev.message, 100);
      return ev.type.replace(/_/g, " ");
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function parseTimestamp(ts: string): Date {
  // SQLite stores timestamps as "YYYY-MM-DD HH:MM:SS" without timezone.
  // Normalise to ISO 8601 with UTC marker so all browsers parse it consistently.
  const normalised = ts.includes("T") ? ts : ts.replace(" ", "T") + "Z";
  return new Date(normalised);
}

function relativeTime(ts: string): string {
  const diff = Math.floor((Date.now() - parseTimestamp(ts).getTime()) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function AgentStatusPanel({ projectId }: { projectId?: string }) {
  const { data: agents } = useQuery({
    queryKey: ["agent-status"],
    queryFn: api.getAgentStatuses,
    refetchInterval: 5000,
  });

  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const send = useSendAgentMessage();

  function toggleAgent(agentId: string, role: string) {
    if (openAgent === agentId) {
      setOpenAgent(null);
    } else {
      setOpenAgent(agentId);
      if (!prompts[agentId]) {
        setPrompts((p) => ({ ...p, [agentId]: DEFAULT_PROMPTS[role] ?? "" }));
      }
    }
  }

  function handleSend(agentId: string) {
    const message = prompts[agentId]?.trim();
    if (!message || !projectId) return;
    send.mutate(
      { agentId, message, projectId },
      {
        onSuccess: () => {
          setOpenAgent(null);
          console.info(`[dashboard] triggered ${agentId} on ${projectId}`);
        },
        onError: (err) => {
          console.error(`[dashboard] failed to trigger ${agentId}:`, err);
        },
      }
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">Agents</h3>
      <div className="space-y-3">
        {agents?.map((agent) => {
          const badge = STATUS_BADGES[agent.status] || STATUS_BADGES.idle;
          const isOpen = openAgent === agent.agent_id;
          const isSending = send.isPending && openAgent === agent.agent_id;
          const summary = lastActionSummary(agent.last_event);

          return (
            <div key={agent.agent_id}>
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-200">
                  {ROLE_LABELS[agent.role] || agent.role}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}
                  >
                    {badge.label}
                  </span>
                  {projectId && (
                    <button
                      onClick={() => toggleAgent(agent.agent_id, agent.role)}
                      title="Send prompt to agent"
                      className="text-gray-500 hover:text-gray-200 text-xs px-1.5 py-0.5 rounded border border-gray-700 hover:border-gray-500 transition-colors"
                    >
                      {isOpen ? "✕" : "▶"}
                    </button>
                  )}
                </div>
              </div>

              {/* Last action detail */}
              <div className="mt-0.5 flex items-start justify-between gap-2">
                <p className="text-xs text-gray-500 leading-snug">{summary}</p>
                {agent.last_event && (
                  <span className="text-xs text-gray-700 shrink-0">
                    {relativeTime(agent.last_event.created_at)}
                  </span>
                )}
              </div>

              {/* Trigger form */}
              {isOpen && projectId && (
                <div className="mt-2 space-y-1.5">
                  <textarea
                    rows={3}
                    value={prompts[agent.agent_id] ?? ""}
                    onChange={(e) =>
                      setPrompts((p) => ({ ...p, [agent.agent_id]: e.target.value }))
                    }
                    placeholder="Prompt to send to this agent..."
                    className="w-full text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-gray-500"
                  />
                  <button
                    onClick={() => handleSend(agent.agent_id)}
                    disabled={isSending || !prompts[agent.agent_id]?.trim()}
                    className="w-full text-xs bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded px-2 py-1 transition-colors"
                  >
                    {isSending ? "Sending…" : `Trigger ${ROLE_LABELS[agent.role] || agent.role}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
