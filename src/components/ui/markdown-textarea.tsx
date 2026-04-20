/**
 * Shared textarea styling for app-surface markdown editing.
 *
 * This is intentionally plain text, not a rich editor. It keeps markdown
 * source visible and predictable across settings/forms until the product has a
 * clear need for a single rich document editor surface.
 *
 * @module components/ui/markdown-textarea
 */
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface MarkdownTextareaProps extends React.ComponentProps<typeof Textarea> {}

export function MarkdownTextarea({
  className,
  autoCapitalize = "off",
  autoCorrect = "off",
  spellCheck = false,
  ...props
}: MarkdownTextareaProps) {
  return (
    <Textarea
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      spellCheck={spellCheck}
      className={cn(
        "resize-y font-mono text-sm leading-6 whitespace-pre-wrap",
        className,
      )}
      {...props}
    />
  );
}
