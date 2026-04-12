"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface Toast {
  id: number;
  message: string;
  type: "error" | "success";
}

interface ToastContextValue {
  toast: (message: string, type?: "error" | "success") => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: "error" | "success" = "error") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`animate-in slide-in-from-left fade-in rounded-lg px-4 py-2.5 text-sm shadow-xl ring-1 backdrop-blur-xl ${
                t.type === "error"
                  ? "bg-red-500/10 text-red-300 ring-red-500/20"
                  : "bg-green-500/10 text-green-300 ring-green-500/20"
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext>
  );
}
