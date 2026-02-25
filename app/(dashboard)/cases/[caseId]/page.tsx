'use client';

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCase, useUpdateCase } from "@/hooks/use-cases";
import { useDocumentsWithStatus } from "@/hooks/use-documents";
import type { UpdateCaseInput } from "@/types/cases";
import { CaseHeader } from "@/components/cases/case-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsSection } from "@/components/documents/documents-section";
import { ValidationRulesSection } from "@/components/cases/validation-rules-section";
import { AnalystSection } from "@/components/analyst/analyst-section";
import { LibrarySection } from "@/components/library";
import { useReportHistory } from "@/hooks/use-docgen";
import { Sparkle } from "lucide-react";

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
      <div className="px-12 py-10 text-center">
        <p className="text-destructive">Folder not found</p>
        <Link href="/cases" className="mt-4 inline-block text-primary hover:underline">
          Back to Workspace
        </Link>
      </div>
    );
  }

  if (!caseData) {
    return <div />;
  }

  const handleSave = (data: UpdateCaseInput) => {
    updateCase.mutate({ id: caseId, ...data });
  };

  return (
    <div className="flex h-full flex-col bg-muted/5">
      <Tabs defaultValue="files" className="flex h-full flex-col">
        <div className="z-10 flex flex-col bg-background">
          <div className="px-6 pb-1 pt-3">
            <nav className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/60">
              <Link
                href="/cases"
                className="hover:muted-foreground transition-colors hover:text-foreground"
              >
                Workspace
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

          <div className="border-b border-border/40 px-6">
            <TabsList
              variant="line"
              className="-mb-[1px] h-auto w-full justify-start gap-4 border-b-0 p-0 [&_button::after]:!bottom-[-1px]"
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
                className="group px-1 py-2 text-foreground/60 data-[state=active]:font-semibold hover:text-foreground"
              >
                Rules
              </TabsTrigger>
              <TabsTrigger
                value="analyst"
                className="group px-1 py-2 text-foreground/60 data-[state=active]:font-semibold hover:text-foreground"
              >
                AI Analyst
                <Sparkle className="ml-1 h-3.5 w-3.5 text-[#2D6A4F] opacity-60 transition-opacity group-data-[state=active]:opacity-100 group-hover:opacity-80" />
              </TabsTrigger>
              <TabsTrigger
                value="library"
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

        <div className="min-h-0 flex-1 overflow-auto bg-muted/5 p-6">
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
            <AnalystSection key={caseId} caseId={caseId} />
          </TabsContent>

          <TabsContent value="library" className="mt-0 h-full">
            <LibrarySection caseId={caseId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
