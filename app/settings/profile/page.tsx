/**
 * Settings → User → Profile.
 * Personal home for Telegram connection and profile-level messaging surfaces.
 * @module app/(dashboard)/settings/profile/page
 */
import { TelegramConnectRow } from "@/components/settings/messaging-channels/telegram-connect-row";
import { PageHeader } from "@/components/layout/page-header";
import { PageCanvas } from "@/components/layout/page-canvas";
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
    <PageCanvas variant="form" contentClassName="max-w-4xl">
        <PageHeader
          title="Profile"
          description="Manage Telegram for your account. Telegram always routes to your pinned primary chat, so pairing is a one-time connection step."
          descriptionClassName="max-w-3xl"
        />

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
    </PageCanvas>
  );
}
