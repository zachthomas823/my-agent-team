import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type FileTreeNode } from "../lib/api";

export function ArtifactBrowser({ projectId }: { projectId: string }) {
  const { data } = useQuery({
    queryKey: ["artifacts", projectId],
    queryFn: () => api.listArtifacts(projectId),
    refetchInterval: 10000,
    enabled: !!projectId,
  });

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const { data: artifact } = useQuery({
    queryKey: ["artifact", projectId, selectedFile],
    queryFn: () => api.getArtifact(projectId, selectedFile!),
    enabled: !!selectedFile,
  });

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">Artifacts</h3>
        <a
          href={api.getArtifactsZipUrl(projectId)}
          download
          className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-2 py-0.5 transition-colors"
        >
          Download all
        </a>
      </div>
      <div className="flex gap-4">
        <div className="w-48 shrink-0">
          {data?.tree ? (
            <TreeView
              nodes={data.tree}
              onSelect={setSelectedFile}
              selected={selectedFile}
            />
          ) : (
            <p className="text-gray-500 text-xs">No artifacts yet</p>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {artifact ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">{artifact.path}</span>
                <div className="flex items-center gap-3">
                  {artifact.modified && (
                    <span className="text-xs text-gray-500">
                      {new Date(artifact.modified).toLocaleString()}
                    </span>
                  )}
                  <a
                    href={api.getArtifactDownloadUrl(projectId, artifact.path)}
                    download
                    className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-2 py-0.5 transition-colors"
                  >
                    Download
                  </a>
                </div>
              </div>
              <pre className="bg-gray-800 rounded p-3 text-xs overflow-auto max-h-96 whitespace-pre-wrap">
                {artifact.content}
              </pre>
            </div>
          ) : (
            <p className="text-gray-500 text-xs">Select a file to view</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TreeView({
  nodes,
  onSelect,
  selected,
  prefix = "",
}: {
  nodes: FileTreeNode[];
  onSelect: (path: string) => void;
  selected: string | null;
  prefix?: string;
}) {
  return (
    <ul className="text-xs space-y-0.5">
      {nodes.map((node) => {
        const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
        return (
          <li key={fullPath}>
            {node.type === "directory" ? (
              <details className="group">
                <summary className="cursor-pointer text-gray-400 hover:text-gray-200">
                  <span className="mr-1">&#128193;</span>
                  {node.name}
                </summary>
                {node.children && (
                  <div className="ml-3">
                    <TreeView
                      nodes={node.children}
                      onSelect={onSelect}
                      selected={selected}
                      prefix={fullPath}
                    />
                  </div>
                )}
              </details>
            ) : (
              <button
                onClick={() => onSelect(fullPath)}
                className={`w-full text-left hover:text-white ${
                  selected === fullPath ? "text-blue-400" : "text-gray-300"
                }`}
              >
                <span className="mr-1">&#128196;</span>
                {node.name}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
