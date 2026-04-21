/**
 * Read-only skill markdown wrapper around the shared presentational renderer.
 *
 * @module app/(dashboard)/skills/skill-markdown-viewer
 */
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";

interface SkillMarkdownViewerProps {
  content: string;
}

export function SkillMarkdownViewer({ content }: SkillMarkdownViewerProps) {
  return <MarkdownRenderer content={content} />;
}
