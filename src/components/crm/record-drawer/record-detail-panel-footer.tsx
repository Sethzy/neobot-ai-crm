/**
 * Pinned footer bar for CRM record detail panels (Twenty-style "Options" + actions).
 * @module components/crm/record-drawer/record-detail-panel-footer
 */
"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RecordDetailPanelFooterProps {
  /** Called when "Delete" is selected from the Options dropdown. */
  onDelete?: () => void;
  /** Whether a delete operation is in progress. */
  isDeleting?: boolean;
}

/**
 * Renders a pinned footer bar with an "Options" dropdown at the bottom of the side panel.
 */
export function RecordDetailPanelFooter({
  onDelete,
  isDeleting = false,
}: RecordDetailPanelFooterProps) {
  return (
    <div className="flex items-center justify-end border-t border-border/60 px-4 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            Options
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onDelete ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
