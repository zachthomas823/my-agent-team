import { useState } from "react";
import { Link } from "react-router-dom";
import { useProjects, useCreateProject } from "../hooks/useProject";
import { useWebSocket } from "../hooks/useWebSocket";

const STATUS_BADGES: Record<string, string> = {
  active: "bg-green-900/50 text-green-400",
  paused: "bg-yellow-900/50 text-yellow-400",
  completed: "bg-blue-900/50 text-blue-400",
  failed: "bg-red-900/50 text-red-400",
};

export function Dashboard() {
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const { connected } = useWebSocket();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = () => {
    if (name && description) {
      createProject.mutate(
        { name, description },
        {
          onSuccess: () => {
            setShowForm(false);
            setName("");
            setDescription("");
          },
        }
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Orchestrator</h1>
          <p className="text-sm text-gray-400 mt-1">
            <span
              className={`inline-block w-2 h-2 rounded-full mr-1 ${connected ? "bg-green-400" : "bg-red-400"}`}
            />
            {connected ? "Connected" : "Disconnected"}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors"
        >
          New Project
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-900 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            Create Project
          </h3>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="w-full bg-gray-800 rounded px-3 py-2 text-sm border border-gray-700 focus:border-blue-500 outline-none mb-3"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the project idea..."
            rows={4}
            className="w-full bg-gray-800 rounded px-3 py-2 text-sm border border-gray-700 focus:border-blue-500 outline-none mb-3 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name || !description || createProject.isPending}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded text-sm"
            >
              {createProject.isPending ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-500">Loading projects...</p>
      ) : !projects?.length ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No projects yet</p>
          <p className="text-sm">
            Create a new project to get started
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="block bg-gray-900 hover:bg-gray-800 rounded-lg p-4 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white">{project.name}</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Phase: {project.current_phase} &middot; Created{" "}
                    {new Date(project.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGES[project.status] || STATUS_BADGES.active}`}
                >
                  {project.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
