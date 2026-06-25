"use client";

/**
 * Login page with email/password authentication.
 * @module app/login/page-client
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthShell, authInputClassName } from "@/components/auth/auth-shell";
import { captureOrQueueEmailAuthEvent } from "@/lib/analytics/posthog-auth-events";
import { getSafeNextPath } from "@/lib/auth/browser-redirect";
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
      footer={(
        <p>
          New to NeoBot?{" "}
          <Link href="/register" className="font-medium text-primary hover:text-foreground">
            Create an account
          </Link>
          .
        </p>
      )}
      title="Sign in to your account"
    >
      {error ? (
        <div className="mb-6 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="space-y-6">
        <form className="grid grid-cols-1 gap-y-8" onSubmit={handleLogin}>
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
              className={`h-11 rounded-lg text-base ${authInputClassName}`}
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
              disabled={isLoading}
              required
              className={`h-11 rounded-lg text-base ${authInputClassName}`}
            />
          </div>

          <Button
            type="submit"
            className="h-12 w-full rounded-full bg-lp-black font-semibold text-lp-cream shadow-sm transition hover:bg-lp-lavender hover:text-lp-ink"
            disabled={isLoading}
          >
            <span>
              {isLoading ? "Signing in..." : "Sign in"}{" "}
              <span aria-hidden="true">→</span>
            </span>
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
