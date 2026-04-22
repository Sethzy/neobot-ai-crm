'use client';

/**
 * Signup page with Google OAuth and email/password.
 * @module app/register/page
 */
import Link from "next/link";
import { useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildBrowserAuthRedirectUrl,
  splitFullName,
} from "@/lib/auth/browser-redirect";
import { captureOrQueueEmailAuthEvent } from "@/lib/analytics/posthog-auth-events";
import { supabase } from "@/lib/supabase";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleSignUp = async () => {
    setError(null);
    setIsGoogleLoading(true);

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: buildBrowserAuthRedirectUrl("/chat", "signup"),
      },
    });

    setIsGoogleLoading(false);

    if (authError) {
      setError(authError.message);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const trimmedName = fullName.trim().replace(/\s+/g, " ");

    if (!trimmedName) {
      setError("Please enter your full name");
      setIsLoading(false);
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      setError("Please enter a valid email address");
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setIsLoading(false);
      return;
    }

    const { firstName, lastName } = splitFullName(trimmedName);
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: trimmedName,
          first_name: firstName,
          last_name: lastName,
        },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    setIsLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (data.user?.identities?.length === 0) {
      setError("An account with this email already exists. Please sign in.");
      return;
    }

    if (data.user) {
      await captureOrQueueEmailAuthEvent({
        event: "signed_up",
        supabase,
        user: data.user,
      });
    }

    setSuccess(true);
  };

  if (success) {
    return (
      <AuthShell
        description={`We sent a confirmation link to ${email}. Once confirmed, you will be ready to use Sunder.`}
        footer={(
          <p>
            Need to use a different address?{" "}
            <Link href="/register" className="font-medium text-primary hover:text-foreground">
              Start over
            </Link>
            .
          </p>
        )}
        modeLabel="Verify email"
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
      description="Use Google or email to set up your workspace. Sunder keeps judgment with you and handles the follow-through."
      footer={(
        <p>
          Already registered?{" "}
          <Link href="/login" className="font-medium text-primary hover:text-foreground">
            Sign in
          </Link>
          .
        </p>
      )}
      modeLabel="Sign up"
      title="Get started for free"
    >
      {error ? (
        <div className="mb-6 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-meta text-destructive">
          {error}
        </div>
      ) : null}

      <div className="space-y-6">
        <GoogleAuthButton
          label="Sign up with Google"
          isLoading={isGoogleLoading}
          onClick={handleGoogleSignUp}
        />

        <div className="flex items-center gap-4">
          <span className="h-px flex-1 bg-border" />
          <span className="text-caption font-medium uppercase text-muted-foreground">Or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <form className="grid grid-cols-1 gap-6" onSubmit={handleSignUp}>
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isLoading || isGoogleLoading}
              required
              className="h-11 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading || isGoogleLoading}
              required
              className="h-11 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading || isGoogleLoading}
              required
              className="h-11 text-base"
            />
          </div>

          <Button
            type="submit"
            className="h-12 w-full rounded-xl"
            disabled={isLoading || isGoogleLoading}
          >
            {isLoading ? "Creating account..." : "Sign up"}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
