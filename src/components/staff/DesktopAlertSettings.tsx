import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  useAlertPrefs,
  getNotificationSupport,
  requestNotificationPermission,
  type NotificationSupport,
} from "@/hooks/useMessageDesktopAlerts";

export default function DesktopAlertSettings() {
  const { prefs, update } = useAlertPrefs();
  const [support, setSupport] = useState<NotificationSupport>("default");

  useEffect(() => {
    setSupport(getNotificationSupport());
  }, []);

  const enable = async () => {
    setSupport(await requestNotificationPermission());
  };

  return (
    <div className="space-y-2 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="alert-desktop" className="text-xs font-medium cursor-pointer">
          Desktop pop-up alerts
        </Label>
        <Switch
          id="alert-desktop"
          checked={prefs.desktop}
          onCheckedChange={(v) => update({ desktop: v })}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="alert-sound" className="text-xs font-medium cursor-pointer">
          Play a sound
        </Label>
        <Switch
          id="alert-sound"
          checked={prefs.sound}
          onCheckedChange={(v) => update({ sound: v })}
        />
      </div>

      {prefs.desktop && support === "default" && (
        <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={enable}>
          Turn on desktop alerts
        </Button>
      )}
      {prefs.desktop && support === "needs-own-tab" && (
        <p className="text-[11px] text-muted-foreground">
          Open this page in its own browser tab to switch desktop alerts on.
        </p>
      )}
      {prefs.desktop && support === "denied" && (
        <p className="text-[11px] text-muted-foreground">
          Alerts are blocked for this site. Allow notifications in your browser's site settings,
          then reload.
        </p>
      )}
      {prefs.desktop && support === "unsupported" && (
        <p className="text-[11px] text-muted-foreground">
          This browser doesn't support desktop alerts.
        </p>
      )}
    </div>
  );
}
