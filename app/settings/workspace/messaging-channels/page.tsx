/**
 * Settings → Workspace → Messaging Channels.
 * Row-per-channel layout: Telegram DM is live, the other four channels are on
 * the roadmap with disabled connect buttons.
 * @module app/settings/workspace/messaging-channels/page
 */
import { DisabledChannelRow } from "@/components/settings/messaging-channels/disabled-channel-row";
import { TelegramConnectRow } from "@/components/settings/messaging-channels/telegram-connect-row";
import { resolveClientId } from "@/lib/chat/client-id";
import { createClient } from "@/lib/supabase/server";

interface LoadedTelegramMapping {
  clientId: string | null;
  chatId: string | null;
}

async function loadTelegramMapping(): Promise<LoadedTelegramMapping> {
  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);
    const { data } = await supabase
      .from("conversation_channel_mappings")
      .select("external_conversation_id")
      .eq("client_id", clientId)
      .eq("channel", "telegram")
      .maybeSingle();
    return { clientId, chatId: data?.external_conversation_id ?? null };
  } catch (error) {
    console.error("[settings/messaging-channels] Failed to load Telegram mapping:", error);
    return { clientId: null, chatId: null };
  }
}

export default async function MessagingChannelsPage() {
  const { clientId, chatId } = await loadTelegramMapping();

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Messaging Channels</h1>
          <p className="text-sm text-muted-foreground">
            Connect messaging channels so your agent can reach you across platforms.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <TelegramConnectRow clientId={clientId} initialChatId={chatId} />

          <DisabledChannelRow
            icon="contacts"
            iconTint="blue"
            title="Telegram Group"
            description="Add the bot as admin to a supergroup with Topics enabled — each topic becomes its own thread."
          />

          <DisabledChannelRow
            icon="chat"
            iconTint="purple"
            title="Slack"
            description="Message your agent from any Slack workspace."
          />

          <DisabledChannelRow
            icon="whatsapp"
            iconTint="green"
            title="WhatsApp"
            description="Chat via WhatsApp Business Cloud API."
          />

          <DisabledChannelRow
            icon="phone"
            iconTint="neutral"
            title="iMessage"
            description="Native iMessage via a relay such as SendBlue or Loop."
          />
        </div>
      </div>
    </div>
  );
}
