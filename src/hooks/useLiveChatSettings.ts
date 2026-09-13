import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  chatEmbedSrc,
  unwrapSetting,
  PLATFORM_TAWK_PROPERTY_ID,
  PLATFORM_TAWK_WIDGET_ID,
} from "@/lib/liveChat";

const CATEGORY = "integrations";
const KEYS = ["tawk_enabled", "tawk_property_id", "tawk_widget_id"] as const;

export interface LiveChatSettings {
  enabled: boolean;
  propertyId: string;
  widgetId: string;
  /** Resolved embed URL, or null when chat is off / incomplete. */
  src: string | null;
  isLoading: boolean;
}

/**
 * Live chat for the customer portal, resolved branch → tenant.
 *
 * Read through the SECURITY DEFINER `resolve_branch_setting` /
 * `resolve_tenant_setting` RPCs so anonymous storefront visitors get the
 * widget too. Demo tenants fall back to the platform's own widget.
 */
export function useLiveChatSettings(
  tenantId: string | null | undefined,
  branchId: string | null | undefined,
  isDemo = false,
): LiveChatSettings {
  const { data, isLoading } = useQuery({
    queryKey: ["live-chat-settings", tenantId ?? null, branchId ?? null],
    enabled: !!tenantId || !!branchId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const read = async (key: string) => {
        if (branchId) {
          const { data } = await supabase.rpc("resolve_branch_setting" as any, {
            p_branch_id: branchId,
            p_category: CATEGORY,
            p_key: key,
          });
          if (data !== null && data !== undefined) return data as unknown;
        }
        if (!tenantId) return null;
        const { data } = await supabase.rpc("resolve_tenant_setting" as any, {
          p_tenant_id: tenantId,
          p_category: CATEGORY,
          p_key: key,
        });
        return (data ?? null) as unknown;
      };
      const [enabled, propertyId, widgetId] = await Promise.all(KEYS.map(read));
      return {
        enabled: enabled === true || unwrapSetting(enabled) === "true",
        propertyId: unwrapSetting(propertyId),
        widgetId: unwrapSetting(widgetId),
      };
    },
  });

  if (isDemo) {
    return {
      enabled: true,
      propertyId: PLATFORM_TAWK_PROPERTY_ID,
      widgetId: PLATFORM_TAWK_WIDGET_ID,
      src: chatEmbedSrc({
        propertyId: PLATFORM_TAWK_PROPERTY_ID,
        widgetId: PLATFORM_TAWK_WIDGET_ID,
      }),
      isLoading: false,
    };
  }

  const enabled = data?.enabled === true;
  const propertyId = data?.propertyId ?? "";
  const widgetId = data?.widgetId ?? "";
  return {
    enabled,
    propertyId,
    widgetId,
    src: enabled ? chatEmbedSrc({ propertyId, widgetId }) : null,
    isLoading,
  };
}
