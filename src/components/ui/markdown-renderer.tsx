/**
 * Shared presentational markdown renderer used across editable previews and
 * read-only documentation surfaces.
 *
 * The typography is intentionally opinionated so authored markdown reads like a
 * polished document instead of raw app text. Chat surfaces reuse the exported
 * class names to keep Streamdown output visually aligned with React Markdown
 * output.
 *
 * @module components/ui/markdown-renderer
 */
import type { Element, Text } from "hast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export const MARKDOWN_BODY_CLASSNAME = cn(
  "min-w-0 text-[15px] leading-7 text-foreground",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:font-serif [&_h1]:text-[1.75rem] [&_h1]:font-medium [&_h1]:leading-[1.2] [&_h1]:tracking-[-0.02em] [&_h1]:text-foreground",
  "[&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-[1.3rem] [&_h2]:font-medium [&_h2]:leading-[1.25] [&_h2]:tracking-tight [&_h2]:text-foreground",
  "[&_h3]:mt-6 [&_h3]:mb-1 [&_h3]:text-[0.95rem] [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:text-foreground",
  "[&_h4]:mt-5 [&_h4]:mb-1 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-foreground/90",
  "[&_p]:my-4 [&_p]:text-foreground/85",
  "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6",
  "[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6",
  "[&_li]:pl-1 [&_li>p]:my-0",
  "[&_blockquote]:my-6 [&_blockquote]:rounded-r-2xl [&_blockquote]:border-l-2 [&_blockquote]:border-stage-negotiation/35 [&_blockquote]:bg-stage-negotiation/5 [&_blockquote]:px-5 [&_blockquote]:py-3 [&_blockquote]:text-foreground/80",
  "[&_hr]:my-8 [&_hr]:border-border/60",
  "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:decoration-border [&_a]:underline-offset-4 [&_a:hover]:decoration-primary/60",
  "[&_img]:my-6 [&_img]:rounded-2xl [&_img]:border [&_img]:border-border/70",
  "[&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-border/70 [&_pre]:bg-muted/45 [&_pre]:px-4 [&_pre]:py-4 [&_pre]:text-[13px] [&_pre]:leading-6 [&_pre]:shadow-sm",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[13px]",
  "[&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em]",
  "[&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-sm",
  "[&_thead]:bg-muted/60",
  "[&_th]:border-b [&_th]:border-border/60 [&_th]:px-4 [&_th]:py-3 [&_th]:font-semibold [&_th]:text-foreground",
  "[&_td]:border-t [&_td]:border-border/40 [&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_td]:text-foreground/80",
  "[&_tbody_tr:nth-child(even)_td]:bg-muted/20",
  "[&_input[type='checkbox']]:mr-2 [&_input[type='checkbox']]:size-3.5 [&_input[type='checkbox']]:rounded-sm [&_input[type='checkbox']]:border [&_input[type='checkbox']]:border-border/70",
);

export const MARKDOWN_BODY_COMPACT_CLASSNAME = cn(
  "text-[13px] leading-6",
  "[&_h1]:mt-6 [&_h1]:text-[1.4rem]",
  "[&_h2]:mt-6 [&_h2]:text-[1.1rem]",
  "[&_h3]:mt-5 [&_h3]:text-[0.875rem]",
  "[&_h4]:mt-4 [&_h4]:text-[0.8125rem]",
  "[&_p]:my-3",
  "[&_ul]:my-3 [&_ul]:space-y-1.5",
  "[&_ol]:my-3 [&_ol]:space-y-1.5",
  "[&_blockquote]:my-4 [&_blockquote]:px-4 [&_blockquote]:py-2.5",
  "[&_pre]:my-4 [&_pre]:text-[12px]",
  "[&_th]:px-3 [&_th]:py-2.5",
  "[&_td]:px-3 [&_td]:py-2.5",
);

interface MarkdownRendererProps {
  content: string;
  className?: string;
  compact?: boolean;
}

/**
 * Renders markdown with shared typography, link handling, and fenced
 * `markdown` block recursion for nested templates/examples.
 */
export function MarkdownRenderer({
  content,
  className,
  compact = false,
}: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        MARKDOWN_BODY_CLASSNAME,
        compact && MARKDOWN_BODY_COMPACT_CLASSNAME,
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...props }) {
            const isExternalLink = typeof href === "string" && /^https?:\/\//.test(href);

            return (
              <a
                href={href}
                rel={isExternalLink ? "noopener noreferrer" : undefined}
                target={isExternalLink ? "_blank" : undefined}
                {...props}
              >
                {children}
              </a>
            );
          },
          pre({ children, node }) {
            const codeNode = (node as Element | undefined)?.children?.[0] as Element | undefined;
            const isMarkdownBlock =
              codeNode?.type === "element"
              && codeNode.tagName === "code"
              && (codeNode.properties?.className as string[] | undefined)?.includes(
                "language-markdown",
              );

            if (isMarkdownBlock) {
              const raw = (codeNode.children as Text[])
                .filter((child) => child.type === "text")
                .map((child) => child.value)
                .join("");

              return (
                <div className="my-6 rounded-2xl border border-border/70 bg-background/70 px-5 py-4 shadow-sm">
                  <MarkdownRenderer compact={compact} content={raw} />
                </div>
              );
            }

            return <pre>{children}</pre>;
          },
          code({ className: codeClassName, children, ...props }) {
            const isBlockCode = Boolean(codeClassName?.includes("language-"));

            if (isBlockCode) {
              return (
                <code className={codeClassName} {...props}>
                  {children}
                </code>
              );
            }

            return (
              <code className="markdown-inline-code" {...props}>
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className="my-6 overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
