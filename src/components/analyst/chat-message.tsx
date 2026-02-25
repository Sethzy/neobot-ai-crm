/**
 * Chat message renderer with parts-based content.
 * Handles text, files, tool calls, and thinking blocks.
 * @module components/analyst/chat-message
 */
import { memo, useState } from 'react';
import Image from "next/image";
import type { UIMessage } from '@/hooks/use-analyst-chat';
import ReactMarkdown, { type Components } from 'react-markdown';
import { cn } from '@/lib/utils';
import { Brain, ChevronDown } from 'lucide-react';
import { FileDownload } from './file-download';
import { ToolExecutionStep } from './tool-execution-step';

interface ChatMessageProps {
  /** The message to render */
  message: UIMessage;
}

/** Styled markdown components for chat messages */
const markdownComponents: Components = {
  p: ({ children }) => <p className="my-1.5">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="list-disc pl-4 my-1.5 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 my-1.5 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  h1: ({ children }) => <h1 className="text-lg font-semibold mt-3 mb-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-semibold mt-2.5 mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
  code: ({ children }) => <code className="bg-muted px-1 py-0.5 rounded text-[13px]">{children}</code>,
  pre: ({ children }) => <pre className="bg-muted p-3 rounded-lg my-2 overflow-x-auto text-[13px]">{children}</pre>,
};

/**
 * Renders a chat message with bubble layout.
 * Supports text, thinking blocks (nested), files, and dynamic tools.
 * Files are grouped and rendered at the bottom of the message.
 *
 * Memoized to prevent re-renders during streaming when message hasn't changed.
 */
export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  // Separate file parts from other content for bottom positioning
  const fileParts = message.parts.filter((p) => p.type === 'file');
  const otherParts = message.parts.filter((p) => p.type !== 'file');

  return (
    <div
      data-message-role={message.role}
      className={cn(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div className={cn(
        'text-sm',
        isUser
          ? 'max-w-[85%] bg-zinc-100 dark:bg-zinc-800 text-foreground rounded-2xl px-5 py-3.5'
          : 'w-full bg-transparent px-0 py-2' // Full width assistant message
      )}>
        {/* Main content (text, reasoning, tools) */}
        {otherParts.map((part, index) => {
          const key = `${message.id}-${index}`;

          switch (part.type) {
            case 'text':
              return (
                <div key={key} className={cn(
                  "leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                  // Add margin if not the first element to separate from prev content
                  index > 0 && "mt-3"
                )}>
                  <ReactMarkdown components={markdownComponents}>
                    {part.text}
                  </ReactMarkdown>
                </div>
              );

            case 'reasoning':
              return (
                <ThinkingBlock
                  key={key}
                  content={'text' in part ? part.text : ''}
                />
              );

            case 'dynamic-tool': {
              // Render ALL dynamic-tool parts (bash, str_replace_editor, code_execution, etc.)
              const errorText = part.state === 'output-error'
                ? ((part as { errorText?: string }).errorText ?? String(part.output ?? ''))
                : undefined;
              return (
                <div key={key} className="mt-2 w-full text-left">
                  <ToolExecutionStep
                    state={part.state}
                    toolName={part.toolName}
                    input={part.input as Record<string, unknown>}
                    output={part.state === 'output-available' ? part.output : undefined}
                    error={errorText}
                  />
                </div>
              );
            }

            case 'image':
              return (
                <Image
                  key={key}
                  src={`data:${part.mediaType};base64,${part.data}`}
                  alt="Attached image"
                  width={200}
                  height={200}
                  unoptimized
                  className="max-w-[200px] max-h-[200px] rounded-lg object-contain"
                />
              );

            default:
              return null;
          }
        })}

        {/* Files section - rendered at bottom of message */}
        {fileParts.length > 0 && (
          <div className="mt-4 space-y-2 text-left animate-in fade-in duration-300">
            {fileParts.map((part, index) => {
              if (part.type !== 'file') return null;
              return (
                <FileDownload
                  key={`${message.id}-file-${index}`}
                  url={part.url}
                  mediaType={part.mediaType}
                  filename={part.filename}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

/** Collapsible thinking block - neutral styling per design standards */
function ThinkingBlock({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="my-2 rounded-lg border border-border bg-background/50 overflow-hidden text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <Brain className="h-3.5 w-3.5" />
        <span>Thinking Process</span>
        <ChevronDown className={cn(
          'h-3.5 w-3.5 ml-auto transition-transform',
          isOpen && 'rotate-180'
        )} />
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pt-1 text-xs text-muted-foreground whitespace-pre-wrap border-t border-border/50 bg-background/30">
          {content}
        </div>
      )}
    </div>
  );
}
