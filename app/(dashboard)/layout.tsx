/**
 * Dashboard layout — server-side prefetch for sidebar threads.
 *
 * Resolves auth → clientId → threads on the server, then hydrates the
 * TanStack Query cache so client hooks render with data on first paint
 * instead of waterfalling three sequential browser→DB round-trips.
 * @module app/(dashboard)/layout
 */
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

import { AppLayout } from "@/components/layout/app-layout";
import { DataStreamProvider } from "@/components/chat/data-stream-provider";
import { ThreadProvider } from "@/contexts/thread-context";
import { clientIdKeys } from "@/hooks/use-client-id";
import { threadKeys } from "@/hooks/use-threads";
import { resolveClientId } from "@/lib/chat/client-id";
import { listThreads } from "@/lib/chat/threads";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = new QueryClient();

  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;

    if (user) {
      // Prefetch session so useSession() finds it in the cache immediately
      queryClient.setQueryData(["session"], { session, user });

      const clientId = await resolveClientId(supabase, user.id);
      queryClient.setQueryData(clientIdKeys.byUser(user.id), clientId);

      const threads = await listThreads(supabase, clientId);
      queryClient.setQueryData(threadKeys.list(clientId), threads);
    }
  } catch {
    // Prefetch failed — client hooks will fetch on their own as before
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ThreadProvider>
        <DataStreamProvider>
          <AppLayout>{children}</AppLayout>
        </DataStreamProvider>
      </ThreadProvider>
    </HydrationBoundary>
  );
}
