/**
 * Shipping weight for a single job, with a manual override for the counter
 * staff who have actually put the parcel on the scale.
 */
import { useState } from "react";
import { Scale, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { WEIGHT_SOURCE_LABEL, type WeightSource } from "@/lib/weight/resolveItemWeight";

interface Props {
  job: any;
  /** Set false for the customer-facing view. */
  editable?: boolean;
}

function readWeight(job: any): { grams: number | null; source: WeightSource } {
  const override = Number(job?.weight_grams_override);
  if (Number.isFinite(override) && override > 0) return { grams: override, source: "override" };

  const stamped = Number(job?.configuration?.weight?.grams ?? job?.configuration?.summary?.weight_grams);
  if (Number.isFinite(stamped) && stamped > 0) {
    const src = (job?.configuration?.weight?.source as WeightSource) ?? "calculated";
    return { grams: stamped, source: src };
  }

  const kg = Number(job?.weight_kg);
  if (Number.isFinite(kg) && kg > 0) return { grams: kg * 1000, source: "estimated" };
  return { grams: null, source: "estimated" };
}

export default function JobWeightCard({ job, editable = true }: Props) {
  const qc = useQueryClient();
  const { grams, source } = readWeight(job);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(grams != null ? String(Math.round(grams)) : "");
  const [saving, setSaving] = useState(false);

  async function save(next: number | null) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("order_jobs")
        .update({
          weight_grams_override: next,
          weight_source: next != null ? "override" : null,
          ...(next != null ? { weight_kg: next / 1000 } : {}),
        } as any)
        .eq("id", job.id);
      if (error) throw error;
      toast.success(next != null ? "Weight updated" : "Reverted to the calculated weight");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["order"] });
      qc.invalidateQueries({ queryKey: ["order_jobs"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save the weight");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Scale className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Shipping weight
          </span>
        </div>
        <Badge variant={source === "override" ? "default" : "secondary"} className="text-[10px]">
          {WEIGHT_SOURCE_LABEL[source]}
        </Badge>
      </div>

      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="number"
            min={0}
            step="1"
            className="h-8 text-xs"
            value={value}
            placeholder="grams"
            onChange={(e) => setValue(e.target.value)}
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={saving}
            onClick={() => {
              const n = Math.round(parseFloat(value));
              if (!Number.isFinite(n) || n <= 0) {
                toast.error("Enter a weight in grams");
                return;
              }
              void save(n);
            }}
          >
            <Save className="h-3 w-3 mr-1" /> Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-lg font-bold leading-tight">
            {grams != null ? `${(grams / 1000).toFixed(2)} kg` : "Not calculated"}
          </span>
          {editable && (
            <div className="flex items-center gap-1">
              {source === "override" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px]"
                  disabled={saving}
                  onClick={() => void save(null)}
                  title="Discard the manual weight and use the calculated one"
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Reset
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => {
                  setValue(grams != null ? String(Math.round(grams)) : "");
                  setEditing(true);
                }}
              >
                Weigh manually
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
