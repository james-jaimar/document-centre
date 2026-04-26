/**
 * SSE hook for the Document Centre live JobEvent stream.
 *
 * Streams from `/v1/ops/events/stream`. Because the SSE endpoint is on the
 * VPS (not proxied through the edge function), this hook polls
 * `opsApi.jobs()` as a fallback when EventSource is unsupported or the
 * stream errors. Polling cadence: 5s.
 */
import { useEffect, useRef, useState } from "react";
import { opsApi, type OpsJob } from "@/lib/opsApi";

export interface JobEventPayload {
  job_id: string;
  asset_id?: string | null;
  tenant_id?: string | null;
  app_id?: string | null;
  stage: string;
  status: string;
  message?: string | null;
  started_at?: string;
  finished_at?: string | null;
  duration_ms?: number | null;
}

export function useOpsStream(opts: { enabled?: boolean; max?: number } = {}) {
  const { enabled = true, max = 200 } = opts;
  const [events, setEvents] = useState<JobEventPayload[]>([]);
  const [recentJobs, setRecentJobs] = useState<OpsJob[]>([]);
  const [connected, setConnected] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    // Polling fallback only — SSE through edge proxy is non-trivial; live
    // updates land via this poll. We pause polling whenever the tab is
    // hidden so left-open admin tabs don't burn Disk IO Budget overnight,
    // and we relaxed cadence from 5s to 15s — this is an ops dashboard,
    // not a real-time UI.
    const POLL_MS = 15000;

    const poll = async () => {
      if (document.hidden) return;
      try {
        const jobs = await opsApi.jobs({ limit: max });
        if (cancelled) return;
        setRecentJobs(jobs);
        setConnected(true);
      } catch {
        if (cancelled) return;
        setConnected(false);
      }
    };

    poll();
    pollRef.current = window.setInterval(poll, POLL_MS);

    // Refresh once when the tab becomes visible again so the dashboard
    // doesn't show stale state on resume.
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, max]);

  return { events, recentJobs, connected };
}
