/**
 * Documents section with upload, search, and table.
 * Combines drop zone, search, table, and delete confirmation.
 * @module components/documents/documents-section
 */
'use client';

import { useCallback, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Upload, Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VisibilityState } from "@tanstack/react-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDocuments, useDeleteDocument } from "@/hooks/use-documents";
import { useUpload } from "@/contexts/upload-context";
import { useFilePaste } from "@/hooks/use-file-paste";
import { UploadDropZone } from "./upload-drop-zone";
import { DocumentDropOverlay } from "./document-drop-overlay";
import { DocumentsTable } from "./documents-table";
import { TagFilterDropdown } from "./tag-filter-dropdown";
import { ColumnVisibilityDropdown } from "./column-visibility-dropdown";
import { useLocalStorage } from "@/hooks/use-local-storage";
import {
  calculateTotalSize,
  formatFileSize,
  getDownloadSizeStatus,
  downloadDocumentsAsZip,
} from "@/lib/download-utils";
import { supabase } from "@/lib/supabase";
import type { Document } from "@/types/documents";

interface DocumentsSectionProps {
  /** Case ID to show documents for */
  caseId: string;
}

/**
 * Complete documents section with upload zone, table, and actions.
 * Shows empty state or table depending on document count.
 */
export function DocumentsSection({ caseId }: DocumentsSectionProps) {
  // All hooks must be called before any early returns (React rules of hooks)
  const { data: documents = [], isLoading } = useDocuments(caseId);
  const { addToQueue } = useUpload();
  const deleteDocument = useDeleteDocument();
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [columnVisibility, setColumnVisibility] = useLocalStorage<VisibilityState>(
    "documents-table-column-visibility",
    {}
  );
  const [columnOrder, setColumnOrder] = useLocalStorage<string[]>(
    "documents-table-column-order",
    []
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Extract unique tags from documents */
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    documents.forEach((doc) => {
      if (doc.primary_tag) tags.add(doc.primary_tag);
      if (doc.tags && typeof doc.tags === "object") {
        Object.keys(doc.tags).forEach((t) => tags.add(t));
      }
    });
    return Array.from(tags).sort();
  }, [documents]);

  /** Column config for visibility dropdown */
  const columnConfig = [
    { id: "index", label: "No." },
    { id: "duplicate_status", label: "Duplicates" },
    { id: "original_filename", label: "Filename" },
    { id: "primary_tag", label: "Tags" },
    { id: "description", label: "Description" },
    { id: "status", label: "Status" },
    { id: "actions", label: "Actions" },
  ];

  /** Filter documents by tag and filename (client-side) */
  const filteredDocuments = useMemo(() => {
    let result = documents;

    // Apply tag filter
    if (tagFilter) {
      result = result.filter((doc) => {
        if (doc.primary_tag === tagFilter) return true;
        if (doc.tags && typeof doc.tags === "object") {
          return tagFilter in doc.tags;
        }
        return false;
      });
    }

    // Apply search filter (searches both original and renamed filenames)
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (doc) =>
          doc.original_filename.toLowerCase().includes(searchLower) ||
          doc.renamed_filename?.toLowerCase().includes(searchLower)
      );
    }

    return result;
  }, [documents, tagFilter, search]);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      // Just add to queue - useUploadProcessor auto-processes via useEffect
      addToQueue(files, caseId);
    },
    [addToQueue, caseId]
  );

  // Enable clipboard paste for file uploads
  useFilePaste({ onFilesSelected: handleFilesSelected });

  const handleView = useCallback(
    (doc: Document) => {
      // Navigate to document detail page with PDF viewer and splits
      router.push(`/cases/${caseId}/documents/${doc.id}`);
    },
    [router, caseId]
  );

  const handleDownload = useCallback(async (doc: Document) => {
    // Use LLM-generated renamed_filename, fall back to original for failed processing
    const downloadFilename = doc.renamed_filename || doc.original_filename;

    const { data } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 60, {
        download: downloadFilename,
      });
    if (data?.signedUrl) {
      window.location.href = data.signedUrl;
    }
  }, []);

  const handleDelete = useCallback((doc: Document) => {
    setDeleteTarget(doc);
  }, []);

  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteDocument.mutate({
        id: deleteTarget.id,
        caseId: deleteTarget.case_id,
        storagePath: deleteTarget.storage_path,
      });
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteDocument]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) {
        handleFilesSelected(files);
      }
      e.target.value = "";
    },
    [handleFilesSelected]
  );

  /** Download all filtered documents as zip */
  const handleDownloadAll = useCallback(async () => {
    const totalSize = calculateTotalSize(filteredDocuments);
    const status = getDownloadSizeStatus(totalSize);

    if (status === "block") {
      alert(
        `Download too large (${formatFileSize(totalSize)}). Please download files individually.`
      );
      return;
    }

    if (status === "warn") {
      const confirmed = confirm(
        `This download is ${formatFileSize(totalSize)} and may be slow. Continue?`
      );
      if (!confirmed) return;
    }

    const getSignedUrl = async (doc: Document) => {
      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.storage_path, 60);
      return data?.signedUrl ?? "";
    };

    await downloadDocumentsAsZip(filteredDocuments, "Documents", getSignedUrl);
  }, [filteredDocuments]);

  /** Stable callback for generating document view URLs */
  const getViewUrl = useCallback(
    (doc: Document) => `/cases/${caseId}/documents/${doc.id}`,
    [caseId]
  );

  // Early return AFTER all hooks (React rules of hooks)
  if (isLoading) {
    return null;
  }

  const hasDocuments = documents.length > 0;
  const hasFilteredDocuments = filteredDocuments.length > 0;

  return (
    <div className="pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Files ({documents.length})
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5">
            Uploaded files will appear here after processing.
          </p>
        </div>
        {hasDocuments && (
          <Button
            onClick={handleUploadClick}
            className="h-7 px-3 text-xs font-normal bg-foreground text-background hover:bg-foreground/90 rounded-lg shadow-sm"
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Upload
          </Button>
        )}
      </div>

      {/* Search and toolbar - show only when documents exist */}
      {hasDocuments && (
        <div className="mt-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              placeholder="Search by filename..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11 h-12 w-full border-border/50 shadow-sm focus-visible:ring-1"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ColumnVisibilityDropdown
                columns={columnConfig}
                visibility={columnVisibility}
                onVisibilityChange={setColumnVisibility}
              />
            </div>
            <div className="flex items-center gap-2">
              <TagFilterDropdown
                availableTags={availableTags}
                selectedTag={tagFilter}
                onTagSelect={setTagFilter}
              />
              <Button variant="outline" onClick={handleDownloadAll} className="h-7 px-2.5 text-xs font-normal border-border/50">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download All ({filteredDocuments.length})
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Content - data guaranteed by loader, no loading state needed */}
      <div className="relative mt-4">
        {hasDocuments ? (
          hasFilteredDocuments ? (
            <DocumentsTable
              documents={filteredDocuments}
              onView={handleView}
              getViewUrl={getViewUrl}
              onDownload={handleDownload}
              onDelete={handleDelete}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              columnOrder={columnOrder}
              onColumnOrderChange={setColumnOrder}
            />
          ) : (
            <div className="rounded-xl border border-border/40 bg-card p-12 text-center text-muted-foreground shadow-sm">
              No documents match your search
            </div>
          )
        ) : (
          <UploadDropZone onFilesSelected={handleFilesSelected} />
        )}

        {/* Drop overlay - positioned within content area */}
        <DocumentDropOverlay onFilesSelected={handleFilesSelected} />
      </div>

      {/* Hidden file input for Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.jpeg,.jpg,.png,.webp,.txt"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteTarget?.original_filename}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
