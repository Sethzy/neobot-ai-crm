/**
 * Instructions tab with Novel WYSIWYG editor for editing SOP files.
 * Reads/writes markdown content from Supabase Storage.
 * @module components/automations/automation-instructions
 */
"use client";

import { useState } from "react";
import { EditorContent, EditorRoot, type EditorInstance } from "novel";
import { useDebouncedCallback } from "use-debounce";

import { useTriggerInstructions } from "@/hooks/use-trigger-instructions";

interface AutomationInstructionsProps {
  instructionPath: string | null;
}

/**
 * Converts plain markdown text to a simple Tiptap JSON document.
 * Each line becomes a paragraph node.
 */
function markdownToTiptapJson(markdown: string) {
  const lines = markdown.split("\n");
  const content = lines.map((line) => {
    if (!line.trim()) {
      return { type: "paragraph" };
    }
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      return {
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: [{ type: "text", text: headingMatch[2] }],
      };
    }
    return {
      type: "paragraph",
      content: [{ type: "text", text: line }],
    };
  });

  return { type: "doc", content };
}

/** Serializes Tiptap JSON back to markdown text to preserve formatting on save. */
function tiptapJsonToMarkdown(doc: { type: string; content?: Array<Record<string, unknown>> }): string {
  if (!doc.content) return "";
  return doc.content
    .map((node) => {
      if (node.type === "heading") {
        const level = (node.attrs as { level: number })?.level ?? 1;
        const text = nodeText(node);
        return `${"#".repeat(level)} ${text}`;
      }
      if (node.type === "paragraph") {
        return nodeText(node);
      }
      return nodeText(node);
    })
    .join("\n");
}

function nodeText(node: Record<string, unknown>): string {
  if (!node.content || !Array.isArray(node.content)) return "";
  return (node.content as Array<{ type: string; text?: string }>)
    .map((child) => child.text ?? "")
    .join("");
}

export function AutomationInstructions({ instructionPath }: AutomationInstructionsProps) {
  const { data: content, isLoading, save } = useTriggerInstructions(instructionPath);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const debouncedSave = useDebouncedCallback(async (editor: EditorInstance) => {
    setSaveStatus("saving");
    const json = editor.getJSON();
    const markdown = tiptapJsonToMarkdown(json as { type: string; content?: Array<Record<string, unknown>> });
    try {
      await save.mutateAsync(markdown);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("idle");
    }
  }, 1000);

  if (!instructionPath) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">
          No instruction file configured for this automation.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-3/4 rounded bg-muted/30" />
        <div className="h-4 w-1/2 rounded bg-muted/30" />
        <div className="h-4 w-2/3 rounded bg-muted/30" />
      </div>
    );
  }

  const initialContent = content ? markdownToTiptapJson(content) : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{instructionPath}</p>
        {saveStatus === "saving" ? (
          <span className="text-xs text-muted-foreground">Saving...</span>
        ) : saveStatus === "saved" ? (
          <span className="text-xs text-success">Saved</span>
        ) : null}
      </div>
      <div className="rounded-xl border border-border/40 bg-card shadow-sm">
        <EditorRoot>
          <EditorContent
            initialContent={initialContent}
            onUpdate={({ editor }) => {
              setSaveStatus("idle");
              void debouncedSave(editor);
            }}
            className="prose prose-sm dark:prose-invert max-w-none p-6 focus:outline-none"
          />
        </EditorRoot>
      </div>
    </div>
  );
}
