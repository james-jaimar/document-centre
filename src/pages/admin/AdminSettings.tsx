import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParams } from "react-router-dom";
import { GeneralTab } from "./settings/GeneralTab";
import { BrandingTab } from "./settings/BrandingTab";
import { WorkflowTab } from "./settings/WorkflowTab";
import { FinancialTab } from "./settings/FinancialTab";
import { UploadsTab } from "./settings/UploadsTab";
import { NotificationsTab } from "./settings/NotificationsTab";
import { DocumentsTab } from "./settings/DocumentsTab";
import { DeliveryTab } from "./settings/DeliveryTab";
import { EmailAccountsTab } from "./settings/EmailAccountsTab";
import { BillingTab } from "./settings/BillingTab";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Building2, Palette, Workflow, Receipt, Upload, Bell, FileText, Truck, Mail, CreditCard } from "lucide-react";

const AdminSettings = () => {
  const [searchParams] = useSearchParams();
  const { membershipRole } = useTenantContext();
  const defaultTab = searchParams.get("tab") || "general";
  const isOwnerOrAdmin = membershipRole === "owner" || membershipRole === "admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tenant Settings</h1>
        <p className="text-muted-foreground">Configure your tenant's identity, branding, workflows, and integrations</p>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0 mb-6">
          {[
            { value: "general", label: "General", icon: Building2 },
            { value: "branding", label: "Branding", icon: Palette },
            { value: "workflow", label: "Workflow", icon: Workflow },
            { value: "financial", label: "Financial", icon: Receipt },
            { value: "uploads", label: "Uploads & Proofs", icon: Upload },
            { value: "notifications", label: "Notifications", icon: Bell },
            { value: "email", label: "Email Accounts", icon: Mail },
            { value: "documents", label: "Documents", icon: FileText },
            { value: "delivery", label: "Delivery", icon: Truck },
            ...(isOwnerOrAdmin ? [{ value: "billing", label: "Billing", icon: CreditCard }] : []),
          ].map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-3 py-1.5 border border-transparent data-[state=active]:border-primary"
            >
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general"><GeneralTab /></TabsContent>
        <TabsContent value="branding"><BrandingTab /></TabsContent>
        <TabsContent value="workflow"><WorkflowTab /></TabsContent>
        <TabsContent value="financial"><FinancialTab /></TabsContent>
        <TabsContent value="uploads"><UploadsTab /></TabsContent>
        <TabsContent value="notifications"><NotificationsTab /></TabsContent>
        <TabsContent value="email"><EmailAccountsTab /></TabsContent>
        <TabsContent value="documents"><DocumentsTab /></TabsContent>
        <TabsContent value="delivery"><DeliveryTab /></TabsContent>
        {isOwnerOrAdmin && <TabsContent value="billing"><BillingTab /></TabsContent>}
      </Tabs>
    </div>
  );
};

export default AdminSettings;
