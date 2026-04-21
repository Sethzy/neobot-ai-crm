/**
 * Settings → User → Profile.
 * Personal home for Telegram connection and default messaging destination.
 * @module app/(dashboard)/settings/profile/page
 */
import { DefaultMessagingAgentForm } from "@/components/settings/profile/default-messaging-agent-form";
import { TelegramConnectRow } from "@/components/settings/messaging-channels/telegram-connect-row";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getTelegramConnectionForUser, getTelegramReadiness } from "@/lib/channels/telegram/user-connections";
import { resolveClientId } from "@/lib/chat/client-id";
import {
  getDefaultMessagingThreadForUser,
  listAvailableMessagingThreads,
} from "@/lib/settings/profile/messaging-preferences";
import { createClient } from "@/lib/supabase/server";

type LoadedProfilePage =
  | {
      kind: "loaded";
      defaultThreadId: string;
      isTelegramAvailable: boolean;
      telegramAvailabilityMessage: string | null;
      telegramConnection: { chatId: string; targetThreadId: string } | null;
      threads: Awaited<ReturnType<typeof listAvailableMessagingThreads>>;
      userId: string;
    }
  | { kind: "error" };

async function loadProfilePage(): Promise<LoadedProfilePage> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { kind: "error" };
    }

    const clientId = await resolveClientId(supabase, user.id);
    const readiness = getTelegramReadiness();
    const [threads, defaultThreadId, telegramConnection] = await Promise.all([
      listAvailableMessagingThreads(supabase, clientId),
      getDefaultMessagingThreadForUser(supabase, {
        clientId,
        userId: user.id,
      }),
      getTelegramConnectionForUser(supabase, user.id),
    ]);

    return {
      kind: "loaded",
      defaultThreadId,
      isTelegramAvailable: readiness.isConfigured,
      telegramAvailabilityMessage: readiness.isConfigured
        ? null
        : "Telegram is not configured yet. Ask an admin to finish the bot setup.",
      telegramConnection: telegramConnection
        ? {
            chatId: telegramConnection.externalConversationId,
            targetThreadId: telegramConnection.targetThreadId,
          }
        : null,
      threads,
      userId: user.id,
    };
  } catch (error) {
    console.error("[settings/profile] Failed to load personal messaging settings:", error);
    return { kind: "error" };
  }
}

export default async function ProfilePage() {
  const profilePage = await loadProfilePage();

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Manage personal messaging settings for your account. Connect Telegram once,
            then choose which Sunder conversation should receive those messages by default.
          </p>
        </div>

        {profilePage.kind === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to load profile settings.</AlertTitle>
            <AlertDescription>
              Refresh the page before changing your Telegram connection or default
              messaging destination.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <TelegramConnectRow
              availabilityMessage={profilePage.telegramAvailabilityMessage ?? undefined}
              initialConnection={profilePage.telegramConnection}
              isAvailable={profilePage.isTelegramAvailable}
              realtimeUserId={profilePage.userId}
            />
            <DefaultMessagingAgentForm
              initialDefaultThreadId={profilePage.defaultThreadId}
              threads={profilePage.threads}
            />
          </>
        )}
      </div>
    </div>
  );
}
