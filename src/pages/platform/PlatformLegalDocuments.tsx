import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, FileEdit, ExternalLink } from "lucide-react";
import { usePlatformLegalDocuments } from "@/hooks/usePlatformLegalDocuments";
import { LEGAL_DOCS } from "@/lib/legal/versions";

export default function PlatformLegalDocuments() {
  const { data, isLoading } = usePlatformLegalDocuments();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Legal Documents</h1>
        <p className="text-muted-foreground">
          Edit the platform-wide legal documents customers and branches see and accept at checkout.
          Tenant-specific Terms of Service and Privacy Policy are edited per-tenant under{" "}
          <span className="font-medium">Tenant Settings → Legal</span>.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data ?? []).map((d) => {
            const hasDraft =
              !!d.draft_html &&
              (!d.published_at || (d.draft_updated_at && d.draft_updated_at > d.published_at));
            const route =
              (LEGAL_DOCS as any)[d.slug]?.route ?? `/legal/${d.slug}`;
            return (
              <Card key={d.slug}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                  <div>
                    <CardTitle className="text-lg">{d.title}</CardTitle>
                    <div className="text-xs text-muted-foreground mt-1">
                      slug: <code>{d.slug}</code>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {d.published_version > 0 ? (
                      <Badge variant="default">Published v{d.published_version}</Badge>
                    ) : (
                      <Badge variant="secondary">Using default copy</Badge>
                    )}
                    {hasDraft && <Badge variant="outline">Draft pending</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-muted-foreground space-y-1">
                    {d.published_at && (
                      <div>
                        Published{" "}
                        {new Date(d.published_at).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>
                    )}
                    {d.effective_date && (
                      <div>
                        Effective{" "}
                        {new Date(d.effective_date).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link to={`/platform/legal/${d.slug}`}>
                        <FileEdit className="h-4 w-4 mr-1" /> Edit
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <a href={route} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-1" /> View live
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
