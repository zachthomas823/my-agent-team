import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useBlockers(projectId?: string) {
  return useQuery({
    queryKey: ["blockers", projectId],
    queryFn: () => api.listBlockers(projectId),
    refetchInterval: 3000,
  });
}

export function useResolveBlocker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      resolution,
      selectedOption,
    }: {
      id: string;
      resolution: string;
      selectedOption?: string;
    }) => api.resolveBlocker(id, resolution, selectedOption),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blockers"] });
    },
  });
}
