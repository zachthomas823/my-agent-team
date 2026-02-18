import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  idle: { bg: "bg-gray-700", text: "text-gray-300", label: "Idle" },
  working: { bg: "bg-green-900/50", text: "text-green-400", label: "Working" },
  blocked: { bg: "bg-red-900/50", text: "text-red-400", label: "Blocked" },
};

const ROLE_LABELS: Record<string, string> = {
  analyst: "Analyst",
  "product-manager": "PM",
  architect: "Architect",
  developer: "Developer",
  qa: "QA",
};

export function AgentStatusPanel() {
  const { data: agents } = useQuery({
    queryKey: ["agent-status"],
    queryFn: api.getAgentStatuses,
    refetchInterval: 5000,
  });

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">Agents</h3>
      <div className="space-y-2">
        {agents?.map((agent) => {
          const badge = STATUS_BADGES[agent.status] || STATUS_BADGES.idle;
          return (
            <div
              key={agent.agent_id}
              className="flex items-center justify-between"
            >
              <span className="text-sm text-gray-300">
                {ROLE_LABELS[agent.role] || agent.role}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}
              >
                {badge.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
