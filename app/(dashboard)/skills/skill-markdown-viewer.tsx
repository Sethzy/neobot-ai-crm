/**
 * Read-only skill markdown wrapper around the shared presentational renderer.
 *
 * @module app/(dashboard)/skills/skill-markdown-viewer
 */
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";

interface SkillMarkdownViewerProps {
  className?: string;
  content: string;
  compact?: boolean;
}

export function SkillMarkdownViewer({
  className,
  content,
  compact,
}: SkillMarkdownViewerProps) {
  return (
    <MarkdownRenderer
      className={className}
      compact={compact}
      content={content}
    />
  );
}
