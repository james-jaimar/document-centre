import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft, ExternalLink, Loader2, RotateCcw, Save, UploadCloud,
} from "lucide-react";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import {
  usePlatformLegalDocument,
  usePlatformLegalVersions,
  useSaveLegalDraft,
  usePublishLegalVersion,
} from "@/hooks/usePlatformLegalDocuments";
import { getDefaultHtml } from "@/lib/legal/seedHtml";
import type { LegalDocSlug } from "@/lib/legal/versions";

export default function PlatformLegalEditor() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: doc, isLoading } = usePlatformLegalDocument(slug);
  const { data: versions } = usePlatformLegalVersions(slug);
  const saveDraft = useSaveLegalDraft();
  const publish = usePublishLegalVersion();

  const [html, setHtml] = useState("");
  const [effectiveDate, setEffectiveDate] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!doc || hydrated) return;
    // Prefer the pending draft; else the published; else the in-code default.
    const seed =
      doc.draft_html ||
      doc.published_html ||
      getDefaultHtml(slug as LegalDocSlug);
    setHtml(seed);
    setEffectiveDate(
      doc.effective_date || new Date().toISOString().slice(0, 10)
    );
    setHydrated(true);
  }, [doc, hydrated, slug]);

  if (isLoading || !doc) {
    return (
      <div className="container mx-auto p-6 flex items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  const onSaveDraft = async () => {
    try {
      await saveDraft.mutateAsync({ slug, draft_html: html });
      toast.success("Draft saved");
    } catch (e: any) {
      toast.error("Failed to save draft", { description: e.message });
    }
  };

  const onPublish = async () => {
    try {
      await publish.mutateAsync({
        slug,
        html,
        effective_date: effectiveDate || new Date().toISOString().slice(0, 10),
        current_version: doc.published_version,
      });
      toast.success(`Published v${doc.published_version + 1}`);
    } catch (e: any) {
      toast.error("Failed to publish", { description: e.message });
    }
  };

  const onRestoreDefault = () => {
    if (
      !confirm(
        "Replace the editor contents with the built-in default template? Your unsaved edits will be lost."
      )
    )
      return;
    setHtml(getDefaultHtml(slug as LegalDocSlug));
  };

  const hasDraft =
    !!doc.draft_html &&
    (!doc.published_at ||
      (doc.draft_updated_at && doc.draft_updated_at > doc.published_at));

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/platform/legal")}
            className="mb-2 -ml-3"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> All documents
          </Button>
          <h1 className="text-2xl font-bold">{doc.title}</h1>
          <div className="text-sm text-muted-foreground flex items-center gap-3 mt-1">
            {doc.published_version > 0 ? (
              <Badge variant="default">Published v{doc.published_version}</Badge>
            ) : (
              <Badge variant="secondary">Not yet published</Badge>
            )}
            {hasDraft && <Badge variant="outline">Draft pending</Badge>}
            <Link
              to={`/legal/${slug}?preview=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" /> Preview draft
            </Link>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
          <CardDescription>
            Edit the body of the document. Saving creates a draft visible only via
            the preview link; publishing pushes a new version to all customers and
            branches and prompts them to re-accept at next checkout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hydrated && <RichTextEditor value={html} onChange={setHtml} minHeightClass="min-h-[500px]" />}

          <div className="flex flex-wrap items-end gap-4 pt-2">
            <div className="space-y-1">
              <Label htmlFor="effective">Effective date</Label>
              <Input
                id="effective"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-[180px]"
              />
            </div>

            <div className="flex flex-wrap gap-2 ml-auto">
              <Button variant="outline" type="button" onClick={onRestoreDefault}>
                <RotateCcw className="h-4 w-4 mr-1" /> Restore default
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={onSaveDraft}
                disabled={saveDraft.isPending}
              >
                <Save className="h-4 w-4 mr-1" />
                {saveDraft.isPending ? "Saving…" : "Save draft"}
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={publish.isPending}>
                    <UploadCloud className="h-4 w-4 mr-1" />
                    {publish.isPending
                      ? "Publishing…"
                      : `Publish v${doc.published_version + 1}`}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Publish version {doc.published_version + 1}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This makes the current text live for every customer and
                      branch immediately. Branches that accepted v
                      {doc.published_version} will be marked outdated on the
                      Legal Status page and prompted to re-accept at next
                      checkout. This action cannot be undone — you can publish a
                      further version to roll forward.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onPublish}>
                      Publish v{doc.published_version + 1}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
        </CardHeader>
        <CardContent>
          {!versions?.length ? (
            <div className="text-sm text-muted-foreground">
              No previous versions yet.
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between border rounded-md p-3"
                >
                  <div>
                    <div className="font-medium">Version {v.version}</div>
                    <div className="text-xs text-muted-foreground">
                      Published{" "}
                      {new Date(v.published_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {v.effective_date &&
                        ` · Effective ${new Date(v.effective_date).toLocaleDateString()}`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (
                        confirm(
                          `Load Version ${v.version} into the editor? Your current edits will be replaced (but not lost until you save).`
                        )
                      ) {
                        setHtml(v.html);
                      }
                    }}
                  >
                    Load into editor
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
