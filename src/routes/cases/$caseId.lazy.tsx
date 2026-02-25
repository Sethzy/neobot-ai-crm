/**
 * Case detail page component.
 * Loaded lazily via TanStack Router to avoid bundling dashboard UI on landing.
 */
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useCase, useUpdateCase } from "@/hooks/use-cases";
import { useDocumentsWithStatus } from "@/hooks/use-documents";
import type { UpdateCaseInput } from "@/types/cases";
import { CaseHeader } from "@/components/cases/case-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppLayout } from "@/components/layout/app-layout";
import { DocumentsSection } from "@/components/documents/documents-section";
import { ValidationRulesSection } from "@/components/cases/validation-rules-section";
import { AnalystSection } from "@/components/analyst/analyst-section";
import { LibrarySection } from "@/components/library";
import { useReportHistory } from "@/hooks/use-docgen";
import { Sparkle } from "lucide-react";

export const Route = createLazyFileRoute("/cases/$caseId")({
  component: CaseDetailPage,
});

export function CaseDetailPage() {
  const { caseId } = Route.useParams();
  const { data: caseData, isError, isLoading } = useCase(caseId);
  const updateCase = useUpdateCase();

  // Fetch documents and reports for tab counts (data already cached by loader)
  const { data: documents = [] } = useDocumentsWithStatus(caseId);
  const { data: reports = [] } = useReportHistory(caseId);
  const filesCount = documents.length;
  const reportsCount = reports.length;

  // Only show error if not loading - prevents red flash during navigation
  if (!isLoading && (isError || !caseData)) {
    return (
      <AppLayout>
        <div className="px-12 py-10 text-center">
          <p className="text-destructive">Folder not found</p>
          <Link
            to="/cases"
            className="text-primary hover:underline mt-4 inline-block"
          >
            Back to Workspace
          </Link>
        </div>
      </AppLayout>
    );
  }

  // Show nothing while loading without data (prevents accessing undefined caseData)
  if (!caseData) {
    return <AppLayout><div /></AppLayout>;
  }

  const handleSave = (data: UpdateCaseInput) => {
    updateCase.mutate({ id: caseId, ...data });
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-muted/5">
        <Tabs defaultValue="files" className="flex flex-col h-full">
          {/* Header Section - Full Width with visual distinction */}
          {/* Removed border-b here, moved to tabs container for precise alignment */}
          <div className="flex flex-col bg-background z-10">
            <div className="px-6 pt-3 pb-1">
              {/* Breadcrumb */}
              <nav className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                <Link to="/cases" className="hover:text-foreground transition-colors hover:muted-foreground">
                  Workspace
                </Link>
                <span className="text-muted-foreground/30 font-light">/</span>
                <span className="text-foreground/70 font-semibold">{caseData.case_ref}</span>
              </nav>

              {/* Case Header Component */}
              <CaseHeader
                caseId={caseId}
                caseData={caseData}
                onSave={handleSave}
                isSaving={updateCase.isPending}
              />
            </div>

            {/* Tabs List - Integrated into header bottom */}
            {/* Added border-b here to act as the seamless separator */}
            <div className="px-6 border-b border-border/40">
              <TabsList variant="line" className="-mb-[1px] w-full justify-start border-b-0 p-0 h-auto gap-4 [&_button::after]:!bottom-[-1px]">
                <TabsTrigger value="files" className="py-2 px-1 data-[state=active]:font-semibold text-foreground/60 hover:text-foreground group">
                  Files
                  <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground/80">
                    {filesCount}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="rules" className="py-2 px-1 data-[state=active]:font-semibold text-foreground/60 hover:text-foreground group">
                  Rules
                </TabsTrigger>
                <TabsTrigger value="analyst" className="py-2 px-1 data-[state=active]:font-semibold group text-foreground/60 hover:text-foreground group">
                  AI Analyst<Sparkle className="ml-1 h-3.5 w-3.5 text-[#2D6A4F] opacity-60 group-hover:opacity-80 group-data-[state=active]:opacity-100 transition-opacity" />
                </TabsTrigger>
                <TabsTrigger value="library" className="py-2 px-1 data-[state=active]:font-semibold text-foreground/60 hover:text-foreground group">
                  Reports
                  <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground/80">
                    {reportsCount}
                  </span>
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* Main Content Area - Scrollable with padding */}
          <div className="flex-1 min-h-0 overflow-auto bg-muted/5 p-6">
            <TabsContent value="files" className="mt-0 h-full">
              <DocumentsSection caseId={caseId} />
            </TabsContent>

            <TabsContent value="rules" className="mt-0 h-full">
              <ValidationRulesSection caseId={caseId} />
            </TabsContent>

            <TabsContent value="analyst" className="mt-0 h-full data-[state=inactive]:hidden" forceMount>
              <AnalystSection key={caseId} caseId={caseId} />
            </TabsContent>

            <TabsContent value="library" className="mt-0 h-full">
              <LibrarySection caseId={caseId} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </AppLayout>
  );
}
