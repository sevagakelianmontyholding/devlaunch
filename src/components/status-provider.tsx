"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { Status } from "@/lib/types";

type Toast = { id: number; kind: "success" | "error"; message: string };

type StatusContextValue = {
  status: Status;
  online: boolean;
  refresh: () => Promise<void>;
  notify: (kind: Toast["kind"], message: string) => void;
};

const StatusContext = createContext<StatusContextValue | null>(null);

export function StatusProvider({ initial, children }: { initial: Status; children: ReactNode }) {
  const [status, setStatus] = useState(initial);
  const [online, setOnline] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setStatus((await response.json()) as Status);
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => void refresh(), 10_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const notify = useCallback((kind: Toast["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, message }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }, []);

  return (
    <StatusContext.Provider value={{ status, online, refresh, notify }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`fade-up flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] shadow-xl ${toast.kind === "success" ? "border-success/20 bg-[#0f1f1a] text-success" : "border-danger/20 bg-[#231317] text-danger"}`}
          >
            {toast.kind === "success" ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
            {toast.message}
          </div>
        ))}
      </div>
    </StatusContext.Provider>
  );
}

export function useStatus() {
  const value = useContext(StatusContext);
  if (!value) throw new Error("useStatus must be used inside StatusProvider");
  return value;
}
