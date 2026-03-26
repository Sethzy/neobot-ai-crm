"use client";
/**
 * Global error boundary — catches errors in the root layout itself.
 * Uses inline styles because the root layout (which loads CSS) may have crashed.
 * Uses dynamic import for Sentry because static imports may fail if the root layout crashed.
 */
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    import("@sentry/nextjs").then((Sentry) => {
      Sentry.captureException(error);
    });
  }, [error]);

  console.error("[GlobalError]", error);

  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "2rem", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: "#666", maxWidth: "24rem" }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            style={{ padding: "0.5rem 1rem", border: "1px solid #ccc", borderRadius: "0.375rem", cursor: "pointer", background: "white" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
