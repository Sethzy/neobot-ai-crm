/**
 * Automations route with server-side query hydration for first paint.
 * @module app/(dashboard)/automations/page
 */
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

import { listAutomationTriggers, triggerKeys } from "@/lib/triggers/automation-trigger-query";
import { createClient } from "@/lib/supabase/server";

import { AutomationsPageClient } from "./automations-page-client";

export default async function AutomationsPage() {
  const queryClient = new QueryClient();

  try {
    const supabase = await createClient();
    await queryClient.prefetchQuery({
      queryKey: triggerKeys.list(),
      queryFn: () => listAutomationTriggers(supabase),
    });
  } catch {
    // If prefetch fails, the client hook falls back to its existing fetch path.
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AutomationsPageClient />
    </HydrationBoundary>
  );
}
