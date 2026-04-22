/**
 * Settings → User → Profile.
 * Personal home for Telegram connection and profile-level messaging surfaces.
 * @module app/(dashboard)/settings/profile/page
 */
import { TelegramConnectRow } from "@/components/settings/messaging-channels/telegram-connect-row";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getTelegramConnectionForUser, getTelegramReadiness } from "@/lib/channels/telegram/user-connections";
import { createClient } from "@/lib/supabase/server";

type LoadedProfilePage =
  | {
      kind: "loaded";
      isTelegramAvailable: boolean;
      telegramAvailabilityMessage: string | null;
      telegramConnection: { chatId: string; targetThreadId: string } | null;
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

    const readiness = getTelegramReadiness();
    const telegramConnection = await getTelegramConnectionForUser(supabase, user.id);

    return {
      kind: "loaded",
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
            Manage Telegram for your account. Telegram always routes to your pinned
            primary chat, so pairing is now a one-time connection step instead of a
            per-thread setting.
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
          </>
        )}
      </div>
    </div>
  );
}
