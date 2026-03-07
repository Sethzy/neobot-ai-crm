/**
 * Duplicate detection indicator with tooltip.
 * Shows status as colored icon with details on hover.
 * @module components/documents/duplicate-indicator
 */
import { CheckCircle2, AlertTriangle } from "@/components/icons/lucide-compat";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type DuplicateStatus = "none" | "detected";

/** Split info for showing duplicate details */
interface SplitInfo {
  startPage: number;
  endPage: number;
  potential_duplicate: string | null;
}

interface DuplicateIndicatorProps {
  /** Duplicate detection status */
  status: DuplicateStatus | null | undefined;
  /** Page ranges with duplicate info (optional, for detailed tooltip) */
  pageRanges?: SplitInfo[] | null;
}

/**
 * Formats page range as string (e.g., "3" or "3-5")
 */
function formatPageRange(start: number, end: number): string {
  return start === end ? `${start}` : `${start}-${end}`;
}

/**
 * Returns duplicate description as-is.
 * New prompt format is already concise (e.g., "Copy of p.1", "Receipt for p.13-15").
 */
export function formatDuplicateDescription(description: string): string {
  return description;
}

/**
 * Extracts page reference from duplicate description.
 * "Copy of p.1" → "1", "Receipt for p.13-15" → "13-15"
 */
function extractPageRef(description: string): string | null {
  const match = description.match(/p\.(\d+(?:-\d+)?)/);
  return match ? match[1] : null;
}

/**
 * Displays duplicate status as a colored icon.
 * Shows tooltip with specific page info when duplicates are detected.
 */
export function DuplicateIndicator({
  status,
  pageRanges,
}: DuplicateIndicatorProps) {
  // Don't render if no status data
  if (!status) return null;

  // For no duplicates, show green icon with tooltip
  if (status === "none") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default">
              <CheckCircle2
                className="h-3.5 w-3.5 text-green-500"
                aria-label="No duplicates found"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>No duplicates found</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Get splits that have duplicates
  const duplicateSplits = pageRanges?.filter((s) => s.potential_duplicate) ?? [];

  // For detected duplicates, show tooltip with details
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">
            <AlertTriangle
              className="h-4 w-4 text-warning/80"
              aria-label="Review required"
            />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px]">
          <p className="font-medium">Potential duplicates</p>
          {duplicateSplits.length > 0 ? (
            <ul className="text-xs text-background/70 mt-1 space-y-0.5">
              {duplicateSplits.map((split, i) => {
                const refPage = extractPageRef(split.potential_duplicate!);
                const thisPage = formatPageRange(split.startPage, split.endPage);
                return (
                  <li key={i}>
                    • p.{refPage} ↔ p.{thisPage}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-background/70 mt-1">
              Potential duplicates detected
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
