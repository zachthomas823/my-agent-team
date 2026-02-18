import { useParams, Link } from "react-router-dom";
import { useProject } from "../hooks/useProject";
import { WorkflowTimeline } from "../components/WorkflowTimeline";
import { BlockerPanel } from "../components/BlockerPanel";
import { ArtifactBrowser } from "../components/ArtifactBrowser";
import { ActivityFeed } from "../components/ActivityFeed";
import { AgentStatusPanel } from "../components/AgentStatus";

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
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="text-gray-400 hover:text-white text-sm">
          &larr; Projects
        </Link>
        <h1 className="text-2xl font-bold text-white">{project.name}</h1>
      </div>

      <div className="space-y-4">
        {project.workflow && (
          <WorkflowTimeline phases={project.workflow.phases} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <BlockerPanel projectId={id} />
            <ArtifactBrowser projectId={id!} />
          </div>
          <div className="space-y-4">
            <AgentStatusPanel />
            <ActivityFeed projectId={id!} />
          </div>
        </div>
      </div>
    </div>
  );
}
