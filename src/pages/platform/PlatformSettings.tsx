import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlatformEmailTab } from "./settings/PlatformEmailTab";
import { PlatformNotificationsTab } from "./settings/PlatformNotificationsTab";
import { PlatformDangerZoneTab } from "./settings/PlatformDangerZoneTab";

const PlatformSettings = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Platform Settings</h1>

      <Tabs defaultValue="email" className="space-y-6">
        <TabsList>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="danger">Danger Zone</TabsTrigger>
        </TabsList>
        <TabsContent value="email">
          <PlatformEmailTab />
        </TabsContent>
        <TabsContent value="notifications">
          <PlatformNotificationsTab />
        </TabsContent>
        <TabsContent value="danger">
          <PlatformDangerZoneTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PlatformSettings;
