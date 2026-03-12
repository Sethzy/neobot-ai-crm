'use client';

/**
 * Login page with Google OAuth and email/password — green SlimLayout.
 * @module app/login/page
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { Button } from "@/components/landing/Button";
import { Logo } from "@/components/landing/Logo";
import { SlimLayout } from "@/components/landing/SlimLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildBrowserAuthRedirectUrl,
  getSafeNextPath,
} from "@/lib/auth/browser-redirect";
import { captureOrQueueEmailAuthEvent } from "@/lib/analytics/posthog-auth-events";
import { supabase } from "@/lib/supabase";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const router = useRouter();
  const { redirect } = use(searchParams);
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
    <SlimLayout>
      <div className="flex">
        <Link href="/" aria-label="Home">
          <Logo className="h-10 w-auto" />
        </Link>
      </div>
      <h2 className="mt-6 text-lg font-semibold text-foreground">
        Sign in to your account
      </h2>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-8">
        <GoogleAuthButton
          label="Sign in with Google"
          isLoading={isGoogleLoading}
          onClick={handleGoogleSignIn}
        />
      </div>

      <div className="mt-6 flex items-center gap-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>Or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form className="mt-6 grid grid-cols-1 gap-y-8" onSubmit={handleLogin}>
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
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-sm text-muted-foreground hover:text-primary"
            >
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
          />
        </div>

        <div>
          <Button
            type="submit"
            variant="solid"
            color="green"
            className="w-full"
            disabled={isLoading || isGoogleLoading}
          >
            <span>
              {isLoading ? "Signing in..." : "Sign in"}{" "}
              <span aria-hidden="true">&rarr;</span>
            </span>
          </Button>
        </div>
      </form>
    </SlimLayout>
  );
}
