/**
 * @file Review toggle button for documents
 * @description Simple toggle button to mark/unmark document as reviewed
 */
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface ReviewActionsProps {
  /** Whether document is currently reviewed */
  isReviewed: boolean;
  /** Callback to toggle review status */
  onToggleReviewed: () => void;
}

/**
 * Review toggle button.
 * Shows "Mark reviewed" or "✓ Reviewed" based on state.
 * Clicking toggles the review status (optimistic update = instant).
 */
export function ReviewActions({
  isReviewed,
  onToggleReviewed,
}: ReviewActionsProps) {
  if (isReviewed) {
    return (
      <Button
        onClick={onToggleReviewed}
        className="h-7 gap-1.5 text-xs font-normal bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg px-3 shadow-sm"
      >
        <Check className="h-3.5 w-3.5" />
        Reviewed
      </Button>
    );
  }

  return (
    <Button
      onClick={onToggleReviewed}
      className="h-7 gap-1.5 text-xs font-normal bg-foreground text-background hover:bg-foreground/90 rounded-lg px-3 shadow-sm"
    >
      <Check className="h-3.5 w-3.5" />
      Mark reviewed
    </Button>
  );
}
