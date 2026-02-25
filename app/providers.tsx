'use client';

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { UploadProvider } from "@/contexts/upload-context";
import { HighlightProvider } from "@/contexts/highlight-context";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <UploadProvider>
        <HighlightProvider>{children}</HighlightProvider>
      </UploadProvider>
    </QueryClientProvider>
  );
}
