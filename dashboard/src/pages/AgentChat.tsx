import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useProjects } from "../hooks/useProject";

const AGENTS = [
  { id: "analyst-01", label: "Analyst" },
  { id: "pm-01", label: "PM" },
  { id: "architect-01", label: "Architect" },
  { id: "dev-01", label: "Developer" },
  { id: "qa-01", label: "QA" },
];

export function AgentChat() {
  const { agentId: paramAgentId } = useParams<{ agentId: string }>();
  const [selectedAgent, setSelectedAgent] = useState(
    paramAgentId || "analyst-01"
  );
  const [selectedProject, setSelectedProject] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "system"; text: string; timestamp: string }[]
  >([]);

  const { data: projects } = useProjects();

  const sendMessage = useMutation({
    mutationFn: () =>
      api.sendAgentMessage(selectedAgent, message, selectedProject),
    onSuccess: () => {
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          text: message,
          timestamp: new Date().toISOString(),
        },
        {
          role: "system",
          text: `Message sent to ${selectedAgent}. The agent will process it asynchronously.`,
          timestamp: new Date().toISOString(),
        },
      ]);
      setMessage("");
    },
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Agent Chat</h1>

      <div className="flex gap-3 mb-4">
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="bg-gray-800 rounded px-3 py-2 text-sm border border-gray-700"
        >
          {AGENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>

        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="bg-gray-800 rounded px-3 py-2 text-sm border border-gray-700"
        >
          <option value="">Select project...</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-gray-900 rounded-lg p-4 min-h-[300px] mb-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-gray-500 text-sm">
            Send a message to direct an agent's work.
          </p>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`text-sm ${msg.role === "user" ? "text-blue-300" : "text-gray-400"}`}
            >
              <span className="text-xs text-gray-600 mr-2">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
              {msg.text}
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" &&
            message &&
            selectedProject &&
            sendMessage.mutate()
          }
          placeholder="Type a message..."
          className="flex-1 bg-gray-800 rounded px-3 py-2 text-sm border border-gray-700 focus:border-blue-500 outline-none"
        />
        <button
          onClick={() => sendMessage.mutate()}
          disabled={!message || !selectedProject || sendMessage.isPending}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded text-sm"
        >
          Send
        </button>
      </div>
    </div>
  );
}
