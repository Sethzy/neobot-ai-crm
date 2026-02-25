/**
 * Document detail page showing PDF viewer and extraction results.
 * @module routes/cases/$caseId/documents/$docId
 */
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState, useCallback, lazy, Suspense } from "react";
import { ArrowLeft, CheckCircle, Loader2 } from "lucide-react";

type ViewMode = "extraction" | "split";
import { Button } from "@/components/ui/button";

/** Lazy-loaded PDF viewer - ~500kB chunk loaded on demand */
const PdfViewerPane = lazy(() =>
  import("@/components/documents/pdf-viewer-pane").then((m) => ({
    default: m.PdfViewerPane,
  }))
);
import { SplitResultsPane } from "@/components/documents/split-results-pane";
import {
  ExtractionList,
  ReviewActions,
} from "@/components/documents/extraction-review";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import {
  documentDetailQueryOptions,
  useMarkDocumentReviewed,
  useUnmarkDocumentReviewed,
} from "@/hooks/use-documents";
import { useSplits, useUpdateSplit, splitsQueryOptions } from "@/hooks/use-splits";
import { useSetHighlights } from "@/contexts/highlight-context";

export const Route = createFileRoute("/cases/$caseId_/documents/$docId")({
  loader: async ({ context: { queryClient }, params }) => {
    const { caseId, docId } = params;

    // Prefetch document detail and splits in parallel
    const [data] = await Promise.all([
      queryClient.ensureQueryData(documentDetailQueryOptions(caseId, docId)),
      queryClient.ensureQueryData(splitsQueryOptions(docId)),
    ]);

    // Redirect if document not complete
    if (data.document.status !== "complete") {
      throw redirect({ to: "/cases/$caseId", params: { caseId } });
    }

    return data;
  },
  component: DocumentDetailPage,
});

function DocumentDetailPage() {
  const loaderData = Route.useLoaderData();
  const { caseId, docId } = Route.useParams();

  // Use useQuery for reactive updates when cache is invalidated
  // Loader data provides initial data (no loading state)
  const { data } = useQuery({
    ...documentDetailQueryOptions(caseId, docId),
    initialData: loaderData,
    refetchOnWindowFocus: false,
  });
  const { document, pdfUrl } = data;
  const [viewMode, setViewMode] = useState<ViewMode>("extraction");
  const { jumpToPage } = useSetHighlights();

  // Fetch splits with extraction data
  const { data: splits, isLoading: splitsLoading } = useSplits(docId);
  const updateSplitMutation = useUpdateSplit();
  const markReviewedMutation = useMarkDocumentReviewed();
  const unmarkReviewedMutation = useUnmarkDocumentReviewed();

  // Handle field value changes (auto-save on blur)
  const handleFieldValueChange = useCallback(
    (splitId: string, fieldName: string, newValue: unknown) => {
      // Find the current split
      const split = splits?.find((s) => s.id === splitId);
      if (!split) return;

      // Create updated extracted data
      const updatedData = {
        ...split.extractedData,
        [fieldName]: newValue,
      };

      // Persist via mutation
      updateSplitMutation.mutate({
        id: splitId,
        documentId: docId,
        extractedData: updatedData,
      });
    },
    [splits, docId, updateSplitMutation]
  );

  const handlePageClick = useCallback((page: number) => {
    // Convert 1-indexed to 0-indexed for react-pdf-viewer
    jumpToPage(page - 1);
  }, [jumpToPage]);

  /**
   * Handles split selection from navigator.
   * Navigates PDF to page and scrolls extraction panel to card.
   */
  const handleSplitSelect = useCallback(
    (splitId: string, startPage: number) => {
      // Navigate PDF (convert 1-indexed to 0-indexed)
      jumpToPage(startPage - 1);

      // Scroll extraction panel to card
      const element = window.document.getElementById(`split-${splitId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [jumpToPage]
  );

  const isReviewed = (document as { is_reviewed?: boolean }).is_reviewed ?? false;

  const handleToggleReviewed = useCallback(() => {
    if (isReviewed) {
      unmarkReviewedMutation.mutate({ documentId: docId, caseId });
    } else {
      markReviewedMutation.mutate({ documentId: docId, caseId });
    }
  }, [isReviewed, markReviewedMutation, unmarkReviewedMutation, docId, caseId]);

  const displayFilename = document.renamed_filename || document.original_filename;

  // Determine if we have extraction data to show
  const hasExtractionData = splits && splits.some((s) => s.extractedData);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border/40 px-5 py-3 flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="text-muted-foreground/60 hover:text-foreground">
          <Link to="/cases/$caseId" params={{ caseId }}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-sm font-medium truncate text-foreground/90">{displayFilename}</h1>
        {hasExtractionData && (
          <Badge variant="success" className="flex items-center gap-1.5">
            <CheckCircle className="h-3 w-3" />
            Processed
          </Badge>
        )}
        <div className="flex-1" />
        {hasExtractionData && splits && (
          <ReviewActions
            isReviewed={isReviewed}
            onToggleReviewed={handleToggleReviewed}
          />
        )}
      </div>

      {/* Split pane */}
      <div className="flex-1 flex min-h-0">
        {/* Document Viewer - 50% */}
        <div className="w-1/2 border-r border-[#E5E5E5]">
          <Suspense
            fallback={
              <div className="h-full flex flex-col bg-neutral-50/50">
                <div className="h-10 bg-[#eeeeee] border-b border-[#d1d1d1]" />
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              </div>
            }
          >
            <PdfViewerPane pdfUrl={pdfUrl} fileType={document.file_type} />
          </Suspense>
        </div>

        {/* Extraction Results - 50% */}
        <div className="w-1/2 bg-muted/10">
          {splitsLoading ? (
            <div className="p-6 text-muted-foreground">Loading extractions...</div>
          ) : viewMode === "split" || !hasExtractionData ? (
            <SplitResultsPane
              splits={document.page_ranges || []}
              tags={document.tags as Record<string, number> | null}
              onPageClick={handlePageClick}
              onBackToExtraction={hasExtractionData ? () => setViewMode("extraction") : undefined}
            />
          ) : (
            <ExtractionList
              splits={splits!}
              onCardClick={handlePageClick}
              onFieldValueChange={handleFieldValueChange}
              onViewSplits={() => setViewMode("split")}
              onSplitSelect={handleSplitSelect}
            />
          )}
        </div>
      </div>
    </div>
  );
}
