/**
 * Session controls: New Chat, Quick Export, and Stale indicator.
 * Displayed in the sticky footer above the input area.
 * @module components/analyst/session-controls
 */
import { Download, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StaleIndicator } from './stale-indicator';
import { ToolsDropdown } from './tools-dropdown';

interface SessionControlsProps {
  /** Called when user clicks "New Chat" to reset the session */
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
}

/**
 * Session controls with New Chat, Quick Export, and Stale indicator.
 * New Chat is always visible. Stale indicator on the right.
 */
export function SessionControls({
  onNewChat,
  onQuickExport,
  isExporting,
  isStale,
  isCheckingStale,
  onCheckStale,
  isStreaming,
}: SessionControlsProps) {
  return (
    <div className="flex items-end justify-between w-full">
      {/* Left side: Tools Dropdown */}
      <ToolsDropdown />

      {/* Right side: Stale + New Chat + Export Controls */}
      <div className="flex items-center gap-2">
        <StaleIndicator 
          isStale={isStale} 
          isCheckingStale={isCheckingStale} 
          onCheckStale={onCheckStale}
        />

        <Button variant="ghost" size="sm" onClick={onNewChat} disabled={isStreaming}>
          <RotateCcw className="h-4 w-4 mr-2" />
          New Chat
        </Button>

        {/* Quick export button - triggers Excel download directly */}
        <Button
          size="sm"
          disabled={isExporting}
          onClick={() => onQuickExport('excel')}
          className="bg-[#024F46] hover:bg-[#1B4332] text-white border-0 ring-0 focus-visible:ring-0"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {isExporting ? 'Exporting...' : 'Export Totals'}
        </Button>
      </div>
    </div>
  );
}
