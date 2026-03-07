'use client';

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useParams } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { ArrowLeft, CheckCircle, Loader2 } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
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
import { useSplits, useUpdateSplit } from "@/hooks/use-splits";
import { useSetHighlights } from "@/contexts/highlight-context";

type ViewMode = "extraction" | "split";

const PdfViewerPane = dynamic(
  () =>
    import("@/components/documents/pdf-viewer-pane").then((m) => ({
      default: m.PdfViewerPane,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full flex-col bg-neutral-50/50">
        <div className="h-10 border-b border-[#d1d1d1] bg-[#eeeeee]" />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    ),
  }
);

export default function DocumentDetailPage() {
  const params = useParams<{ caseId: string; docId: string }>();
  const router = useRouter();
  const caseId = params?.caseId ?? "";
  const docId = params?.docId ?? "";

  const { data, isLoading } = useQuery(documentDetailQueryOptions(caseId, docId));
  const document = data?.document;
  const pdfUrl = data?.pdfUrl;

  useEffect(() => {
    if (document && document.status !== "complete") {
      router.replace(`/cases/${caseId}`);
    }
  }, [document, caseId, router]);

  const [viewMode, setViewMode] = useState<ViewMode>("extraction");
  const { jumpToPage } = useSetHighlights();

  const { data: splits, isLoading: splitsLoading } = useSplits(docId);
  const updateSplitMutation = useUpdateSplit();
  const markReviewedMutation = useMarkDocumentReviewed();
  const unmarkReviewedMutation = useUnmarkDocumentReviewed();

  const handleFieldValueChange = useCallback(
    (splitId: string, fieldName: string, newValue: unknown) => {
      const split = splits?.find((s) => s.id === splitId);
      if (!split) return;

      const updatedData = {
        ...split.extractedData,
        [fieldName]: newValue,
      };

      updateSplitMutation.mutate({
        id: splitId,
        documentId: docId,
        extractedData: updatedData,
      });
    },
    [splits, docId, updateSplitMutation]
  );

  const handlePageClick = useCallback(
    (page: number) => {
      jumpToPage(page - 1);
    },
    [jumpToPage]
  );

  const handleSplitSelect = useCallback(
    (splitId: string, startPage: number) => {
      jumpToPage(startPage - 1);
      const element = window.document.getElementById(`split-${splitId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [jumpToPage]
  );

  const isReviewed = (document as { is_reviewed?: boolean } | undefined)?.is_reviewed ?? false;

  const handleToggleReviewed = useCallback(() => {
    if (!caseId || !docId) return;
    if (isReviewed) {
      unmarkReviewedMutation.mutate({ documentId: docId, caseId });
    } else {
      markReviewedMutation.mutate({ documentId: docId, caseId });
    }
  }, [isReviewed, markReviewedMutation, unmarkReviewedMutation, docId, caseId]);

  if (!caseId || !docId || isLoading || !document || !pdfUrl) {
    return (
      <div className="flex h-screen animate-pulse flex-col bg-background">
        <div className="flex items-center gap-4 border-b border-border/40 px-5 py-3">
          <div className="h-8 w-8 rounded bg-muted/40" />
          <div className="h-4 w-48 rounded bg-muted" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex w-full md:w-1/2 items-center justify-center border-b md:border-b-0 md:border-r border-[#E5E5E5]">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
          <div className="w-full md:w-1/2 space-y-4 p-4 md:p-6">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="h-24 rounded-lg bg-muted/30" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const displayFilename = document.renamed_filename || document.original_filename;
  const hasExtractionData = splits && splits.some((s) => s.extractedData);

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex items-center gap-2 md:gap-4 border-b border-border/40 px-3 md:px-5 py-3">
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="text-muted-foreground/60 hover:text-foreground"
        >
          <Link href={`/cases/${caseId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="truncate text-sm font-medium text-foreground/90">
          {displayFilename}
        </h1>
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

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="h-1/2 md:h-auto w-full md:w-1/2 border-b md:border-b-0 md:border-r border-[#E5E5E5]">
          <PdfViewerPane pdfUrl={pdfUrl} fileType={document.file_type} />
        </div>

        <div className="h-1/2 md:h-auto w-full md:w-1/2 bg-muted/10 overflow-auto">
          {splitsLoading ? (
            <div className="p-6 text-muted-foreground">Loading extractions...</div>
          ) : viewMode === "split" || !hasExtractionData ? (
            <SplitResultsPane
              splits={document.page_ranges || []}
              tags={document.tags as Record<string, number> | null}
              onPageClick={handlePageClick}
              onBackToExtraction={
                hasExtractionData ? () => setViewMode("extraction") : undefined
              }
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
