'use client';

/**
 * Hook for accessing and managing Supabase auth session.
 * Uses TanStack Query for caching with onAuthStateChange listener.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export interface SessionData {
  session: null;
  user: User | null;
}

async function getCurrentUser(): Promise<SessionData> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  return { session: null, user };
}

export function useSession() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["session"],
    queryFn: getCurrentUser,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        queryClient.setQueryData(["session"], { session: null, user: null });
        return;
      }

      void supabase.auth.getUser().then(({ data, error }) => {
        if (!error) {
          queryClient.setQueryData(["session"], {
            session: null,
            user: data.user,
          });
        }
      });
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  return {
    session: query.data?.session ?? null,
    user: query.data?.user ?? null,
    isLoading: query.isLoading,
    isAuthenticated: !!query.data?.user,
  };
}
