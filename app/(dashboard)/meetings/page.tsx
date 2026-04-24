/**
 * Meetings list route with server-side query hydration for first paint.
 * @module app/(dashboard)/meetings/page
 */
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

import { resolveClientId } from "@/lib/chat/client-id";
import { fetchMeetings, meetingKeys } from "@/lib/meetings/queries";
import { createClient } from "@/lib/supabase/server";

import { MeetingsPageClient } from "./meetings-page-client";

export default async function MeetingsPage() {
  const queryClient = new QueryClient();

  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);

    await queryClient.prefetchQuery({
      queryKey: meetingKeys.list(clientId),
      queryFn: () => fetchMeetings(supabase, clientId),
    });
  } catch {
    // If prefetch fails, the client hook falls back to its existing fetch path.
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MeetingsPageClient />
    </HydrationBoundary>
  );
}
