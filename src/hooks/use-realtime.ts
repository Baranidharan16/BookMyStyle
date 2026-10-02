"use client";
import { useEffect, useEffectEvent, useState } from "react";

export type RealtimeMessage = { ch: string; type: string; data?: Record<string, unknown> };

/**
 * Subscribe to server-sent realtime hints for the given channels. One
 * EventSource per component; the browser reconnects automatically. Used to
 * refetch availability/board/status instead of polling.
 */
export function useRealtime(channels: (string | null | undefined)[], onMessage: (m: RealtimeMessage) => void) {
  const handle = useEffectEvent((m: RealtimeMessage) => onMessage(m));
  const [connected, setConnected] = useState(false);
  const key = channels.filter(Boolean).join(",");

  useEffect(() => {
    if (!key || typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/realtime?ch=${encodeURIComponent(key)}`);
    es.addEventListener("ready", () => setConnected(true));
    es.addEventListener("message", (e) => {
      try {
        handle(JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => setConnected(false);
    return () => {
      es.close();
      setConnected(false);
    };
  }, [key]);

  return { connected };
}
