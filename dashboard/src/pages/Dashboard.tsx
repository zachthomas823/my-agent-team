import { useState } from "react";
import { Link } from "react-router-dom";
import { useProjects, useCreateProject, useDeleteProject } from "../hooks/useProject";
import { useWebSocket } from "../hooks/useWebSocket";
import { useToast } from "../hooks/useToast";
import { Toaster } from "../components/Toaster";

const STATUS_BADGES: Record<string, string> = {
  active: "bg-green-900/50 text-green-400",
  paused: "bg-yellow-900/50 text-yellow-400",
  completed: "bg-blue-900/50 text-blue-400",
  failed: "bg-red-900/50 text-red-400",
};

export function Dashboard() {
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const { connected } = useWebSocket();
  const { toasts, toast, dismiss } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleDelete = (e: React.MouseEvent, projectId: string, projectName: string) => {
    e.preventDefault();
    if (confirmDelete === projectId) {
      deleteProject.mutate(projectId, {
        onSuccess: () => {
          toast(`Project "${projectName}" deleted`, "success");
          setConfirmDelete(null);
        },
        onError: (err) => {
          toast(`Failed to delete: ${err.message}`, "error");
          setConfirmDelete(null);
        },
      });
    } else {
      setConfirmDelete(projectId);
    }
  };
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contextFiles, setContextFiles] = useState<File[]>([]);

  const handleCreate = () => {
    if (!name || !description) return;
    console.info("[dashboard] creating project", { name, contextFiles: contextFiles.length });
    createProject.mutate(
      { name, description, contextFiles },
      {
        onSuccess: (data) => {
          console.info("[dashboard] project created", data);
          toast(
            contextFiles.length > 0
              ? `Project "${name}" created with ${contextFiles.length} context file(s)`
              : `Project "${name}" created`,
            "success"
          );
          setShowForm(false);
          setName("");
          setDescription("");
          setContextFiles([]);
        },
        onError: (err) => {
          console.error("[dashboard] project creation failed", err);
          toast(`Failed to create project: ${err.message}`, "error");
        },
      }
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    setContextFiles((prev) => [...prev, ...incoming]);
    e.target.value = ""; // reset so the same file can be re-selected
  };

  const removeFile = (index: number) => {
    setContextFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <>
    <Toaster toasts={toasts} onDismiss={dismiss} />
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
          <div className="mb-3">
            <label className="block text-xs text-gray-400 mb-1.5">
              Context files <span className="text-gray-600">(optional — docs, specs, existing code)</span>
            </label>
            <label className="flex items-center gap-2 w-full cursor-pointer bg-gray-800 hover:bg-gray-750 border border-dashed border-gray-600 hover:border-gray-500 rounded px-3 py-2 text-sm text-gray-400 transition-colors">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <span>{contextFiles.length > 0 ? "Add more files" : "Attach files"}</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
            {contextFiles.length > 0 && (
              <ul className="mt-2 space-y-1">
                {contextFiles.map((file, i) => (
                  <li key={i} className="flex items-center justify-between text-xs text-gray-300 bg-gray-800 rounded px-2 py-1">
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="ml-2 text-gray-500 hover:text-red-400 shrink-0"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
        <div className="space-y-3" onClick={(e) => { if ((e.target as HTMLElement).closest("button") === null) setConfirmDelete(null); }}>
          {projects.map((project) => (
            <div key={project.id} className="relative group">
              <Link
                to={`/projects/${project.id}`}
                className="block bg-gray-900 hover:bg-gray-800 rounded-lg p-4 transition-colors"
                onClick={() => setConfirmDelete(null)}
              >
                <div className="flex items-center justify-between pr-8">
                  <div>
                    <h3 className="font-semibold text-white">{project.name}</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Phase: {project.current_phase} &middot; Created{" "}
                      {new Date(project.created_at.includes("T") ? project.created_at : project.created_at.replace(" ", "T") + "Z").toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGES[project.status] || STATUS_BADGES.active}`}
                  >
                    {project.status}
                  </span>
                </div>
              </Link>
              <button
                onClick={(e) => handleDelete(e, project.id, project.name)}
                disabled={deleteProject.isPending && confirmDelete === project.id}
                className={`absolute top-3 right-3 text-xs px-1.5 py-0.5 rounded border transition-colors ${
                  confirmDelete === project.id
                    ? "bg-red-700 hover:bg-red-600 border-red-600 text-white"
                    : "bg-transparent border-gray-700 text-gray-600 hover:border-red-700 hover:text-red-400 opacity-0 group-hover:opacity-100"
                }`}
                title={confirmDelete === project.id ? "Click again to confirm" : "Delete project"}
              >
                {confirmDelete === project.id ? "Confirm?" : "✕"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
