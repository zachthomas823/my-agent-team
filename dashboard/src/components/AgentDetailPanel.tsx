import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AgentStatus, type ProjectEvent } from "../lib/api";
import { useSendAgentMessage } from "../hooks/useProject";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  idle:    { bg: "bg-gray-700",      text: "text-gray-300",  label: "Idle"    },
  working: { bg: "bg-green-900/50",  text: "text-green-400", label: "Working" },
  blocked: { bg: "bg-red-900/50",    text: "text-red-400",   label: "Blocked" },
};

const ROLE_LABELS: Record<string, string> = {
  analyst:           "Analyst",
  "product-manager": "Product Manager",
  architect:         "Architect",
  developer:         "Developer",
  qa:                "QA Engineer",
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function parseTimestamp(ts: string): Date {
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

function lastActionSummary(ev: AgentStatus["last_event"]): string {
  if (!ev) return "No activity yet";
  switch (ev.type) {
    case "task_started":   return "Started task";
    case "task_completed": return ev.result_summary ? truncate(ev.result_summary, 120) : "Completed task";
    case "task_failed":    return ev.error ? `Failed: ${truncate(ev.error, 100)}` : "Task failed";
    case "tool_used":      return ev.tool ? `Used ${ev.tool}` : "Used tool";
    case "handoff_ready":  return ev.next_agent ? `Handed off to ${ROLE_LABELS[ev.next_agent] ?? ev.next_agent}` : (ev.message ? truncate(ev.message, 100) : "Handoff ready");
    case "blocker_created":return ev.message ? `Blocked: ${truncate(ev.message, 100)}` : "Waiting for input";
    case "review_needed":  return "Needs review";
    case "agent_plan":     return "Plan reported";
    case "agent_summary":  return "Summary reported";
    default:               return ev.message ? truncate(ev.message, 100) : ev.type.replace(/_/g, " ");
  }
}

// ─── Per-agent data extracted from project events ────────────────────────────

interface AgentRun {
  plan: string[] | null;
  toolEvents: ProjectEvent[];
  summary: {
    summary: string;
    files_produced: string[];
    key_decisions: string[];
  } | null;
  cost: { cost_usd?: number; num_turns?: number } | null;
  taskStartedAt: string | null;
}

function extractAgentRun(events: ProjectEvent[], agentId: string): AgentRun {
  // Find the most recent task_started for this agent
  const agentEvents = events
    .filter((e) => e.agent_id === agentId)
    .sort((a, b) => a.id - b.id);

  // Find the last task_started index
  let runStart = -1;
  for (let i = agentEvents.length - 1; i >= 0; i--) {
    if (agentEvents[i].event_type === "task_started") {
      runStart = i;
      break;
    }
  }

  const runEvents = runStart >= 0 ? agentEvents.slice(runStart) : agentEvents;

  let plan: string[] | null = null;
  let summary: AgentRun["summary"] | null = null;
  let cost: AgentRun["cost"] | null = null;
  let taskStartedAt: string | null = null;
  const toolEvents: ProjectEvent[] = [];

  for (const ev of runEvents) {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(ev.data); } catch { /* ignore */ }

    switch (ev.event_type) {
      case "task_started":
        taskStartedAt = ev.created_at;
        break;
      case "agent_plan":
        if (Array.isArray(parsed.steps)) {
          plan = parsed.steps as string[];
        }
        break;
      case "agent_summary":
        summary = {
          summary: (parsed.summary as string) ?? "",
          files_produced: (parsed.files_produced as string[]) ?? [],
          key_decisions: (parsed.key_decisions as string[]) ?? [],
        };
        break;
      case "tool_used":
        toolEvents.push(ev);
        break;
      case "cost_reported":
        cost = {
          cost_usd: parsed.cost_usd as number | undefined,
          num_turns: parsed.num_turns as number | undefined,
        };
        break;
    }
  }

  return { plan, toolEvents: toolEvents.slice(-20), summary, cost, taskStartedAt };
}

// ─── Single Agent Card ───────────────────────────────────────────────────────

function AgentCard({
  agent,
  projectId,
  events,
}: {
  agent: AgentStatus;
  projectId?: string;
  events: ProjectEvent[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPTS[agent.role] ?? "");
  const send = useSendAgentMessage();

  const badge = STATUS_BADGES[agent.status] ?? STATUS_BADGES.idle;
  const summary = lastActionSummary(agent.last_event);
  const run = extractAgentRun(events, agent.agent_id);
  const isSending = send.isPending;

  // Track how many tool_used events have arrived to tick plan checkboxes
  const toolCount = run.toolEvents.length;

  function handleSend() {
    if (!prompt.trim() || !projectId) return;
    send.mutate(
      { agentId: agent.agent_id, message: prompt, projectId },
      {
        onSuccess: () => console.info(`[dashboard] triggered ${agent.agent_id}`),
        onError: (err) => console.error(`[dashboard] trigger failed:`, err),
      }
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold text-gray-200">
            {ROLE_LABELS[agent.role] ?? agent.role}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {agent.last_event && (
            <span className="text-xs text-gray-600">{relativeTime(agent.last_event.created_at)}</span>
          )}
          <span className="text-gray-500 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Collapsed summary line */}
      {!expanded && (
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-500 leading-snug">{summary}</p>
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-800">
          {/* Section A — Execution Plan */}
          <div className="pt-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Execution Plan
            </h4>
            {run.plan ? (
              <ul className="space-y-1">
                {run.plan.map((step, i) => {
                  const checked = i < toolCount;
                  return (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span className={`mt-0.5 shrink-0 w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${checked ? "bg-green-700 border-green-600" : "border-gray-600"}`}>
                        {checked && <span className="text-white text-[9px]">✓</span>}
                      </span>
                      <span className={checked ? "text-gray-500 line-through" : "text-gray-300"}>
                        {step}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-gray-600 italic">Waiting for plan…</p>
            )}
          </div>

          {/* Section B — Activity (recent tool events) */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Activity
              {run.taskStartedAt && (
                <span className="ml-2 font-normal normal-case text-gray-600">
                  since {relativeTime(run.taskStartedAt)}
                </span>
              )}
            </h4>
            {run.toolEvents.length > 0 ? (
              <ul className="space-y-0.5 max-h-36 overflow-y-auto">
                {run.toolEvents.map((ev) => {
                  let parsed: Record<string, unknown> = {};
                  try { parsed = JSON.parse(ev.data); } catch { /* ignore */ }
                  return (
                    <li key={ev.id} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-600 shrink-0">{relativeTime(ev.created_at)}</span>
                      <span className="text-gray-400 font-mono">
                        {(parsed.tool as string) ?? "tool"}
                      </span>
                      {parsed.message && (
                        <span className="text-gray-600 truncate">{truncate(String(parsed.message), 60)}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-gray-600 italic">No tool activity yet</p>
            )}
          </div>

          {/* Section C — Last Run Summary */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Last Run Summary
            </h4>
            {run.summary ? (
              <div className="space-y-2 text-xs">
                <p className="text-gray-300 leading-relaxed">{run.summary.summary}</p>
                {run.summary.files_produced.length > 0 && (
                  <div>
                    <p className="text-gray-500 font-medium mb-1">Files produced</p>
                    <ul className="space-y-0.5">
                      {run.summary.files_produced.map((f) => (
                        <li key={f} className="text-blue-400 font-mono">{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {run.summary.key_decisions.length > 0 && (
                  <div>
                    <p className="text-gray-500 font-medium mb-1">Key decisions</p>
                    <ul className="space-y-0.5 list-disc list-inside">
                      {run.summary.key_decisions.map((d, i) => (
                        <li key={i} className="text-gray-300">{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {run.cost && (
                  <p className="text-gray-600">
                    {run.cost.num_turns != null && `${run.cost.num_turns} turns`}
                    {run.cost.cost_usd != null && ` · $${run.cost.cost_usd.toFixed(4)}`}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-600 italic">No summary yet</p>
            )}
          </div>

          {/* Trigger prompt */}
          {projectId && (
            <div className="space-y-1.5 pt-1 border-t border-gray-800">
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Prompt to send to this agent…"
                className="w-full text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-gray-500"
              />
              <button
                onClick={handleSend}
                disabled={isSending || !prompt.trim()}
                className="w-full text-xs bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded px-2 py-1 transition-colors"
              >
                {isSending ? "Sending…" : `Trigger ${ROLE_LABELS[agent.role] ?? agent.role}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function AgentDetailPanel({ projectId }: { projectId?: string }) {
  const { data: agents } = useQuery({
    queryKey: ["agent-status"],
    queryFn: api.getAgentStatuses,
    refetchInterval: 5000,
  });

  const { data: events = [] } = useQuery({
    queryKey: ["project-events", projectId],
    queryFn: () => api.getProjectEvents(projectId!),
    refetchInterval: 3000,
    enabled: !!projectId,
  });

  if (!agents?.length) {
    return (
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Agents</h3>
        <p className="text-gray-500 text-xs">Loading agents…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-400">Agents</h3>
      {agents.map((agent) => (
        <AgentCard
          key={agent.agent_id}
          agent={agent}
          projectId={projectId}
          events={events}
        />
      ))}
    </div>
  );
}
