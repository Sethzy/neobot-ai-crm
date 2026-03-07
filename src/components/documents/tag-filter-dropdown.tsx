/**
 * Dropdown for filtering documents by tag.
 * @module components/documents/tag-filter-dropdown
 */
import { ChevronDown } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatTagLabel } from "@/lib/utils";

interface TagFilterDropdownProps {
  /** Available tags to filter by */
  availableTags: string[];
  /** Currently selected tag, null for all */
  selectedTag: string | null;
  /** Called when tag selection changes */
  onTagSelect: (tag: string | null) => void;
}

/**
 * Dropdown for selecting a tag to filter documents.
 * Shows "All Tags" when no filter is active.
 */
export function TagFilterDropdown({
  availableTags,
  selectedTag,
  onTagSelect,
}: TagFilterDropdownProps) {
  const displayLabel = selectedTag ? formatTagLabel(selectedTag) : "All Tags";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-7 px-2.5 text-xs font-normal border-border/50">
          {displayLabel}
          <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuItem onClick={() => onTagSelect(null)}>
          All Tags
        </DropdownMenuItem>
        {availableTags.map((tag) => (
          <DropdownMenuItem key={tag} onClick={() => onTagSelect(tag)}>
            {formatTagLabel(tag)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
