import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Clock, Send } from "lucide-react";
import { sendMessage } from "@/lib/orders/mutations";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  orderId: string;
  timeline: any[];
  messages: any[];
  appId: string;
  tenantId: string;
}

export function TimelinePanel({ orderId, timeline, messages, appId, tenantId }: Props) {
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Merge timeline + messages into a unified feed, sorted by date desc
  const feed = [
    ...timeline.map((t: any) => ({ ...t, _type: "timeline" as const })),
    ...messages.map((m: any) => ({ ...m, _type: "message" as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const handleSend = async () => {
    if (!messageText.trim()) return;
    setSending(true);
    try {
      await sendMessage({
        order_id: orderId,
        message_body: messageText.trim(),
        sender_type: "admin",
        is_internal: false,
      });
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["order-detail", orderId] });
      toast.success("Message sent");
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Timeline</span>
        <Button size="sm" className="h-8 gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />
          Message
        </Button>
      </div>

      {/* Message composer */}
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <Textarea
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          placeholder="Type a message..."
          className="min-h-[60px] text-sm resize-none"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!messageText.trim() || sending}
            onClick={handleSend}
            className="h-7 gap-1 text-xs"
          >
            <Send className="h-3 w-3" />
            {sending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-0">
        {feed.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No activity yet</p>
        ) : (
          feed.map((item) => (
            <div key={item.id} className="border-l-2 border-border pl-3 pb-4 relative">
              <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-border" />
              
              {item._type === "message" ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold">
                      {item.sender_type === "customer" ? "Customer" : "Admin"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{getTimeAgo(item.created_at)}</span>
                  </div>
                  <div className={cn(
                    "rounded-md px-3 py-2 text-xs",
                    item.sender_type === "customer"
                      ? "bg-amber-50 text-amber-900 border border-amber-200"
                      : "bg-primary/10 text-foreground border border-primary/20"
                  )}>
                    {item.message_body}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium">
                        {item.actor_type === "system" ? "System Action" : item.actor_name || "Admin"}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{getTimeAgo(item.created_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
