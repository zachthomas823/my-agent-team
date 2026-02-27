import { useState, useCallback } from "react";

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

let nextId = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info", durationMs = 4000) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, message, kind }]);
      setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss]
  );

  return { toasts, toast, dismiss };
}
