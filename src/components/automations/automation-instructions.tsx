/**
 * Instructions tab for editing automation SOP markdown files.
 * Reads and writes plain markdown content from Supabase Storage.
 * @module components/automations/automation-instructions
 */
"use client";

import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { MarkdownTextarea } from "@/components/ui/markdown-textarea";
import { useTriggerInstructions } from "@/hooks/use-trigger-instructions";

interface AutomationInstructionsProps {
  instructionPath: string | null;
}

export function AutomationInstructions({ instructionPath }: AutomationInstructionsProps) {
  const {
    data: content,
    error,
    isError,
    isLoading,
    save,
  } = useTriggerInstructions(instructionPath);
  const [draft, setDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    setDraft(content ?? "");
    setSaveStatus("idle");
  }, [content, instructionPath]);

  const debouncedSave = useDebouncedCallback(async (nextDraft: string) => {
    setSaveStatus("saving");
    try {
      await save.mutateAsync(nextDraft);
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
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{instructionPath}</p>
        {saveStatus === "saving" ? (
          <span className="text-xs text-muted-foreground">Saving...</span>
        ) : saveStatus === "saved" ? (
          <span className="text-xs text-success">Saved</span>
        ) : null}
      </div>
      <div className="rounded-xl border border-border/40 bg-card shadow-sm">
        <MarkdownTextarea
          value={draft}
          onChange={(event) => {
            const nextDraft = event.target.value;
            setDraft(nextDraft);
            setSaveStatus("idle");
            void debouncedSave(nextDraft);
          }}
          className="min-h-[420px] w-full rounded-xl border-0 bg-card p-6 shadow-none focus-visible:border-0 focus-visible:ring-0"
          placeholder="Write markdown instructions for this automation."
          aria-label="Automation instructions"
        />
      </div>
    </div>
  );
}
