import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Sparkles } from "lucide-react";
import {
  useBranchOnboarding,
  useDismissBranchOnboarding,
  useToggleBranchOnboardingStep,
} from "@/hooks/useBranchOnboarding";
import { useBranchSubscription } from "@/hooks/useBranchSubscriptions";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface Step {
  key: string;
  label: string;
  to: string;
  hint: string;
  optional?: boolean;
}

const STEPS: Step[] = [
  { key: "company_details_done", label: "Confirm company details", to: "/branch/settings?tab=identity", hint: "Trading name, address, phone" },
  { key: "banking_done",         label: "Add banking details",     to: "/branch/settings?tab=identity", hint: "Used on invoices for EFT payment" },
  { key: "pricing_reviewed",     label: "Review your prices",      to: "/branch/catalog-pricing",       hint: "Confirm or adjust your branch pricing" },
  { key: "email_settings_done",  label: "Set sender email",        to: "/branch/settings?tab=email",    hint: "Connect SMTP / Gmail / Microsoft" },
  { key: "payfast_done",         label: "Set up online payments",  to: "/branch/settings?tab=payments", hint: "PayFast / Stripe — optional but recommended", optional: true },
  { key: "team_invited",         label: "Invite your team",        to: "/branch/settings?tab=users",    hint: "Add at least one teammate" },
  { key: "first_order_done",     label: "Run a test order",        to: "/branch/orders",                hint: "Place one through your storefront" },
];

const REQUIRED_STEPS = STEPS.filter((s) => !s.optional);

export function BranchOnboardingChecklist({ branchId }: { branchId: string }) {
  const { data, isLoading } = useBranchOnboarding(branchId);
  const { data: sub } = useBranchSubscription(branchId);
  const dismiss = useDismissBranchOnboarding();
  const toggle = useToggleBranchOnboardingStep();

  if (isLoading && !data) return null;
  if (!data) return null;
  if (data.dismissed_at) {
    const ageDays = (Date.now() - new Date(data.dismissed_at).getTime()) / 86400000;
    if (ageDays < 7) return null;
  }

  const completedRequired = REQUIRED_STEPS.filter((s) => Boolean((data as any)[s.key])).length;
  const pct = Math.round((completedRequired / REQUIRED_STEPS.length) * 100);

  const trialActive = sub?.trial_status === "active" && sub?.trial_ends_at;
  const trialLeft = trialActive
    ? formatDistanceToNowStrict(new Date(sub!.trial_ends_at!), { addSuffix: false })
    : null;

  const handleToggle = (step: string, done: boolean) => {
    toggle.mutate(
      { branchId, step, done },
      {
        onError: (e: any) =>
          toast({ title: "Couldn't update step", description: e?.message ?? "Please try again", variant: "destructive" }),
      },
    );
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-primary" />
            Get your branch ready
            {trialLeft && (
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                {trialLeft} left on trial
              </span>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {completedRequired} of {REQUIRED_STEPS.length} required steps complete — tick each off as you finish it.
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
              <li key={s.key}>
                <div
                  className={`flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60 ${
                    done ? "opacity-70" : ""
                  }`}
                >
                  <Checkbox
                    checked={done}
                    disabled={toggle.isPending}
                    onCheckedChange={(v) => handleToggle(s.key, Boolean(v))}
                    className="mt-0.5"
                    aria-label={`Mark "${s.label}" as ${done ? "not done" : "done"}`}
                  />
                  <Link to={s.to} className="min-w-0 flex-1">
                    <p className={`text-sm font-medium leading-tight flex items-center gap-2 ${done ? "line-through" : ""}`}>
                      {s.label}
                      {s.optional && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                          Optional
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.hint}</p>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
