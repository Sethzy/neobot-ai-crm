/**
 * Instructions tab for editing automation SOP markdown files.
 * Reads and writes plain markdown content from Supabase Storage.
 * @module components/automations/automation-instructions
 */
"use client";

import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { useTriggerInstructions } from "@/hooks/use-trigger-instructions";

interface AutomationInstructionsProps {
  triggerId: string;
  instructionPath: string | null;
}

export function AutomationInstructions({
  triggerId,
  instructionPath,
}: AutomationInstructionsProps) {
  const {
    data,
    error,
    isError,
    isLoading,
    save,
  } = useTriggerInstructions(triggerId, instructionPath);

  if (!instructionPath) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">
          No instruction file configured for this automation.
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 shadow-sm">
        <p className="text-sm text-destructive">Unable to load instructions.</p>
        {error instanceof Error ? (
          <p className="mt-2 text-xs text-muted-foreground">{error.message}</p>
        ) : null}
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

  return (
    <div className="space-y-2">
      <LoadedAutomationInstructionsEditor
        initialContent={data?.content ?? ""}
        instructionPath={data?.displayPath ?? instructionPath}
        key={`${data?.displayPath ?? instructionPath}:${data?.content ?? ""}`}
        saveInstructions={save.mutateAsync}
      />
    </div>
  );
}

const FRONTMATTER_PATTERN = /^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/u;

/**
 * Splits a markdown file into its YAML frontmatter block (if any) and the
 * body. The frontmatter is preserved verbatim so round-tripping through the
 * editor doesn't drop or reformat it.
 */
function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { frontmatter: "", body: content };
  }
  return { frontmatter: match[1], body: content.slice(match[1].length) };
}

interface LoadedAutomationInstructionsEditorProps {
  initialContent: string;
  instructionPath: string;
  saveInstructions: (value: string) => Promise<unknown>;
}

function LoadedAutomationInstructionsEditor({
  initialContent,
  instructionPath,
  saveInstructions,
}: LoadedAutomationInstructionsEditorProps) {
  const { frontmatter, body } = splitFrontmatter(initialContent);
  const [draft, setDraft] = useState(body);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const debouncedSave = useDebouncedCallback(async (nextDraft: string) => {
    setSaveStatus("saving");
    try {
      await saveInstructions(`${frontmatter}${nextDraft}`);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("idle");
    }
  }, 1000);

  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Instructions</span>
          <code className="rounded-full bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground shadow-sm">
            {instructionPath}
          </code>
          <span>Markdown source</span>
        </div>
        {saveStatus === "saving" ? (
          <span className="text-xs text-muted-foreground">Saving...</span>
        ) : saveStatus === "saved" ? (
          <span className="text-xs text-success">Saved</span>
        ) : null}
      </div>

      <MarkdownEditor
        ariaLabel="Automation instructions"
        compact
        onChange={(nextDraft) => {
          setDraft(nextDraft);
          setSaveStatus("idle");
          void debouncedSave(nextDraft);
        }}
        placeholder="Write markdown instructions for this automation. Type / for blocks."
        value={draft}
      />
    </div>
  );
}
