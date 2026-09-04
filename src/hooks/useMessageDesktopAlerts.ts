import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AlertPrefs = { desktop: boolean; sound: boolean };

const DEFAULT_PREFS: AlertPrefs = { desktop: true, sound: true };

function prefsKey(userId: string | undefined) {
  return `staff-msg-alerts:${userId ?? "anon"}`;
}

export function readAlertPrefs(userId: string | undefined): AlertPrefs {
  try {
    const raw = localStorage.getItem(prefsKey(userId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      desktop: parsed?.desktop !== false,
      sound: parsed?.sound !== false,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writeAlertPrefs(userId: string | undefined, prefs: AlertPrefs) {
  try {
    localStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("staff-msg-alerts-changed"));
}

/** Per-user, per-device preferences for desktop pop-ups and sound. */
export function useAlertPrefs() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<AlertPrefs>(() => readAlertPrefs(user?.id));

  useEffect(() => {
    setPrefs(readAlertPrefs(user?.id));
    const onChange = () => setPrefs(readAlertPrefs(user?.id));
    window.addEventListener("staff-msg-alerts-changed", onChange);
    return () => window.removeEventListener("staff-msg-alerts-changed", onChange);
  }, [user?.id]);

  const update = useCallback(
    (patch: Partial<AlertPrefs>) => {
      const next = { ...readAlertPrefs(user?.id), ...patch };
      writeAlertPrefs(user?.id, next);
      setPrefs(next);
    },
    [user?.id],
  );

  return { prefs, update };
}

export type NotificationSupport =
  | "granted"
  | "denied"
  | "default"
  | "unsupported"
  | "needs-own-tab";

export function getNotificationSupport(): NotificationSupport {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (window.top !== window.self) return "needs-own-tab";
  return Notification.permission as "denied" | "default";
}

export async function requestNotificationPermission(): Promise<NotificationSupport> {
  const state = getNotificationSupport();
  if (state !== "default") return state;
  try {
    const result = await Notification.requestPermission();
    return result as NotificationSupport;
  } catch {
    return "denied";
  }
}

function playChime() {
  try {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1174, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* autoplay blocked — ignore */
  }
}

interface Options {
  tenantId: string | null | undefined;
  branchId?: string | null;
  /** e.g. "/branch/orders" or "/admin/orders" */
  ordersBasePath: string;
}

/**
 * Desktop pop-up + chime when a customer sends a message, while a staff tab is open.
 * Skips messages for the order currently on screen.
 */
export function useMessageDesktopAlerts({ tenantId, branchId, ordersBasePath }: Options) {
  const { prefs } = useAlertPrefs();
  const seen = useRef<Set<string>>(new Set());
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const basePathRef = useRef(ordersBasePath);
  basePathRef.current = ordersBasePath;
  const branchRef = useRef(branchId);
  branchRef.current = branchId;

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`msg-desktop-alerts-${tenantId}-${branchId ?? "any"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `tenant_id=eq.${tenantId}`,
        },
        async (payload) => {
          const row: any = payload.new;
          if (!row || row.sender_type !== "customer" || row.is_internal) return;
          if (branchRef.current && row.branch_id && row.branch_id !== branchRef.current) return;
          if (seen.current.has(row.id)) return;
          seen.current.add(row.id);

          // Already reading this order? Stay quiet.
          if (row.order_id && window.location.pathname.includes(row.order_id)) return;

          const { desktop, sound } = prefsRef.current;
          if (sound) playChime();
          if (!desktop || getNotificationSupport() !== "granted") return;

          let orderNumber = "";
          if (row.order_id) {
            const { data } = await supabase
              .from("orders")
              .select("order_number")
              .eq("id", row.order_id)
              .maybeSingle();
            orderNumber = (data as any)?.order_number ?? "";
          }

          try {
            const body = String(row.message_body ?? "").slice(0, 140);
            const notification = new Notification(
              orderNumber ? `New message · ${orderNumber}` : "New customer message",
              { body, tag: `msg-${row.id}`, icon: "/favicon.svg" },
            );
            notification.onclick = () => {
              window.focus();
              if (row.order_id) {
                window.location.href = `${basePathRef.current}/${row.order_id}`;
              }
              notification.close();
            };
          } catch {
            /* ignore */
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, branchId]);
}
