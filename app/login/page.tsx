'use client';

/**
 * Dedicated login page with Google OAuth and email/password fallback.
 * @module app/login/page
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { AppIcon } from "@/components/icons/app-icons";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildBrowserAuthRedirectUrl,
  getSafeNextPath,
} from "@/lib/auth/browser-redirect";
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
        redirectTo: buildBrowserAuthRedirectUrl(nextPath),
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

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    router.replace(nextPath);
  };

  return (
    <AuthShell
      modeLabel="Login"
      title="Welcome back!"
      description="Sign in to let Sunder keep your pipeline moving while you focus on the next conversation."
      footer={(
        <p>
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-[#2457d6] transition hover:text-[#1a46b8]"
          >
            Sign up
          </Link>
        </p>
      )}
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <GoogleAuthButton
          label="Sign in with Google"
          isLoading={isGoogleLoading}
          onClick={handleGoogleSignIn}
        />

        <div className="flex items-center gap-4 text-xs font-medium uppercase tracking-[0.16em] text-[#9a9288]">
          <span className="h-px flex-1 bg-black/10" />
          <span>Or</span>
          <span className="h-px flex-1 bg-black/10" />
        </div>

        <form className="grid grid-cols-1 gap-y-5" onSubmit={handleLogin}>
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <AppIcon
                name="email"
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9c9286]"
              />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-2xl border-black/10 bg-white pl-11 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.45)]"
                disabled={isLoading || isGoogleLoading}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-[#5b6477] transition hover:text-[#2457d6]"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <AppIcon
                name="lock"
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9c9286]"
              />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-2xl border-black/10 bg-white pl-11 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.45)]"
                disabled={isLoading || isGoogleLoading}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#3977f5] text-sm font-semibold text-white shadow-[0_20px_40px_-24px_rgba(37,99,235,0.95)] transition hover:bg-[#2f68db] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3977f5]/40 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading || isGoogleLoading}
          >
            <span>{isLoading ? "Signing in..." : "Continue"}</span>
            <AppIcon name="arrowRight" className="h-4 w-4" />
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
