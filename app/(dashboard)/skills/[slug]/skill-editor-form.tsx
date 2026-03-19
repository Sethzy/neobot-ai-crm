/**
 * Client component for editing a skill's SKILL.md content.
 * Validates frontmatter on save. Reset updates local state explicitly.
 * @module app/(dashboard)/skills/[slug]/skill-editor-form
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { resetSkillToDefault, saveSkillContent } from "@/lib/runner/skills/skill-actions";

interface Props {
  slug: string;
  initialContent: string;
  canReset: boolean;
}

export function SkillEditorForm({ slug, initialContent, canReset }: Props) {
  const [content, setContent] = useState(initialContent);
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
      const result = await resetSkillToDefault(slug);
      if (result.success && result.content) {
        setContent(result.content);
        setMessage({ text: "Reset to default.", isError: false });
        router.refresh();
      } else {
        setMessage({ text: result.error ?? "Failed to reset.", isError: true });
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
          {canReset && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isPending}
            >
              Reset to default
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <Textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setMessage(null);
        }}
        className="font-mono text-sm min-h-[500px]"
        disabled={isPending}
      />

      {message && (
        <p className={message.isError ? "text-destructive text-sm" : "text-muted-foreground text-sm"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
