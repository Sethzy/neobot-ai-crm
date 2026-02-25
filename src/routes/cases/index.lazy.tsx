/**
 * Cases dashboard page component.
 * Loaded lazily via TanStack Router to keep landing bundle lean.
 */
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useCases } from "@/hooks/use-cases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CasesTable } from "@/components/cases/cases-table";
import { CreateCaseDialog } from "@/components/cases/create-case-dialog";
import { AppLayout } from "@/components/layout/app-layout";
import { Briefcase, Plus, Search } from "lucide-react";

export const Route = createLazyFileRoute("/cases/")({
  component: CasesPage,
});

export function CasesPage() {
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: cases = [], isLoading } = useCases({ filter: "all", search });

  return (
    <AppLayout>
      <div className="px-12 py-10">
        {/* Header section with title and subtitle */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Workspace
          </h1>
          <p className="mt-2 text-sm text-muted-foreground/80">
            Fully customised multi-step document processing workflows with built-in classification, extraction, validation, and review.
          </p>
        </div>

        {/* New button aligned right */}
        <div className="mt-6 flex justify-end">
          <Button
            className="h-7 px-3 text-xs font-normal bg-foreground text-background hover:bg-foreground/90 rounded-lg shadow-sm"
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New
          </Button>
        </div>

        {/* Search bar */}
        <div className="mt-3 relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Search your folders by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-11 h-12 w-full border-border/50 shadow-sm focus-visible:ring-1"
          />
        </div>

        {/* Table or empty state */}
        <div className="mt-6">
          {/* Defensive fallback - data should be prefetched by route loader */}
          {isLoading ? null : cases.length === 0 ? (
            <div className="rounded-xl border border-border/40 bg-card p-20 text-center shadow-sm">
              <Briefcase className="mx-auto h-12 w-12 text-muted-foreground/40" />
              <p className="mt-6 text-muted-foreground">
                {search ? "No results match your search" : "Nothing here yet"}
              </p>
              {!search && (
                <p className="mt-2 text-sm text-muted-foreground/60">
                  Create one to start organizing your documents
                </p>
              )}
            </div>
          ) : (
            <CasesTable cases={cases} />
          )}
        </div>
      </div>

      <CreateCaseDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </AppLayout>
  );
}
