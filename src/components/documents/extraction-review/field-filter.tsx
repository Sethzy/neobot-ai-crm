/**
 * @file Multi-select field filter dropdown
 * @description Filter extraction fields by low confidence, needs review, or non-null status
 */
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FieldFilters, FieldCounts } from "@/lib/field-filter-utils";

interface FieldFilterProps {
  /** Current filter state */
  filters: FieldFilters;
  /** Callback when filters change */
  onChange: (filters: FieldFilters) => void;
  /** Field counts for display */
  counts: FieldCounts;
}

/**
 * Multi-select dropdown for filtering extraction fields.
 * Uses OR logic: shows fields matching ANY selected filter.
 */
export function FieldFilter({ filters, onChange, counts }: FieldFilterProps) {
  const activeFilterCount = [
    filters.lowConfidence,
    filters.needsReview,
    filters.nonNull,
  ].filter(Boolean).length;

  const handleToggle = (key: keyof FieldFilters) => {
    onChange({ ...filters, [key]: !filters[key] });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="relative inline-flex">
          <Button variant="outline" size="icon" className="h-7 w-7 border-border/50">
            <Filter className="h-2 w-2" />
            <span className="sr-only">Filter fields</span>
          </Button>
          {activeFilterCount > 0 && (
            <span
              className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-foreground text-background text-[9px] font-medium flex items-center justify-center"
              data-testid="active-filter-count"
            >
              {activeFilterCount}
            </span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="filter-low-confidence"
              checked={filters.lowConfidence}
              onCheckedChange={() => handleToggle("lowConfidence")}
              aria-label="Low confidence fields"
            />
            <Label
              htmlFor="filter-low-confidence"
              className="text-sm font-normal cursor-pointer"
            >
              Low confidence fields
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="filter-needs-review"
              checked={filters.needsReview}
              onCheckedChange={() => handleToggle("needsReview")}
              aria-label="Needs review fields"
            />
            <Label
              htmlFor="filter-needs-review"
              className="text-sm font-normal cursor-pointer"
            >
              Needs review fields
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="filter-non-null"
              checked={filters.nonNull}
              onCheckedChange={() => handleToggle("nonNull")}
              aria-label="Non-null fields"
            />
            <Label
              htmlFor="filter-non-null"
              className="text-sm font-normal cursor-pointer"
            >
              Non-null fields
            </Label>
          </div>

          <div className="pt-2 border-t text-xs text-muted-foreground">
            Showing {counts.visible} of {counts.total} fields
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
