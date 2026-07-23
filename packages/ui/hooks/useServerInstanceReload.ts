import { useEffect } from "react";
import { hasServerInstanceChanged } from "@ainotate/core/server-instance";

export const SERVER_INSTANCE_POLL_INTERVAL_MS = 2_500;

interface UseServerInstanceReloadOptions {
  endpoint: string;
  serverInstanceId: string | null | undefined;
  enabled?: boolean;
  intervalMs?: number;
}

/**
 * Reload a reused browser tab when a new server starts on the same endpoint.
 *
 * setTimeout is intentionally scheduled after each completed request so a slow
 * or restarting server cannot accumulate overlapping polls.
 */
export function useServerInstanceReload({
  endpoint,
  serverInstanceId,
  enabled = true,
  intervalMs = SERVER_INSTANCE_POLL_INTERVAL_MS,
}: UseServerInstanceReloadOptions): void {
  useEffect(() => {
    if (!enabled || !serverInstanceId) return;

    let cancelled = false;
    let timeoutId: number | undefined;

    const schedule = () => {
      if (!cancelled) timeoutId = window.setTimeout(poll, intervalMs);
    };

    const poll = async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (response.ok && hasServerInstanceChanged(serverInstanceId, await response.json())) {
          window.location.reload();
          return;
        }
      } catch {
        // The helper briefly takes the fixed port offline while replacing the
        // previous review server. Keep polling until the successor is ready.
      }
      schedule();
    };

    schedule();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [enabled, endpoint, intervalMs, serverInstanceId]);
}
