/**
 * Client editor for the agent-context (memory) settings page.
 * Owns local form state, dirty tracking, and save feedback.
 *
 * @module components/settings/agent-context-form
 */
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MarkdownEditor } from "@/components/ui/markdown-editor";

const MAX_CONTEXT_LENGTH = 100_000;

interface AgentContextFormProps {
  initialClientProfile: string;
  initialUserPreferences: string;
}

interface SavedAgentContext {
  clientProfile: string;
  userPreferences: string;
}

function countLabel(value: string): string {
  return `${value.length.toLocaleString()} / ${MAX_CONTEXT_LENGTH.toLocaleString()} chars`;
}

export function AgentContextForm({
  initialClientProfile,
  initialUserPreferences,
}: AgentContextFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [savedContext, setSavedContext] = useState<SavedAgentContext>({
    clientProfile: initialClientProfile,
    userPreferences: initialUserPreferences,
  });
  const [clientProfile, setClientProfile] = useState(initialClientProfile);
  const [userPreferences, setUserPreferences] = useState(initialUserPreferences);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const hasChanges =
    clientProfile !== savedContext.clientProfile
    || userPreferences !== savedContext.userPreferences;

  function handleSave() {
    startTransition(async () => {
      setMessage(null);
      try {
        const response = await fetch("/api/settings/agent-context", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_profile: clientProfile,
            user_preferences: userPreferences,
          }),
        });

        const payload = (await response.json()) as
          | { error: string }
          | { client_profile: string | null; user_preferences: string | null };

        if (!response.ok || "error" in payload) {
          setMessage({
            text:
              "error" in payload && payload.error
                ? payload.error
                : "Failed to save agent context.",
            isError: true,
          });
          return;
        }

        const nextSavedContext = {
          clientProfile: payload.client_profile ?? "",
          userPreferences: payload.user_preferences ?? "",
        };
        setSavedContext(nextSavedContext);
        setClientProfile(nextSavedContext.clientProfile);
        setUserPreferences(nextSavedContext.userPreferences);
        setMessage({ text: "Saved.", isError: false });
        router.refresh();
      } catch {
        setMessage({
          text: "Failed to save agent context.",
          isError: true,
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-1">
            <div className="space-y-1">
              <CardDescription className="type-kicker">Agent personality</CardDescription>
              <CardTitle className="type-toolbar-title">Client profile</CardTitle>
            </div>
            <span className="shrink-0 rounded-full border border-app-border-subtle bg-app-surface-muted px-3 py-1.5 text-caption font-medium leading-none tracking-[0.02em] text-muted-foreground shadow-sm">
              {countLabel(clientProfile)}
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="measure-copy max-w-[34rem] type-toolbar-description">
              Use this for voice, operating style, business context, and persistent instructions
              that should shape how Sunder acts for this workspace.
            </p>
            <MarkdownEditor
              ariaLabel="Client profile"
              compact
              disabled={isPending}
              editorClassName="min-h-[360px]"
              maxLength={MAX_CONTEXT_LENGTH}
              placeholder="Example: Be concise, action-oriented, and avoid sales fluff. We work mostly with first-time buyers in Singapore."
              value={clientProfile}
              onChange={(nextValue) => {
                setClientProfile(nextValue);
                setMessage(null);
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-1">
            <div className="space-y-1">
              <CardDescription className="type-kicker">User profile</CardDescription>
              <CardTitle className="type-toolbar-title">User preferences</CardTitle>
            </div>
            <span className="shrink-0 rounded-full border border-app-border-subtle bg-app-surface-muted px-3 py-1.5 text-caption font-medium leading-none tracking-[0.02em] text-muted-foreground shadow-sm">
              {countLabel(userPreferences)}
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="measure-copy max-w-[34rem] type-toolbar-description">
              Use this for how the user prefers to communicate and work: tone, decision style,
              formatting preferences, and durable personal context.
            </p>
            <MarkdownEditor
              ariaLabel="User preferences"
              compact
              disabled={isPending}
              editorClassName="min-h-[360px]"
              maxLength={MAX_CONTEXT_LENGTH}
              placeholder="Example: Prefer short bullet lists, flag risks early, and draft client-facing messages in a warm but direct tone."
              value={userPreferences}
              onChange={(nextValue) => {
                setUserPreferences(nextValue);
                setMessage(null);
              }}
            />
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-app-border-subtle bg-background/85 px-4 py-3 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="type-toolbar-description">
            Markdown-friendly text is fine. Each field is capped at {MAX_CONTEXT_LENGTH.toLocaleString()} characters.
          </p>
          {message ? (
            <p className={message.isError ? "type-row-meta text-destructive" : "type-row-meta"}>
              {message.text}
            </p>
          ) : null}
        </div>
        <Button
          disabled={isPending || !hasChanges}
          onClick={handleSave}
          className="w-full sm:w-auto"
        >
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
