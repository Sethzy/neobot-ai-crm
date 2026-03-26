"use client";
/** Dashboard error boundary — catches route-level errors while preserving the sidebar shell. */
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  console.error("[DashboardError]", error);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Something went wrong</h2>
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        This page encountered an error. Your data is safe.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">
          Error ID: {error.digest}
        </p>
      )}
      <Button variant="outline" size="sm" onClick={reset}>
        <RotateCcw className="mr-2 h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
