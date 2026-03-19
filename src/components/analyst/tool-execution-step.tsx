/**
 * Collapsible code sandbox step display (TypingMind-inspired).
 * Shows tool execution state with expandable code and output.
 * @module components/analyst/tool-execution-step
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, Loader2, Check, X, Copy, SquareTerminal } from '@/components/icons/lucide-compat';

/** AI SDK dynamic-tool part states */
type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied';

interface ToolExecutionStepProps {
  /** Current execution state */
  state: ToolState;
  /** Name of the tool being executed (bash, str_replace_editor, code_execution, etc.) */
  toolName: string;
  /** Input containing the code/command to execute */
  input?: Record<string, unknown>;
  /** Output from tool execution */
  output?: { stdout?: string; stderr?: string } | unknown;
  /** Error message if execution failed */
  error?: string;
}

/**
 * Extract displayable code from various tool input structures.
 * Each tool type stores code/commands in different input fields.
 */
function extractToolCode(toolName: string, input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined;

  switch (toolName) {
    case 'bash':
    case 'bash_code_execution':
      return input.command as string | undefined;

    case 'str_replace_editor':
    case 'text_editor_code_execution': {
      const command = input.command as string | undefined;
      // For CREATE: show the file_text (the actual code being created)
      if (command === 'create' && input.file_text) {
        return input.file_text as string;
      }
      // For VIEW: show "view /path/to/file"
      if (command === 'view' && input.path) {
        return `view ${input.path}`;
      }
      // For EDIT: show the new content
      if (input.new_str) {
        return input.new_str as string;
      }
      // Fallback for file_text without command (backwards compat)
      if (input.file_text) {
        return input.file_text as string;
      }
      return input.content as string | undefined;
    }

    case 'code_execution':
      return input.code as string | undefined;

    default:
      // For unknown tools, try common field names or stringify the input
      if (typeof input.code === 'string') return input.code;
      if (typeof input.command === 'string') return input.command;
      return JSON.stringify(input, null, 2);
  }
}

/**
 * Get a short preview of the code for collapsed state.
 * Shows first line, truncated, with meaningful content.
 */
function getCodePreview(code: string | undefined): string {
  if (!code) return '';
  // Get first line, trim whitespace
  const firstLine = code.split('\n')[0]?.trim() ?? '';
  return firstLine;
}

/**
 * Detect if this is a text_editor view operation.
 */
function isViewOperation(toolName: string, input?: Record<string, unknown>): boolean {
  return (toolName === 'str_replace_editor' || toolName === 'text_editor_code_execution') && input?.command === 'view';
}

/**
 * Extract output text for display from various output structures.
 */
function extractOutputText(output?: { stdout?: string; stderr?: string } | unknown): { stdout?: string; stderr?: string } {
  if (!output) return {};

  // Handle standard stdout/stderr structure
  if (typeof output === 'object' && output !== null) {
    const out = output as { stdout?: string; stderr?: string };
    return { stdout: out.stdout, stderr: out.stderr };
  }

  // Handle string output
  if (typeof output === 'string') return { stdout: output };

  return {};
}

/**
 * Extract view operation result content from output.
 * For str_replace_editor view, the result is usually a string or object with content.
 */
function extractViewContent(output?: { stdout?: string; stderr?: string } | unknown): string | undefined {
  if (!output) return undefined;

  // Handle string output directly
  if (typeof output === 'string') return output;

  // Handle object with content or text fields
  if (typeof output === 'object' && output !== null) {
    const out = output as Record<string, unknown>;
    if (typeof out.content === 'string') return out.content;
    if (typeof out.text === 'string') return out.text;
    if (typeof out.stdout === 'string') return out.stdout;
  }

  return undefined;
}

/**
 * Copy button with feedback.
 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't toggle expand
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1 rounded hover:bg-muted-foreground/10 transition-colors"
      title="Copy code"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

/**
 * Collapsible code sandbox step showing execution status.
 * Inspired by TypingMind's clean, professional design.
 */
