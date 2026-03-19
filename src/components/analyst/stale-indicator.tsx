/**
 * Stale indicator icon showing when new documents have been uploaded.
 * Shows amber warning icon with tooltip explaining how to access new data.
 * @module components/analyst/stale-indicator
 */
import { AlertTriangle, RefreshCw } from '@/components/icons/lucide-compat';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface StaleIndicatorProps {
  /** Whether data is stale (documents changed since session started) */
  isStale: boolean;
  /** Whether stale check is in progress */
  isCheckingStale?: boolean;
  /** Trigger manual stale check */
  onCheckStale?: () => Promise<void>;
}

/**
 * Icon indicator for data freshness status with tooltip.
 * - Loading spinner when checking
 * - Amber warning icon when documents have changed
 * - Tooltip explains status
 */
export function StaleIndicator({ isStale, isCheckingStale, onCheckStale }: StaleIndicatorProps) {
  if (isCheckingStale) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center">
            <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          <p>Checking for new documents...</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!isStale) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
          aria-label="New uploads detected (click to recheck)"
          onClick={() => onCheckStale?.()}
        >
          <AlertTriangle className="h-4 w-4 text-warning" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        <p>New uploads detected.</p>
        <p>Start a New Chat to include them in your analysis.</p>
      </TooltipContent>
    </Tooltip>
  );
}
