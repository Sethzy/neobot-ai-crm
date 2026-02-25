/**
 * Handles email confirmation callback from Supabase.
 * Extracts token_hash from URL and exchanges it for a session.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SlimLayout } from "@/components/landing/SlimLayout";
import { Logo } from "@/components/landing/Logo";

export const Route = createFileRoute("/auth/confirm")({
  component: ConfirmPage,
});

function ConfirmPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function confirmEmail() {
      // Supabase automatically handles the token exchange when the page loads
      // via the hash fragment. We just need to check if there's a session.
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        setStatus("error");
        setErrorMessage(error.message);
        return;
      }

      if (session) {
        setStatus("success");
        // Redirect to cases after brief delay
        setTimeout(() => {
          navigate({ to: "/cases" });
        }, 2000);
      } else {
        // No session yet - might be a recovery link or still processing
        // Check URL for error
        const hashParams = new URLSearchParams(
          window.location.hash.substring(1)
        );
        const errorDesc = hashParams.get("error_description");
        if (errorDesc) {
          setStatus("error");
          setErrorMessage(errorDesc);
        } else {
          setStatus("success");
          setTimeout(() => {
            navigate({ to: "/login" });
          }, 2000);
        }
      }
    }

    confirmEmail();
  }, [navigate]);

  return (
    <SlimLayout>
      <div className="flex">
        <Link to="/" aria-label="Home">
          <Logo className="h-10 w-auto" />
        </Link>
      </div>

      {status === "loading" && (
        <>
          <h2 className="mt-20 text-lg font-semibold text-foreground">
            Confirming your email...
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Please wait while we verify your email address.
          </p>
        </>
      )}

      {status === "success" && (
        <>
          <h2 className="mt-20 text-lg font-semibold text-foreground">
            Email confirmed!
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your email has been verified. Redirecting you now...
          </p>
        </>
      )}

      {status === "error" && (
        <>
          <h2 className="mt-20 text-lg font-semibold text-destructive">
            Confirmation failed
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {errorMessage || "Something went wrong. Please try again."}
          </p>
          <div className="mt-8">
            <Link
              to="/login"
              className="font-medium text-primary hover:underline"
            >
              Back to login
            </Link>
          </div>
        </>
      )}
    </SlimLayout>
  );
}
