import { useMemo } from "react";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getBindingImage,
  normaliseBindingColor,
  type BindingMethod,
  type BindingOrientation,
  type BindingState,
} from "@/components/preview/bindingAssets";
import { BINDING_ALL } from "@/lib/productOptionValues";
import type { StructuredOptionValue } from "@/lib/productOptionTypes";

type AxisKey = `${BindingOrientation}-${BindingState}`;

const AXES: Array<{
  key: AxisKey;
  label: string;
  orientation: BindingOrientation;
  state: BindingState;
}> = [
  { key: "portrait-closed",  label: "Portrait · Closed",  orientation: "portrait",  state: "closed" },
  { key: "portrait-open",    label: "Portrait · Open",    orientation: "portrait",  state: "open"   },
  { key: "landscape-closed", label: "Landscape · Closed", orientation: "landscape", state: "closed" },
  { key: "landscape-open",   label: "Landscape · Open",   orientation: "landscape", state: "open"   },
];

const RENDERABLE_METHODS = new Set<BindingMethod>(["spiral", "comb", "twin_loop"]);

interface AuditRow {
  option: StructuredOptionValue;
  rawMethod: string;
  rawColor: string;
  renderable: boolean;
  results: Record<AxisKey, string | null>;
  missingCount: number;
}

function buildRows(): AuditRow[] {
  return BINDING_ALL.map((option) => {
    const rawMethod = (option.metadata?.binding_method as string | undefined) ?? "—";
    const rawColor = (option.metadata?.color as string | undefined) ?? "—";
    const renderable = RENDERABLE_METHODS.has(rawMethod as BindingMethod);

    const results: Record<AxisKey, string | null> = {
      "portrait-closed": null,
      "portrait-open": null,
      "landscape-closed": null,
      "landscape-open": null,
    };
    let missingCount = 0;

    if (renderable) {
      const method = rawMethod as BindingMethod;
      const color = normaliseBindingColor(rawColor);
      for (const axis of AXES) {
        const src = getBindingImage({
          method,
          color,
          orientation: axis.orientation,
          state: axis.state,
        });
        results[axis.key] = src;
        if (!src) missingCount += 1;
      }
    }

    return { option, rawMethod, rawColor, renderable, results, missingCount };
  });
}

export default function AdminBindingArtworkAudit() {
  const rows = useMemo(buildRows, []);

  const renderableRows = rows.filter((r) => r.renderable);
  const completeCount = renderableRows.filter((r) => r.missingCount === 0).length;
  const totalMissing = renderableRows.reduce((sum, r) => sum + r.missingCount, 0);

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Binding Artwork Audit</h1>
        <p className="text-sm text-muted-foreground">
          Every binding option in the catalog is checked against the registered
          PNG artwork in <code>bindingAssets.ts</code>. Missing tuples are listed
          explicitly so they can be added to the registry.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6 text-sm">
          <div>
            <div className="text-muted-foreground">Total options</div>
            <div className="text-xl font-semibold">{rows.length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">With spine artwork</div>
            <div className="text-xl font-semibold">{renderableRows.length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Fully covered</div>
            <div className="text-xl font-semibold text-emerald-600">{completeCount}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Missing tuples</div>
            <div className={`text-xl font-semibold ${totalMissing > 0 ? "text-destructive" : "text-emerald-600"}`}>
              {totalMissing}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Per-option coverage</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Option</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Colour</TableHead>
                {AXES.map((axis) => (
                  <TableHead key={axis.key} className="text-center">
                    {axis.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.option.slug}>
                  <TableCell className="font-medium">{row.option.label}</TableCell>
                  <TableCell>
                    <code className="text-xs">{row.rawMethod}</code>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{row.rawColor}</code>
                  </TableCell>
                  {AXES.map((axis) => {
                    if (!row.renderable) {
                      return (
                        <TableCell key={axis.key} className="text-center">
                          <MinusCircle
                            className="mx-auto h-4 w-4 text-muted-foreground"
                            aria-label="Not applicable — no spine art"
                          />
                        </TableCell>
                      );
                    }
                    const src = row.results[axis.key];
                    return (
                      <TableCell key={axis.key} className="text-center">
                        {src ? (
                          <div className="flex flex-col items-center gap-1">
                            <img
                              src={src}
                              alt={`${row.option.label} ${axis.label}`}
                              className="h-12 w-6 object-contain"
                              draggable={false}
                            />
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="Registered" />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <XCircle className="h-5 w-5 text-destructive" aria-label="Missing" />
                            <span className="text-[10px] uppercase tracking-wide text-destructive">
                              missing
                            </span>
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalMissing > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-destructive">
              Missing combinations ({totalMissing})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Add a row to <code>BINDING_IMAGES</code> in
              {" "}<code>src/components/preview/bindingAssets.ts</code> for each
              tuple below.
            </p>
            <ul className="space-y-1 text-sm font-mono">
              {rows.flatMap((row) =>
                row.renderable
                  ? AXES.filter((axis) => !row.results[axis.key]).map((axis) => (
                      <li key={`${row.option.slug}-${axis.key}`} className="flex items-center gap-2">
                        <Badge variant="destructive" className="font-mono text-[11px]">
                          missing
                        </Badge>
                        <span>
                          {row.rawMethod} / {normaliseBindingColor(row.rawColor)} /{" "}
                          {axis.orientation} / {axis.state}
                        </span>
                        <span className="text-muted-foreground">
                          ({row.option.label})
                        </span>
                      </li>
                    ))
                  : [],
              )}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
