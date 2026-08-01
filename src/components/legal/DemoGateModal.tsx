import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { DemoGateConfig } from "@/hooks/useDemoGate";

interface Props {
  tenantName?: string | null;
  config: DemoGateConfig;
  onAccept: () => void;
}

/**
 * Non-dismissible acknowledgement modal shown over a tenant storefront when
 * demo mode is on. No password — the visitor simply confirms they understand
 * this is a concept demonstration.
 */
export default function DemoGateModal({ tenantName, config, onAccept }: Props) {
  const [accepted, setAccepted] = useState(false);

  return (
    <Dialog open>
      <DialogContent
        className="max-w-2xl [&>button]:hidden max-h-[90vh] overflow-y-auto"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl">{config.headline}</DialogTitle>
          {tenantName && (
            <DialogDescription>
              You are viewing a private preview of <strong>{tenantName}</strong>.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-6">
          {config.disclaimer_html && (
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: config.disclaimer_html }}
            />
          )}

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={accepted}
              onCheckedChange={(v) => setAccepted(!!v)}
              className="mt-0.5"
            />
            <span>
              I understand this is a concept demonstration and not a live commercial
              service.
            </span>
          </label>

          <Button onClick={onAccept} disabled={!accepted} className="w-full">
            Enter demo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
