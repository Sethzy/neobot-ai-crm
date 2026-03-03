/**
 * Knowledge Base list page with search and upload.
 * @module app/(dashboard)/knowledge/page
 */
"use client";

import { FileText, Search, Upload } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";

import { VaultFilesTable } from "@/components/knowledge/vault-files-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUploadVaultFile, useVaultFiles } from "@/hooks/use-vault-files";

export default function KnowledgePage() {
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filters = useMemo(() => {
    const normalizedSearch = search.trim();

    return {
      search: normalizedSearch.length > 0 ? normalizedSearch : undefined,
    };
  }, [search]);

  const { data: files = [], isLoading, isError, refetch } = useVaultFiles(filters);
  const upload = useUploadVaultFile();

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      await upload.mutateAsync(file);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Knowledge Base</h1>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Upload and search documents your AI agent can reference.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title, filename, summary, or content..."
            className="h-12 w-full border-border/50 pl-11 shadow-sm focus-visible:ring-1"
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          accept=".pdf,.doc,.docx,.md,.txt,.csv,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
        />

        <Button
          type="button"
          className="h-12 gap-2"
          disabled={upload.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {upload.isPending ? "Uploading..." : "Upload"}
        </Button>
      </div>

      {upload.isError ? (
        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Upload failed: {upload.error?.message}
        </div>
      ) : null}

      <div className="mt-6">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-14 rounded-lg bg-muted/30" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
            <p className="text-sm text-destructive">Unable to load files</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : files.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm md:p-20">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 text-muted-foreground">
              {filters.search
                ? "No files match your search"
                : "No files yet. Upload documents to get started."}
            </p>
          </div>
        ) : (
          <VaultFilesTable files={files} />
        )}
      </div>
    </div>
  );
}
