/**
 * Dropdown for toggling column visibility.
 * @module components/documents/column-visibility-dropdown
 */
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { VisibilityState } from "@tanstack/react-table";

interface ColumnConfig {
  /** Column ID matching table column definition */
  id: string;
  /** Display label for the column */
  label: string;
}

interface ColumnVisibilityDropdownProps {
  /** Available columns to toggle */
  columns: ColumnConfig[];
  /** Current visibility state */
  visibility: VisibilityState;
  /** Called when visibility changes */
  onVisibilityChange: (visibility: VisibilityState) => void;
}

/**
 * Dropdown menu with checkboxes for toggling column visibility.
 * Used in table toolbar to let users customize visible columns.
 */
export function ColumnVisibilityDropdown({
  columns,
  visibility,
  onVisibilityChange,
}: ColumnVisibilityDropdownProps) {
  const handleToggle = (columnId: string) => {
    const currentVisible = visibility[columnId] !== false;
    onVisibilityChange({
      ...visibility,
      [columnId]: !currentVisible,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-7 px-2.5 text-xs font-normal border-border/50">
          <Settings2 className="h-3.5 w-3.5 mr-1.5" />
          Display
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={visibility[column.id] !== false}
            onCheckedChange={() => handleToggle(column.id)}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
