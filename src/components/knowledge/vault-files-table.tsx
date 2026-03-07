/**
 * Knowledge Base table for vault files.
 * @module components/knowledge/vault-files-table
 */
"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { AppIcon } from "@/components/icons/app-icons";
import type { VaultFile } from "@/lib/knowledge/schemas";
import { supabase } from "@/lib/supabase";

const columnHelper = createColumnHelper<VaultFile>();

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes <= 0) {
    return "—";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;

  return `${value.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatContentType(contentType: string | null): string {
  if (!contentType) {
    return "—";
  }

  if (contentType.includes("pdf")) return "PDF";
  if (contentType.includes("word")) return "Word";
  if (contentType.includes("markdown") || contentType === "text/plain") return "Text";
  if (contentType.includes("image")) return "Image";
  if (contentType.includes("sheet") || contentType.includes("csv")) return "Sheet";

  return contentType.split("/").pop() ?? contentType;
}

async function getDownloadUrl(file: Pick<VaultFile, "client_id" | "storage_path">): Promise<string> {
  const absoluteStoragePath = `${file.client_id}/${file.storage_path}`;

  const { data, error } = await supabase.storage
    .from("agent-files")
    .createSignedUrl(absoluteStoragePath, 60);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to generate download URL.");
  }

  return data.signedUrl;
}

interface VaultFilesTableProps {
  files: VaultFile[];
}

export function VaultFilesTable({ files }: VaultFilesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "updated_at", desc: true }]);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const columns = useMemo(
    () => [
      columnHelper.accessor("title", {
        header: "Title",
        cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
      }),
      columnHelper.accessor("filename", {
        header: "File",
        cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
      }),
      columnHelper.accessor("content_type", {
        header: "Type",
        cell: (info) => formatContentType(info.getValue()),
      }),
      columnHelper.accessor("size_bytes", {
        header: "Size",
        cell: (info) => formatFileSize(info.getValue()),
      }),
      columnHelper.accessor("updated_at", {
        header: "Updated",
        cell: (info) => (
          <span className="whitespace-nowrap text-muted-foreground">{formatDate(info.getValue())}</span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => (
          <button
            type="button"
            title="Download"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              void (async () => {
                try {
                  setDownloadError(null);
                  const signedUrl = await getDownloadUrl(info.row.original);
                  const anchor = document.createElement("a");
                  anchor.href = signedUrl;
                  anchor.download = info.row.original.filename;
                  anchor.click();
                } catch {
                  setDownloadError("Unable to download file. Please try again.");
                }
              })();
            }}
          >
            <AppIcon name="download" className="h-4 w-4" />
          </button>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: files,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div>
      {downloadError ? (
        <p
          role="alert"
          className="mb-3 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {downloadError}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-border/40 bg-card shadow-sm">
        <table className="w-full">
          <thead className="border-b border-border/40 bg-muted/20">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70 md:px-5 md:py-4"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-border/30 transition-colors hover:bg-muted/40">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-3 text-[13px] text-foreground/80 md:px-5 md:py-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
