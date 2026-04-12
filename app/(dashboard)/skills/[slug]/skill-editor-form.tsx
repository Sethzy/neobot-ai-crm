/**
 * Client component for viewing or editing a playbook.
 *
 * @module app/(dashboard)/skills/[slug]/skill-editor-form
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveSkillContent } from "@/lib/runner/skills/skill-actions";

import { duplicateSkillAction, resetSkillAction } from "../actions";

interface Props {
  slug: string;
  initialContent: string;
  predefinedContent: string;
  isCustomized: boolean;
}

export function SkillEditorForm({
  slug,
  initialContent,
  predefinedContent,
  isCustomized,
}: Props) {
  const [content, setContent] = useState(initialContent || predefinedContent);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const router = useRouter();

  function handleSave() {
    startTransition(async () => {
      setMessage(null);
      const result = await saveSkillContent(slug, content);
      if (result.success) {
        setMessage({ text: "Saved.", isError: false });
        router.refresh();
      } else {
        setMessage({ text: result.error ?? "Failed to save.", isError: true });
      }
    });
  }

  function handleReset() {
    startTransition(async () => {
      setMessage(null);
      try {
        await resetSkillAction(slug);
        setContent(predefinedContent);
        setMessage({ text: "Reset to predefined.", isError: false });
        router.refresh();
      } catch (error) {
        setMessage({
          text: error instanceof Error ? error.message : "Failed to reset.",
          isError: true,
        });
      }
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      setMessage(null);
      try {
        await duplicateSkillAction(slug);
        setMessage({ text: "Duplicated. You can edit it now.", isError: false });
        router.refresh();
      } catch (error) {
        setMessage({
          text: error instanceof Error ? error.message : "Failed to duplicate.",
          isError: true,
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{slug}</h1>
          <Link
            href="/skills"
            className="text-muted-foreground text-sm hover:underline"
          >
            ← Back to skills
          </Link>
        </div>
        <div className="flex gap-2">
          {isCustomized ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isPending}
            >
              Reset
            </Button>
          ) : null}
          {isCustomized ? (
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          ) : (
            <Button size="sm" onClick={handleDuplicate} disabled={isPending}>
              {isPending ? "Duplicating..." : "Duplicate to edit"}
            </Button>
          )}
        </div>
      </div>

      <Textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setMessage(null);
        }}
        className="font-mono text-sm min-h-[500px]"
        disabled={isPending || !isCustomized}
      />

      {message && (
        <p className={message.isError ? "text-destructive text-sm" : "text-muted-foreground text-sm"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
