'use client';

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCase, useUpdateCase } from "@/hooks/use-cases";
import { useDocumentsWithStatus } from "@/hooks/use-documents";
import type { UpdateCaseInput } from "@/types/cases";
import { CaseHeader } from "@/components/cases/case-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { DocumentsSection } from "@/components/documents/documents-section";

/** Non-default tabs — lazy-loaded so initial compile only includes Files tab */
const ValidationRulesSection = dynamic(() => import("@/components/cases/validation-rules-section").then(m => ({ default: m.ValidationRulesSection })));
const AnalystSection = dynamic(() => import("@/components/analyst/analyst-section").then(m => ({ default: m.AnalystSection })));
const LibrarySection = dynamic(() => import("@/components/library").then(m => ({ default: m.LibrarySection })));

const preloadValidationRules = () => void import("@/components/cases/validation-rules-section");
const preloadAnalyst = () => void import("@/components/analyst/analyst-section");
const preloadLibrary = () => void import("@/components/library");

import { useReportHistory } from "@/hooks/use-docgen";
import { Sparkle } from "@/components/icons/lucide-compat";

export default function CaseDetailPage() {
  const params = useParams<{ caseId: string }>();
  const caseId = params?.caseId ?? "";
  const { data: caseData, isError, isLoading } = useCase(caseId);
  const updateCase = useUpdateCase();

  const { data: documents = [] } = useDocumentsWithStatus(caseId);
  const { data: reports = [] } = useReportHistory(caseId);
  const filesCount = documents.length;
  const reportsCount = reports.length;

  if (!caseId) {
    return null;
  }

  if (!isLoading && (isError || !caseData)) {
    return (
      <div className="px-4 py-6 md:px-12 md:py-10 text-center">
        <p className="text-destructive">Folder not found</p>
        <Link href="/cases" className="mt-4 inline-block text-primary hover:underline">
          Back to Documents
        </Link>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="flex h-full animate-pulse flex-col bg-muted/5">
        <div className="z-10 flex flex-col bg-background">
          <div className="px-4 md:px-6 pb-1 pt-3">
            <div className="mb-1 h-3 w-32 rounded bg-muted/40" />
            <div className="mt-2 h-6 w-64 rounded bg-muted" />
          </div>
          <div className="border-b border-border/40 px-4 md:px-6 py-4" />
        </div>
        <div className="min-h-0 flex-1 p-4 md:p-6">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-16 rounded-lg bg-muted/30" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const handleSave = (data: UpdateCaseInput) => {
    updateCase.mutate({ id: caseId, ...data });
  };

  return (
    <div className="flex h-full flex-col bg-muted/5">
      <Tabs defaultValue="files" className="flex h-full flex-col">
        <div className="z-10 flex flex-col bg-background">
          <div className="px-4 md:px-6 pb-1 pt-3">
            <nav className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/60">
              <Link
                href="/cases"
                className="hover:muted-foreground transition-colors hover:text-foreground"
              >
                Documents
              </Link>
              <span className="font-light text-muted-foreground/30">/</span>
              <span className="font-semibold text-foreground/70">
                {caseData.case_ref}
              </span>
            </nav>

            <CaseHeader
              caseId={caseId}
              caseData={caseData}
              onSave={handleSave}
              isSaving={updateCase.isPending}
            />
          </div>

          <div className="border-b border-border/40 px-4 md:px-6 overflow-x-auto">
            <TabsList
              variant="line"
              className="-mb-[1px] h-auto w-full justify-start gap-2 md:gap-4 border-b-0 p-0 [&_button::after]:!bottom-[-1px]"
            >
              <TabsTrigger
                value="files"
                className="group px-1 py-2 text-foreground/60 data-[state=active]:font-semibold hover:text-foreground"
              >
                Files
                <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground/80">
                  {filesCount}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="rules"
                onMouseEnter={preloadValidationRules}
                onFocus={preloadValidationRules}
                className="group px-1 py-2 text-foreground/60 data-[state=active]:font-semibold hover:text-foreground"
              >
                Rules
              </TabsTrigger>
              <TabsTrigger
                value="analyst"
                onMouseEnter={preloadAnalyst}
                onFocus={preloadAnalyst}
                className="group px-1 py-2 text-foreground/60 data-[state=active]:font-semibold hover:text-foreground"
              >
                AI Analyst
                <Sparkle className="ml-1 h-3.5 w-3.5 text-[#024F46] opacity-60 transition-opacity group-data-[state=active]:opacity-100 group-hover:opacity-80" />
              </TabsTrigger>
              <TabsTrigger
                value="library"
                onMouseEnter={preloadLibrary}
                onFocus={preloadLibrary}
                className="group px-1 py-2 text-foreground/60 data-[state=active]:font-semibold hover:text-foreground"
              >
                Reports
                <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground/80">
                  {reportsCount}
                </span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-muted/5 p-4 md:p-6">
          <TabsContent value="files" className="mt-0 h-full">
            <DocumentsSection caseId={caseId} />
          </TabsContent>

          <TabsContent value="rules" className="mt-0 h-full">
            <ValidationRulesSection caseId={caseId} />
          </TabsContent>

          <TabsContent
            value="analyst"
            className="mt-0 h-full data-[state=inactive]:hidden"
            forceMount
          >
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading analyst...
                </div>
              }
            >
              <AnalystSection key={caseId} caseId={caseId} />
            </Suspense>
          </TabsContent>

          <TabsContent value="library" className="mt-0 h-full">
            <LibrarySection caseId={caseId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
