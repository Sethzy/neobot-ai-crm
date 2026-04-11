/**
 * Client editor for the agent-context settings page.
 * Owns local form state, dirty tracking, and save feedback.
 *
 * @module app/(dashboard)/settings/agent-context/agent-context-form
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

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
      <div className="space-y-3">
        <Badge variant="outline" className="w-fit">
          Agent Context
        </Badge>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Agent context</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            These two fields are injected into each managed-agent kickoff. Keep them stable,
            durable, and high-signal.
          </p>
          <Link href="/settings" className="text-sm text-muted-foreground hover:underline">
            ← Back to settings
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <CardDescription>Agent personality</CardDescription>
                <CardTitle className="text-2xl">Client profile</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">
                {countLabel(clientProfile)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Use this for voice, operating style, business context, and persistent instructions
              that should shape how Sunder acts for this workspace.
            </p>
            <Textarea
              aria-label="Client profile"
              className="min-h-[360px] font-mono text-sm"
              disabled={isPending}
              maxLength={MAX_CONTEXT_LENGTH}
              placeholder="Example: Be concise, action-oriented, and avoid sales fluff. We work mostly with first-time buyers in Singapore."
              value={clientProfile}
              onChange={(event) => {
                setClientProfile(event.target.value);
                setMessage(null);
              }}
            />
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <CardDescription>User profile</CardDescription>
                <CardTitle className="text-2xl">User preferences</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">
                {countLabel(userPreferences)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Use this for how the user prefers to communicate and work: tone, decision style,
              formatting preferences, and durable personal context.
            </p>
            <Textarea
              aria-label="User preferences"
              className="min-h-[360px] font-mono text-sm"
              disabled={isPending}
              maxLength={MAX_CONTEXT_LENGTH}
              placeholder="Example: Prefer short bullet lists, flag risks early, and draft client-facing messages in a warm but direct tone."
              value={userPreferences}
              onChange={(event) => {
                setUserPreferences(event.target.value);
                setMessage(null);
              }}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-4 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          Markdown-friendly text is fine. Each field is capped at {MAX_CONTEXT_LENGTH.toLocaleString()} characters.
        </p>
        <Button disabled={isPending || !hasChanges} onClick={handleSave}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      {message ? (
        <p className={message.isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
