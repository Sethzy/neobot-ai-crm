/**
 * Legacy workspace messaging-channels route.
 * Personal Telegram settings now live under /settings/profile.
 * @module app/settings/workspace/messaging-channels/page
 */
import { redirect } from "next/navigation";

export default function MessagingChannelsPage() {
  redirect("/settings/profile");
}
