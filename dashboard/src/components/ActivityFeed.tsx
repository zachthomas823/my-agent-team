import { useProjectEvents } from "../hooks/useProject";

const AGENT_COLORS: Record<string, string> = {
  "analyst-01": "text-purple-400",
  "pm-01": "text-blue-400",
  "architect-01": "text-green-400",
  "dev-01": "text-orange-400",
  "qa-01": "text-pink-400",
};

const EVENT_LABELS: Record<string, string> = {
  task_started: "started working",
  task_completed: "completed task",
  task_failed: "task failed",
  tool_used: "used tool",
  blocker_created: "needs input",
  handoff_ready: "handed off",
  review_needed: "review needed",
};

export function ActivityFeed({ projectId }: { projectId: string }) {
  const { data: events, isLoading } = useProjectEvents(projectId);

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">Activity</h3>
      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : !events?.length ? (
        <p className="text-gray-500 text-sm">No activity yet</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {events.map((event) => {
            let parsed: Record<string, unknown> = {};
            try {
              parsed = JSON.parse(event.data);
            } catch {
              // ignore
            }

            return (
              <div
                key={event.id}
                className="flex items-start gap-2 text-xs"
              >
                <span className="text-gray-600 shrink-0 w-16">
                  {new Date(event.created_at.includes("T") ? event.created_at : event.created_at.replace(" ", "T") + "Z").toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span
                  className={`font-medium shrink-0 ${AGENT_COLORS[event.agent_id] || "text-gray-400"}`}
                >
                  {event.agent_id}
                </span>
                <span className="text-gray-300">
                  {EVENT_LABELS[event.event_type] || event.event_type}
                  {parsed.tool ? ` (${parsed.tool})` : ""}
                  {parsed.message ? `: ${parsed.message}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
