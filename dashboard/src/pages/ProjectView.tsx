import { useParams, Link } from "react-router-dom";
import { useProject } from "../hooks/useProject";
import { WorkflowTimeline } from "../components/WorkflowTimeline";
import { BlockerPanel } from "../components/BlockerPanel";
import { ArtifactBrowser } from "../components/ArtifactBrowser";
import { AgentDetailPanel } from "../components/AgentDetailPanel";

export function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading } = useProject(id || "");

  if (isLoading || !project) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <p className="text-gray-500">Loading project...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-gray-400 hover:text-white text-sm">
          &larr; Projects
        </Link>
        <h1 className="text-2xl font-bold text-white">{project.name}</h1>
      </div>

      {project.workflow && (
        <WorkflowTimeline phases={project.workflow.phases} />
      )}

      <BlockerPanel projectId={id} />

      <ArtifactBrowser projectId={id!} />

      <AgentDetailPanel projectId={id} />
    </div>
  );
}
