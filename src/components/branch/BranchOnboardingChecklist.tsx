import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, X, Sparkles } from "lucide-react";
import { useBranchOnboarding, useDismissBranchOnboarding } from "@/hooks/useBranchOnboarding";
import { useBranchSubscription } from "@/hooks/useBranchSubscriptions";
import { formatDistanceToNowStrict } from "date-fns";

const STEPS: Array<{
  key: keyof import("@/hooks/useBranchOnboarding").BranchOnboardingProgress;
  label: string;
  to: string;
  hint: string;
}> = [
  { key: "company_details_done", label: "Confirm company details", to: "/branch/settings?tab=identity", hint: "Trading name, address, VAT" },
  { key: "email_settings_done",  label: "Set sender email",        to: "/branch/settings?tab=email",    hint: "Connect SMTP / Gmail" },
  { key: "branding_done",        label: "Upload your branding",    to: "/branch/settings?tab=identity", hint: "Logo & colours" },
  { key: "payfast_done",         label: "Set up PayFast",          to: "/branch/settings?tab=payments", hint: "Accept card payments" },
  { key: "team_invited",         label: "Invite your team",        to: "/branch/settings?tab=users",    hint: "Add at least one teammate" },
  { key: "first_order_done",     label: "Run a test order",        to: "/branch/orders",                hint: "Place one through your storefront" },
];

export function BranchOnboardingChecklist({ branchId }: { branchId: string }) {
  const { data, isLoading } = useBranchOnboarding(branchId);
  const { data: sub } = useBranchSubscription(branchId);
  const dismiss = useDismissBranchOnboarding();

  if (isLoading || !data) return null;

  // Hide if completed, or recently dismissed (re-show after 7 days)
  if (data.completed_at) return null;
  if (data.dismissed_at) {
    const ageDays = (Date.now() - new Date(data.dismissed_at).getTime()) / 86400000;
    if (ageDays < 7) return null;
  }

  const completed = STEPS.filter((s) => Boolean((data as any)[s.key])).length;
  const pct = Math.round((completed / STEPS.length) * 100);

  const trialActive = sub?.trial_status === "active" && sub?.trial_ends_at;
  const trialLeft = trialActive
    ? formatDistanceToNowStrict(new Date(sub!.trial_ends_at!), { addSuffix: false })
    : null;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Get your branch ready
            {trialLeft && (
              <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                {trialLeft} left on trial
              </span>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {completed} of {STEPS.length} steps complete — finish these to start taking orders.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => dismiss.mutate(branchId)}
          title="Hide for a week"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pct} className="h-1.5" />
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {STEPS.map((s) => {
            const done = Boolean((data as any)[s.key]);
            return (
              <li key={s.key as string}>
                <Link
                  to={s.to}
                  className={`flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60 ${
                    done ? "opacity-60" : ""
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className={`text-sm font-medium leading-tight ${done ? "line-through" : ""}`}>
                      {s.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.hint}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
