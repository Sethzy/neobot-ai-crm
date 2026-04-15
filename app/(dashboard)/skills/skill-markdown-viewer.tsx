/**
 * Read-only markdown renderer for skill definition content.
 * Uses react-markdown + remark-gfm. Elements are explicitly styled via the
 * components prop — no @tailwindcss/typography dependency needed.
 *
 * Special case: fenced blocks tagged ```markdown are rendered recursively as
 * actual markdown instead of as a code block. This lets SKILL.md authors show
 * formatted output templates without having to strip the fence.
 *
 * @module app/(dashboard)/skills/skill-markdown-viewer
 */
import type { Element, Text } from "hast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SkillMarkdownViewerProps {
  content: string;
}

export function SkillMarkdownViewer({ content }: SkillMarkdownViewerProps) {
  return (
    <div className="min-w-0 space-y-3 text-[15px] text-foreground/80">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1({ children }) {
            return (
              <h1 className="mt-5 mb-2 text-[15px] font-semibold tracking-tight text-foreground first:mt-0">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="mt-5 mb-1.5 text-[15px] font-semibold tracking-tight text-foreground first:mt-0">
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="mt-4 mb-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">
                {children}
              </h3>
            );
          },
          p({ children }) {
            return (
              <p className="leading-relaxed text-foreground/80">{children}</p>
            );
          },
          ul({ children }) {
            return (
              <ul className="list-disc space-y-1 pl-4 text-foreground/80">
                {children}
              </ul>
            );
          },
          ol({ children }) {
            return (
              <ol className="list-decimal space-y-1 pl-4 text-foreground/80">
                {children}
              </ol>
            );
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          strong({ children }) {
            return (
              <strong className="font-semibold text-foreground">
                {children}
              </strong>
            );
          },
          em({ children }) {
            return <em className="italic">{children}</em>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-border pl-4 text-muted-foreground italic">
                {children}
              </blockquote>
            );
          },
          hr() {
            return <hr className="border-border" />;
          },
          /**
           * Fenced code block. Two behaviours:
           *
           * 1. ```markdown blocks — rendered recursively as actual markdown.
           *    SKILL.md uses this for "Output Format" templates so authors can
           *    show formatted output without stripping the fence.
           *
           * 2. All other blocks — rendered as a scrollable monospace pre.
           *    [&_code] resets the inline-code bg/padding so block code
           *    doesn't get a double grey box from the code component below.
           */
          pre({ children, node }) {
            // Inspect the hast node to detect the language of the fenced block.
            const codeNode = (node as Element | undefined)?.children?.[0] as Element | undefined;
            const isMarkdownBlock =
              codeNode?.type === "element" &&
              codeNode.tagName === "code" &&
              (codeNode.properties?.className as string[] | undefined)?.includes(
                "language-markdown",
              );

            if (isMarkdownBlock) {
              // Extract raw text from the hast node (before react-markdown
              // processes it) and re-render it as proper markdown.
              const raw = (codeNode!.children as Text[])
                .filter((c) => c.type === "text")
                .map((c) => c.value)
                .join("");
              return (
                <div className="rounded border border-border/40 bg-muted/10 px-5 py-4">
                  <SkillMarkdownViewer content={raw} />
                </div>
              );
            }

            return (
              <pre className="w-full overflow-x-auto rounded border border-border bg-transparent p-3 font-mono text-[12px] leading-relaxed [&_code]:bg-transparent [&_code]:p-0 [&_code]:rounded-none">
                {children}
              </pre>
            );
          },
          /** Inline code — subtle pill. */
          code({ children }) {
            return (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border border-border bg-muted/40 px-3 py-2 text-left font-semibold text-foreground">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border border-border px-3 py-2 text-foreground/80">
                {children}
              </td>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
