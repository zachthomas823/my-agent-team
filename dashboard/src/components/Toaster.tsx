import type { Toast } from "../hooks/useToast";

const KIND_STYLES: Record<Toast["kind"], string> = {
  success: "bg-green-900/90 border-green-700 text-green-200",
  error:   "bg-red-900/90 border-red-700 text-red-200",
  info:    "bg-gray-800/90 border-gray-600 text-gray-200",
};

const KIND_ICONS: Record<Toast["kind"], string> = {
  success: "✓",
  error:   "✕",
  info:    "i",
};

interface ToasterProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export function Toaster({ toasts, onDismiss }: ToasterProps) {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm shadow-lg ${KIND_STYLES[t.kind]}`}
        >
          <span className="font-bold shrink-0 mt-px">{KIND_ICONS[t.kind]}</span>
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="shrink-0 opacity-50 hover:opacity-100 ml-1"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
