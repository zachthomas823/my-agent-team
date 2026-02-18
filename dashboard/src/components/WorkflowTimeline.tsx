interface Phase {
  name: string;
  status: "completed" | "active" | "pending";
  agent_id: string;
}

const PHASE_LABELS: Record<string, string> = {
  analysis: "Analysis",
  requirements: "Requirements",
  architecture: "Architecture",
  development: "Development",
  qa: "QA",
};

export function WorkflowTimeline({ phases }: { phases: Phase[] }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">Workflow</h3>
      <div className="flex items-center gap-2">
        {phases.map((phase, i) => (
          <div key={phase.name} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                phase.status === "completed"
                  ? "bg-green-900/50 text-green-400"
                  : phase.status === "active"
                    ? "bg-blue-900/50 text-blue-400 ring-1 ring-blue-500"
                    : "bg-gray-800 text-gray-500"
              }`}
            >
              {phase.status === "completed" && (
                <span className="text-green-400">&#10003;</span>
              )}
              {phase.status === "active" && (
                <span className="animate-pulse text-blue-400">&#9679;</span>
              )}
              {phase.status === "pending" && (
                <span className="text-gray-600">&#9675;</span>
              )}
              {PHASE_LABELS[phase.name] || phase.name}
            </div>
            {i < phases.length - 1 && (
              <span className="text-gray-600 mx-1">&rarr;</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
