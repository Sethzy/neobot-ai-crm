"use client";

/**
 * Login page with Google OAuth and email/password.
 * @module app/login/page-client
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { captureOrQueueEmailAuthEvent } from "@/lib/analytics/posthog-auth-events";
import {
  buildBrowserAuthRedirectUrl,
  getSafeNextPath,
} from "@/lib/auth/browser-redirect";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LoginPageClientProps {
  redirect?: string;
}

export default function LoginPageClient({ redirect }: LoginPageClientProps) {
  const router = useRouter();
  const nextPath = getSafeNextPath(redirect);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleLoading(true);

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: buildBrowserAuthRedirectUrl(nextPath, "signin"),
      },
    });

    setIsGoogleLoading(false);

    if (authError) {
      setError(authError.message);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (data.user) {
      await captureOrQueueEmailAuthEvent({
        event: "signed_in",
        supabase,
        user: data.user,
      });
    }

    router.replace(nextPath);
  };

  return (
    <AuthShell
      description="Connect Google or sign in with email to pick up where NeoBot left off."
      footer={(
        <p>
          New to NeoBot?{" "}
          <Link href="/register" className="font-medium text-primary hover:text-foreground">
            Create an account
          </Link>
          .
        </p>
      )}
      modeLabel="Sign in"
      title="Sign in to your account"
    >
      {error ? (
        <div className="mb-6 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-meta text-destructive">
          {error}
        </div>
      ) : null}

      <div className="space-y-6">
        <GoogleAuthButton
          label="Sign in with Google"
          isLoading={isGoogleLoading}
          onClick={handleGoogleSignIn}
        />

        <div className="flex items-center gap-4">
          <span className="h-px flex-1 bg-border" />
          <span className="text-caption font-medium uppercase text-muted-foreground">Or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <form className="grid grid-cols-1 gap-6" onSubmit={handleLogin}>
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
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-meta text-muted-foreground hover:text-foreground">
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
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
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
