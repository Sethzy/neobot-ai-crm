/**
 * Main AI Analyst chat section component.
 * Orchestrates chat experience with messages and sticky footer.
 * Reports are displayed in the main AppSidebar when viewing a case.
 * @module components/analyst/analyst-section
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { AlertTriangle, ArrowDown } from '@/components/icons/lucide-compat';
import { useScrollToBottom } from '@/hooks/use-scroll-to-bottom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAnalystChat } from '@/hooks/use-analyst-chat';
import { docgenKeys } from '@/hooks/use-docgen';
import { useCaseSplits } from '@/hooks/use-splits';
import { supabase } from '@/lib/supabase';
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';
import { StickyFooter } from './sticky-footer';
import { QuickActionCards } from './quick-action-cards';
import { Button } from '@/components/ui/button';
import { validateTemplateFiles } from '@/lib/analyst/template-validation';

interface AnalystSectionProps {
  /** Case ID for data fetching */
  caseId: string;
}

/**
 * Main container for AI Analyst chat experience.
 * Full-width layout - reports sidebar moved to main AppSidebar.
 */
export function AnalystSection({ caseId }: AnalystSectionProps) {
  const [input, setInput] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [attachedImages, setAttachedImages] = useState<File[]>([]);
  const [templateFiles, setTemplateFiles] = useState<File[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const queryClient = useQueryClient();
  const { data: splits } = useCaseSplits(caseId);

  const {
    messages,
    send,
    error,
    reload,
    isStale,
    startFresh,
    isLoading,
    sessionTags,
    checkStale,
    isCheckingStale,
    wasInterrupted,
    uploadedFiles,
  } = useAnalystChat({ caseId });

  // Scroll behavior: Sticky scroll with auto-scroll during streaming
  const { containerRef, endRef, isAtBottom, scrollToBottom } =
    useScrollToBottom();

  // Initial mount: scroll to bottom instantly
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current && messages.length > 0) {
      scrollToBottom('instant');
      isInitialMount.current = false;
    }
  }, [messages.length, scrollToBottom]);

  // Derive available tags from splits data
  const availableTags = useMemo(() => {
    if (!splits) return [];
    const tagSet = new Set(splits.map((s) => s.tagId));
    return Array.from(tagSet).sort();
  }, [splits]);

  // Compute doc counts per tag
  const tagCounts = useMemo(() => {
    if (!splits) return {};
    return splits.reduce((acc, split) => {
      acc[split.tagId] = (acc[split.tagId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [splits]);

  // Filter is locked once a message has been sent (session started)
  const isFilterLocked = messages.length > 0;

  // Use sessionTags if filter is locked, otherwise use local state
  const effectiveTags = isFilterLocked ? (sessionTags ?? []) : selectedTags;

  /** Reset chat and clear tag selection */
  const handleNewChat = () => {
    startFresh();
    setSelectedTags([]);
    setAttachedImages([]);
    setTemplateFiles([]);
  };

  /** Handle Quick Export - calls /api/docgen/generate endpoint */
  const handleQuickExport = async (format: 'excel' | 'csv') => {
    // Use selected tags, or all available tags if none selected
    const tagsToExport = effectiveTags.length > 0 ? effectiveTags : availableTags;

    if (tagsToExport.length === 0) {
      toast.error('No documents to export');
      return;
    }

    console.log('[AnalystSection] handleQuickExport:', {
      format,
      caseId,
      tagsToExport,
    });

    setIsExporting(true);
    const loadingToast = toast.loading('Generating report...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/docgen/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          caseId,
          reportType: 'quick_report', // Quick Export always uses quick_report
          tagIds: tagsToExport,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Export failed');
      }

      const data = await response.json();

      // Refresh report history to show the new report
      queryClient.invalidateQueries({ queryKey: docgenKeys.history(caseId) });

      // Open download URL
      window.open(data.downloadUrl, '_blank');

      toast.success('Report generated successfully', { id: loadingToast });
    } catch (error) {
      console.error('[AnalystSection] Quick Export error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to generate report',
        { id: loadingToast }
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachedImages.length === 0) || isLoading) return;

    // Template files only sent on first message (when no messages exist yet)
    const filesToSend = messages.length === 0 ? templateFiles : undefined;

    // Validate template files before sending
    if (filesToSend && filesToSend.length > 0) {
      const validation = validateTemplateFiles(filesToSend);
      if (!validation.valid) {
        validation.errors.forEach((err) => toast.error(err));
        return;
      }
    }

    send(input, selectedTags, attachedImages, filesToSend);
    setInput('');
    setAttachedImages([]);
    // Clear template files after first message is sent
    if (filesToSend) setTemplateFiles([]);

    // Fresh Canvas: scroll user message to top of viewport for clean AI response area
    requestAnimationFrame(() => {
      const userMsgs = containerRef.current?.querySelectorAll('[data-message-role="user"]');
      userMsgs?.[userMsgs.length - 1]?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  };

  /** Handle quick action card click - fills input with template */
  const handleSelectAction = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages scroll area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto touch-pan-y overscroll-contain relative"
        style={{ willChange: 'scroll-position' }}
      >
        <div className="max-w-3xl mx-auto px-4 py-6">
          {/* Subtle hint at top during streaming */}
          {isLoading && (
            <p className="text-xs text-muted-foreground text-center mb-4">
              Keep this case open while generating
            </p>
          )}

          {messages.length === 0 ? (
            <EmptyState onSelectAction={handleSelectAction} />
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              {/* Inline warning when stream was interrupted */}
              {wasInterrupted && !isLoading && (
                <div className="p-3 rounded-lg bg-warning/5 border border-warning/20 flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 text-warning" />
                  <span>Response may be incomplete due to connection interruption.</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="ml-auto p-0 h-auto text-warning hover:opacity-80"
                    onClick={() => reload()}
                  >
                    Regenerate
                  </Button>
                </div>
              )}
              {/* Scroll anchor for sticky scroll during streaming */}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Scroll to bottom button - shows when user scrolls up */}
        {!isAtBottom && messages.length > 0 && (
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10
                       rounded-full border bg-background p-2 shadow-lg
                       hover:bg-accent transition-colors"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Error state with retry */}
      {error && (
        <div className="max-w-3xl mx-auto w-full px-4 mb-4">
          <div className="p-3 rounded-lg bg-destructive/5 text-destructive flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>An error occurred.</span>
            <Button
              variant="link"
              size="sm"
              onClick={() => reload()}
              className="text-destructive p-0 h-auto font-semibold"
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Sticky Footer with controls */}
      <StickyFooter
        onNewChat={handleNewChat}
        onQuickExport={handleQuickExport}
        isExporting={isExporting}
        isStale={isStale}
        onCheckStale={checkStale}
        isCheckingStale={isCheckingStale}
        isStreaming={isLoading}
      >
        {/* Show uploaded template files when session is active */}
        {uploadedFiles && uploadedFiles.length > 0 && (
          <div className="max-w-3xl mx-auto mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Templates:</span>
            {uploadedFiles.map((f, i) => (
              <span key={i} className="bg-muted px-1.5 py-0.5 rounded text-foreground">
                {f.name}
              </span>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <ChatInput
            value={input}
            onChange={setInput}
            isLoading={isLoading}
            availableTags={availableTags}
            selectedTags={effectiveTags}
            onTagChange={setSelectedTags}
            isFilterLocked={isFilterLocked}
            tagCounts={tagCounts}
            attachedImages={attachedImages}
            onImagesChange={setAttachedImages}
            templateFiles={isFilterLocked ? [] : templateFiles}
            onTemplateFilesChange={setTemplateFiles}
          />
        </form>
      </StickyFooter>
    </div>
  );
}

interface EmptyStateProps {
  /** Called when user clicks a quick action card */
  onSelectAction: (prompt: string) => void;
}

import { Sparkles } from '@/components/icons/lucide-compat';

/** Empty state with quick action cards and prompt */
function EmptyState({ onSelectAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] px-4 animate-in fade-in duration-500">
      <div className="flex flex-col items-center gap-6 max-w-2xl w-full">
        {/* Brand/Greeting */}
        <div className="flex flex-col items-center gap-4 text-center mb-4">
          <div className="flex h-12 w-12 rotate-3 transform items-center justify-center rounded-2xl bg-primary/10 transition-transform hover:rotate-6">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-3xl font-serif font-medium tracking-tight text-foreground">
            What should I work on?
          </h2>
        </div>

        {/* Action Cards */}
        <QuickActionCards onSelectAction={onSelectAction} />
      </div>
    </div>
  );
}
