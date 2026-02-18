import { useState } from "react";
import { useBlockers, useResolveBlocker } from "../hooks/useBlockers";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-900/50 text-red-400 border-red-700",
  high: "bg-orange-900/50 text-orange-400 border-orange-700",
  medium: "bg-yellow-900/50 text-yellow-400 border-yellow-700",
  low: "bg-gray-800 text-gray-400 border-gray-600",
};

export function BlockerPanel({ projectId }: { projectId?: string }) {
  const { data: blockers, isLoading } = useBlockers(projectId);
  const resolveBlocker = useResolveBlocker();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [customResolution, setCustomResolution] = useState("");

  if (isLoading) {
    return (
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Blockers</h3>
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">
        Blockers {blockers?.length ? `(${blockers.length} pending)` : ""}
      </h3>
      {!blockers?.length ? (
        <p className="text-gray-500 text-sm">No pending blockers</p>
      ) : (
        <div className="space-y-3">
          {blockers.map((blocker) => (
            <div
              key={blocker.id}
              className={`border rounded-lg p-3 ${PRIORITY_COLORS[blocker.priority] || PRIORITY_COLORS.medium}`}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-semibold uppercase">
                  {blocker.priority}
                </span>
                <span className="text-xs text-gray-500">
                  {blocker.agent_id}
                </span>
              </div>
              <p className="text-sm mb-2">{blocker.question}</p>
              {blocker.context && (
                <p className="text-xs text-gray-400 mb-3">{blocker.context}</p>
              )}

              {blocker.options && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {blocker.options.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() =>
                        resolveBlocker.mutate({
                          id: blocker.id,
                          resolution: opt.label,
                          selectedOption: opt.id,
                        })
                      }
                      className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs transition-colors"
                      title={opt.impact}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {resolvingId === blocker.id ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customResolution}
                    onChange={(e) => setCustomResolution(e.target.value)}
                    placeholder="Custom answer..."
                    className="flex-1 bg-gray-800 rounded px-2 py-1 text-sm border border-gray-700 focus:border-blue-500 outline-none"
                  />
                  <button
                    onClick={() => {
                      resolveBlocker.mutate({
                        id: blocker.id,
                        resolution: customResolution,
                      });
                      setResolvingId(null);
                      setCustomResolution("");
                    }}
                    className="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded text-xs"
                  >
                    Send
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setResolvingId(blocker.id)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Custom answer...
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
