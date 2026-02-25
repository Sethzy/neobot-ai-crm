'use client';

/**
 * Hook for accessing and managing Supabase auth session.
 * Uses TanStack Query for caching with onAuthStateChange listener.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

export interface SessionData {
  session: Session | null;
  user: User | null;
}

async function getSession(): Promise<SessionData> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  return { session, user: session?.user ?? null };
}

export function useSession() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["session"],
    queryFn: getSession,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      queryClient.setQueryData(["session"], {
        session,
        user: session?.user ?? null,
      });
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  return {
    session: query.data?.session ?? null,
    user: query.data?.user ?? null,
    isLoading: query.isLoading,
    isAuthenticated: !!query.data?.session,
  };
}
