import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
    refetchInterval: 5000,
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId),
    refetchInterval: 5000,
    enabled: !!projectId,
  });
}

export function useProjectEvents(projectId: string) {
  return useQuery({
    queryKey: ["project-events", projectId],
    queryFn: () => api.getProjectEvents(projectId),
    refetchInterval: 3000,
    enabled: !!projectId,
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useSendAgentMessage() {
  return useMutation({
    mutationFn: ({
      agentId,
      message,
      projectId,
    }: {
      agentId: string;
      message: string;
      projectId: string;
    }) => api.sendAgentMessage(agentId, message, projectId),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      description,
      contextFiles,
    }: {
      name: string;
      description: string;
      contextFiles?: File[];
    }) => api.createProject(name, description, contextFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
