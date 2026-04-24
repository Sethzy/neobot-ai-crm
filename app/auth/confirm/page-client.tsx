"use client";

/**
 * Handles post-confirmation routing for email-based signups.
 * @module app/auth/confirm/page-client
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

export default function ConfirmPageClient() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function confirmEmail() {
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
        setTimeout(() => {
          router.push("/chat");
        }, 2000);
      } else {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const errorDesc = hashParams.get("error_description");
        if (errorDesc) {
          setStatus("error");
          setErrorMessage(errorDesc);
        } else {
          setStatus("success");
          setTimeout(() => {
            router.push("/login");
          }, 2000);
        }
      }
    }

    void confirmEmail();
  }, [router]);

  return (
    <AuthShell
      description={
        status === "loading"
          ? "Please wait while we verify your email address."
          : status === "success"
            ? "Your email has been verified. Redirecting you now..."
            : (errorMessage || "Something went wrong. Please try again.")
      }
      footer={(
        <p>
          Need to return manually?{" "}
          <Link href="/login" className="font-medium text-primary hover:text-foreground">
            Back to login
          </Link>
          .
        </p>
      )}
      modeLabel="Email confirmation"
      title={
        status === "loading"
          ? "Confirming your email..."
          : status === "success"
            ? "Email confirmed!"
            : "Confirmation failed"
      }
    >
      {status === "error" ? (
        <Button asChild variant="outline" className="h-11 rounded-xl">
          <Link href="/login">Back to login</Link>
        </Button>
      ) : null}
    </AuthShell>
  );
}
