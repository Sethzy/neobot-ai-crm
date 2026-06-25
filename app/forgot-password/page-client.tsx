"use client";

/**
 * Forgot-password page client implementation.
 * @module app/forgot-password/page-client
 */
import Link from "next/link";
import { useState } from "react";

import { AuthShell, authInputClassName } from "@/components/auth/auth-shell";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPageClient() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/update-password`,
      },
    );

    setIsLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setSuccess(true);
  };

  if (success) {
    return (
      <AuthShell
        description="If an account exists with that email, we sent a reset link to your inbox."
        footer={(
          <p>
            Remembered it already?{" "}
            <Link href="/login" className="font-medium text-primary hover:text-foreground">
              Back to login
            </Link>
            .
          </p>
        )}
        title="Check your email"
      >
        <Button asChild variant="outline" className="h-11 rounded-xl">
          <Link href="/login">Back to login</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description="Enter your email address and we will send you a secure link to reset your password."
      footer={(
        <p>
          Prefer to sign in instead?{" "}
          <Link href="/login" className="font-medium text-primary hover:text-foreground">
            Back to login
          </Link>
          .
        </p>
      )}
      title="Reset your password"
    >
      {error ? (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-meta text-destructive">
          {error}
        </div>
      ) : null}

      <form className="grid grid-cols-1 gap-6" onSubmit={handleForgotPassword}>
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            required
            className={`h-11 text-base ${authInputClassName}`}
          />
        </div>

        <Button type="submit" className="h-12 w-full rounded-xl" disabled={isLoading}>
          {isLoading ? "Sending..." : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}
