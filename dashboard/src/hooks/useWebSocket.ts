import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface AgentEvent {
  type: string;
  agent_id?: string;
  project_id?: string;
  [key: string]: unknown;
}

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => setConnected(true);
    ws.current.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000);
    };

    ws.current.onmessage = (e) => {
      try {
        const event: AgentEvent = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 200));

        queryClient.invalidateQueries({ queryKey: ["projects"] });
        queryClient.invalidateQueries({ queryKey: ["blockers"] });
        if (event.project_id) {
          queryClient.invalidateQueries({
            queryKey: ["project", event.project_id],
          });
          queryClient.invalidateQueries({
            queryKey: ["project-events", event.project_id],
          });
        }
      } catch {
        // ignore malformed messages
      }
    };
  }, [queryClient]);

  useEffect(() => {
    connect();
    return () => ws.current?.close();
  }, [connect]);

  return { connected, events };
}
