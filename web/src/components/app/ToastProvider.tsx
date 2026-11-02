"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Toast = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
};

type PushOptions = {
  actionLabel?: string;
  onAction?: () => void;
  /** Default 3200; soft-delete undo uses ~30000. */
  durationMs?: number;
};

type ToastContextValue = {
  push: (message: string, opts?: PushOptions) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, opts?: PushOptions) => {
      const id = Date.now() + Math.random();
      const durationMs = opts?.durationMs ?? 3200;
      setItems((prev) => [
        ...prev,
        {
          id,
          message,
          actionLabel: opts?.actionLabel,
          onAction: opts?.onAction,
          durationMs,
        },
      ]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
      return id;
    },
    [],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="dy-toasts" aria-live="polite" data-toast="root">
        {items.map((t) => (
          <div key={t.id} className="dy-toast" data-toast="item" role="status">
            <span>{t.message}</span>
            {t.actionLabel && t.onAction ? (
              <button
                type="button"
                className="dy-toast__action"
                data-toast="action"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
