import { useEffect, useRef, useState } from "react";
import { finishAgentHistorySession } from "./agent-stats.ts";

export type AgentHistorySession = { id: string; startedAt: number; endedAt?: number };
export const createAgentHistorySession = (): AgentHistorySession => ({ id: crypto.randomUUID(), startedAt: Date.now() });

// One mounted table entry, not one dealt hand. No seed/hidden cards are persisted.
export function useAgentHistorySession(enabled: boolean) {
  const [entry] = useState(createAgentHistorySession);
  const pendingClose = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = () => { if (enabled) finishAgentHistorySession(entry.id); };
  useEffect(() => {
    if (!enabled) return;
    if (pendingClose.current !== null) clearTimeout(pendingClose.current);
    const pagehide = () => finishAgentHistorySession(entry.id);
    window.addEventListener("pagehide", pagehide);
    return () => {
      window.removeEventListener("pagehide", pagehide);
      // StrictMode immediately reattaches effects: its simulated cleanup is not exit.
      // Actual route unmount closes on the next task; the new entry always gets a new id.
      pendingClose.current = setTimeout(pagehide, 0);
    };
  }, [enabled, entry]);
  return { entry, close };
}
