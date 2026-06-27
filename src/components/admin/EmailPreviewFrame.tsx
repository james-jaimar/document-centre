import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Monitor, Smartphone } from "lucide-react";

interface EmailPreviewFrameProps {
  subject: string;
  html: string;
  /** Optional banner shown above the iframe (e.g. "1-hour sign-in link"). */
  note?: React.ReactNode;
}

export function EmailPreviewFrame({ subject, html, note }: EmailPreviewFrameProps) {
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  const width = mode === "desktop" ? 640 : 380;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Subject</div>
          <div className="text-sm font-medium truncate">{subject}</div>
        </div>
        <div className="flex items-center gap-1 border rounded-md p-0.5 shrink-0">
          <Button type="button" size="sm" variant={mode === "desktop" ? "secondary" : "ghost"}
            className="h-7 px-2" onClick={() => setMode("desktop")}>
            <Monitor className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="sm" variant={mode === "mobile" ? "secondary" : "ghost"}
            className="h-7 px-2" onClick={() => setMode("mobile")}>
            <Smartphone className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {note}

      <div className="border rounded-md bg-[#f5f5f7] overflow-auto flex justify-center p-3 max-h-[640px]">
        <iframe
          title="Email preview"
          srcDoc={html}
          sandbox=""
          style={{ width, height: 620, border: "0", background: "transparent" }}
        />
      </div>
    </div>
  );
}
