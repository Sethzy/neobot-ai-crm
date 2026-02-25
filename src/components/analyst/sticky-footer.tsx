/**
 * Sticky footer with controls row and input area.
 * Controls (New Chat, Quick Export, Stale indicator) above input.
 * @module components/analyst/sticky-footer
 */
import { SessionControls } from './session-controls';

interface StickyFooterProps {
  /** Called when user clicks New Chat */
  onNewChat: () => void;
  /** Called when user clicks Quick Export */
  onQuickExport: (format: 'excel' | 'csv') => void;
  /** Whether an export is in progress */
  isExporting: boolean;
  /** Whether data is stale (documents changed) */
  isStale: boolean;
  /** Whether stale check is in progress */
  isCheckingStale?: boolean;
  /** Trigger manual stale check */
  onCheckStale?: () => Promise<void>;
  /** Whether chat is currently streaming a response */
  isStreaming?: boolean;
  /** Input component slot */
  children: React.ReactNode;
}

/**
 * Sticky footer with 2 zones:
 * - Zone 1: Controls row (New Chat, Quick Export, Stale indicator)
 * - Zone 2: Input (passed as children)
 */
export function StickyFooter({
  onNewChat,
  onQuickExport,
  isExporting,
  isStale,
  isCheckingStale,
  onCheckStale,
  isStreaming,
  children,
}: StickyFooterProps) {
  return (
    <div className="bg-background">
      {/* Zone 1: Controls row */}
      <div className="px-4 pt-4 pb-2">
        <div className="max-w-3xl mx-auto px-1">
          <SessionControls
            onNewChat={onNewChat}
            onQuickExport={onQuickExport}
            isExporting={isExporting}
            isStale={isStale}
            isCheckingStale={isCheckingStale}
            onCheckStale={onCheckStale}
            isStreaming={isStreaming}
          />
        </div>
      </div>

      {/* Zone 2: Input (passed as children) */}
      <div className="px-4 pb-4">
        <div className="max-w-3xl mx-auto">{children}</div>
      </div>
    </div>
  );
}