export function ToolExecutionStep({ state, toolName, input, output, error }: ToolExecutionStepProps) {
  const [expanded, setExpanded] = useState(false);

  const code = extractToolCode(toolName, input);
  const preview = getCodePreview(code);
  const { stdout, stderr } = extractOutputText(output);
  const isView = isViewOperation(toolName, input);
  const viewContent = isView ? extractViewContent(output) : undefined;

  // Show Output section for execution tools (bash, code_execution) but not file operations
  const showOutputSection = toolName === 'bash' || toolName === 'bash_code_execution' || toolName === 'code_execution';

  const isLoading = ['input-streaming', 'input-available', 'approval-requested', 'approval-responded'].includes(state);
  const isError = ['output-error', 'output-denied'].includes(state);
  const isSuccess = state === 'output-available';

  return (
    <div className="my-1 w-full">
      {/* Collapsed header - clean row style */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex items-center gap-2 w-full text-left py-1 hover:bg-muted/50 rounded transition-colors"
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground shrink-0 transition-transform',
            expanded && 'rotate-90'
          )}
        />
        <SquareTerminal className="h-4 w-4 text-muted-foreground/70 shrink-0" />
        <span className="text-sm font-medium shrink-0 text-foreground/80">Code Sandbox</span>

        {/* Status icon - right after label */}
        {isLoading && (
          <Loader2 data-testid="status-loading" className="h-3.5 w-3.5 animate-spin text-muted-foreground/70 shrink-0 ml-1" />
        )}
        {isSuccess && (
          <div className="flex items-center justify-center h-4 w-4 rounded-full bg-success/15 ml-1">
            <Check data-testid="status-success" className="h-2.5 w-2.5 text-success shrink-0" strokeWidth={3} />
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center h-4 w-4 rounded-full bg-destructive/15 ml-1">
             <X data-testid="status-error" className="h-2.5 w-2.5 text-destructive shrink-0" strokeWidth={3} />
          </div>
        )}

        {/* Code preview - fills remaining space */}
        {preview && (
          <code className="text-[13px] text-muted-foreground/60 truncate font-mono ml-1.5 flex-1">
            {preview}
          </code>
        )}
      </button>

      {/* Expanded content - TypingMind style */}
      {expanded && (
        <div className="ml-6 mt-2 space-y-3">
          {/* For view operations: show the viewed file content */}
          {isView && viewContent && (
            <div className="relative w-full rounded-md bg-muted/50 border border-border/50 overflow-hidden">
              <div className="absolute top-2 right-2 z-10">
                <CopyButton text={viewContent} />
              </div>
              <pre className="p-3 pr-10 text-[13px] font-mono leading-relaxed overflow-x-auto max-h-[300px] overflow-y-auto text-foreground/90">
                {viewContent}
              </pre>
            </div>
          )}

          {/* For non-view operations: show the code/command */}
          {!isView && code && (
            <div className="relative w-full rounded-md bg-muted/50 border border-border/50 overflow-hidden">
              <div className="absolute top-2 right-2 z-10">
                <CopyButton text={code} />
              </div>
              <pre className="p-3 pr-10 text-[13px] font-mono leading-relaxed overflow-x-auto max-h-[300px] overflow-y-auto text-foreground/90">
                {code}
              </pre>
            </div>
          )}

          {/* Stdout - simple label style like TypingMind */}
          {showOutputSection && stdout && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Output</div>
              <div className="rounded-md bg-muted/50 border border-border/50 overflow-hidden">
                <pre className="p-3 text-[13px] font-mono leading-relaxed overflow-x-auto max-h-[200px] overflow-y-auto text-foreground/90">
                  {stdout}
                </pre>
              </div>
            </div>
          )}

          {/* Stderr - simple label style */}
          {showOutputSection && stderr && (
            <div>
              <div className="text-sm text-warning mb-1">Stderr:</div>
              <div className="rounded-lg bg-warning/10 overflow-hidden">
                <pre className="p-3 text-sm font-mono overflow-x-auto max-h-[200px] overflow-y-auto text-warning">
                  {stderr}
                </pre>
              </div>
            </div>
          )}

          {/* Error - simple label style */}
          {error && (
            <div>
              <div className="text-sm text-destructive mb-1">Error:</div>
              <div className="rounded-lg bg-destructive/10 overflow-hidden">
                <pre className="p-3 text-sm font-mono overflow-x-auto max-h-[200px] overflow-y-auto text-destructive">
                  {error}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
