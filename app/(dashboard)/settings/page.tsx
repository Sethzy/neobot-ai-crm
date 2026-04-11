/**
 * Settings page with billing, connection, and agent-skill controls.
 * @module app/(dashboard)/settings/page
 */
import Link from "next/link";

import { AlertCircle, CheckCircle } from "@/components/icons/lucide-compat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveClientId } from "@/lib/chat/client-id";
import { createClient } from "@/lib/supabase/server";

import { AutopilotCard, type AutopilotConfigData } from "./autopilot-card";
import { TelegramConnectCard } from "./telegram-connect-card";

interface SettingsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function renderConnectionAlert(
  connectionParam: string | string[] | undefined,
  reasonParam: string | string[] | undefined,
) {
  if (typeof connectionParam !== "string") {
    return null;
  }

  if (connectionParam === "success") {
    return (
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Connection updated.</AlertTitle>
        <AlertDescription>
          The external account handshake completed and the connection state was saved.
        </AlertDescription>
      </Alert>
    );
  }

  if (connectionParam === "error") {
    const reason =
      typeof reasonParam === "string" && reasonParam.trim() ? reasonParam.trim() : "unknown";

    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Connection update failed.</AlertTitle>
        <AlertDescription>
          The callback returned an error state: <span className="font-medium">{reason}</span>.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

/** Loads the connected Telegram chat id for the current client, or null when disconnected. */
async function loadTelegramChatId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);
    const { data } = await supabase
      .from("conversation_channel_mappings")
      .select("external_conversation_id")
      .eq("client_id", clientId)
      .eq("channel", "telegram")
      .maybeSingle();

    return data?.external_conversation_id ?? null;
  } catch {
    return null;
  }
}

/** Loads the autopilot configuration for the current client. */
async function loadAutopilotConfig(): Promise<AutopilotConfigData | null> {
  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);
    const { data } = await supabase
      .from("autopilot_config")
      .select("config_id, pulse_interval, quiet_hours_start, quiet_hours_end, timezone, enabled")
      .eq("client_id", clientId)
      .single();

    return data;
  } catch {
    return null;
  }
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const [telegramChatId, autopilotConfig] = await Promise.all([
    loadTelegramChatId(),
    loadAutopilotConfig(),
  ]);
  const connectionAlert = renderConnectionAlert(
    resolvedSearchParams.connection,
    resolvedSearchParams.reason,
  );

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="space-y-3">
          <Badge variant="outline" className="w-fit">
            Settings
          </Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Workspace controls</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage your billing plan, channel connections, and agent skills. Stripe remains the
              source of truth for paid subscriptions, while Sunder mirrors the current plan into
              the client row for product logic and gating.
            </p>
          </div>
        </div>

        {connectionAlert}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card className="border-border/70 bg-card shadow-sm">
            <CardHeader className="gap-2">
              <CardDescription>Account</CardDescription>
              <CardTitle className="text-2xl">Billing</CardTitle>
            </CardHeader>

            <CardContent className="text-sm text-muted-foreground">
              <p>Manage your plan, payment, and invoices in Stripe.</p>
            </CardContent>

            <CardFooter className="border-t pt-4">
              <Button asChild variant="outline">
                <Link href="/settings/billing">Open billing</Link>
              </Button>
            </CardFooter>
          </Card>

          <div className="space-y-4">
            <TelegramConnectCard initialChatId={telegramChatId} />
          </div>
        </div>

        {autopilotConfig ? <AutopilotCard initialConfig={autopilotConfig} /> : null}

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="gap-2">
            <CardDescription>Agent</CardDescription>
            <CardTitle className="text-2xl">Skills</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p className="max-w-2xl">
              Review the instruction skills your agent can follow, edit their SKILL.md files, and
              reset bundled defaults when you want to return to the original workflow.
            </p>
          </CardContent>

          <CardFooter className="border-t">
            <Button asChild variant="outline">
              <Link href="/skills">Open skills</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="gap-2">
            <CardDescription>Agent</CardDescription>
            <CardTitle className="text-2xl">Context</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p className="max-w-2xl">
              Edit the durable workspace profile and user-preference text injected into every
              managed-agent kickoff.
            </p>
          </CardContent>

          <CardFooter className="border-t">
            <Button asChild variant="outline">
              <Link href="/settings/agent-context">Open agent context</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
