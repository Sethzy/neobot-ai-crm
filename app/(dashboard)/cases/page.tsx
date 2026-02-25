'use client';

import { useState } from "react";
import { useCases } from "@/hooks/use-cases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CasesTable } from "@/components/cases/cases-table";
import { CreateCaseDialog } from "@/components/cases/create-case-dialog";
import { Briefcase, Plus, Search } from "lucide-react";

export default function CasesPage() {
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: cases = [], isLoading } = useCases({ filter: "all", search });

  return (
    <div className="px-12 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Workspace
        </h1>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Fully customised multi-step document processing workflows with built-in
          classification, extraction, validation, and review.
        </p>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          className="h-7 rounded-lg bg-foreground px-3 text-xs font-normal text-background shadow-sm hover:bg-foreground/90"
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New
        </Button>
      </div>

      <div className="relative mt-3">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          placeholder="Search your folders by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-12 w-full border-border/50 pl-11 shadow-sm focus-visible:ring-1"
        />
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-14 rounded-lg bg-muted/30" />
            ))}
          </div>
        ) : cases.length === 0 ? (
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

      <CreateCaseDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
