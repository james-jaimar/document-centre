import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useAuth } from "@/hooks/useAuth";

interface UploadSession {
  id: string;
  token: string;
  expiresAt: string;
  fileCount: number;
}

interface RealtimeDocument {
  id: string;
  file_name: string;
  mime_type: string;
  file_path: string;
  created_at: string;
}

export function useUploadSession(orderItemId: string | undefined) {
  const { tenantId, appId } = useTenantContext();
  const { user } = useAuth();
  const [session, setSession] = useState<UploadSession | null>(null);
  const [incomingFiles, setIncomingFiles] = useState<RealtimeDocument[]>([]);
  const [creating, setCreating] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const createSession = useCallback(async () => {
    if (!orderItemId || !tenantId || !appId || !user) return null;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("upload_sessions")
        .insert({
          order_item_id: orderItemId,
          tenant_id: tenantId,
          app_id: appId,
          created_by: user.id,
        })
        .select("id, token, expires_at, file_count")
        .single();

      if (error) throw error;

      const s: UploadSession = {
        id: data.id,
        token: data.token,
        expiresAt: data.expires_at,
        fileCount: data.file_count,
      };
      setSession(s);
      return s;
    } catch (err) {
      console.error("[useUploadSession] create failed:", err);
      return null;
    } finally {
      setCreating(false);
    }
  }, [orderItemId, tenantId, appId, user]);

  const closeSession = useCallback(async () => {
    if (!session) return;
    await supabase
      .from("upload_sessions")
      .update({ is_active: false })
      .eq("id", session.id);
    setSession(null);
    setIncomingFiles([]);
  }, [session]);

  // Subscribe to realtime document inserts for this order item
  useEffect(() => {
    if (!session || !orderItemId) return;

    const channel = supabase
      .channel(`mobile-uploads-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "documents",
          filter: `order_item_id=eq.${orderItemId}`,
        },
        (payload) => {
          const newDoc = payload.new as RealtimeDocument;
          setIncomingFiles((prev) => {
            // Avoid duplicates
            if (prev.some((d) => d.id === newDoc.id)) return prev;
            return [...prev, newDoc];
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [session, orderItemId]);

  // Build the upload URL
  const uploadUrl = session
    ? `${window.location.origin}/upload/${session.token}`
    : null;

  return {
    session,
    uploadUrl,
    incomingFiles,
    creating,
    createSession,
    closeSession,
    clearIncoming: useCallback(() => setIncomingFiles([]), []),
  };
}
