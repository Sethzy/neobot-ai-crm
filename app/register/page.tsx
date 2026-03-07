'use client';

/**
 * Dedicated signup page with Google OAuth and email/password fallback.
 * @module app/register/page
 */
import Link from "next/link";
import { useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { AppIcon } from "@/components/icons/app-icons";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildBrowserAuthRedirectUrl,
  splitFullName,
} from "@/lib/auth/browser-redirect";
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
        redirectTo: buildBrowserAuthRedirectUrl("/chat"),
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

    setSuccess(true);
  };

  if (success) {
    return (
      <AuthShell
        modeLabel="Sign up"
        title="Check your email"
        description="We sent you a confirmation link. Open it to finish creating your workspace and land in chat."
        footer={(
          <p>
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-[#2457d6] transition hover:text-[#1a46b8]"
            >
              Log in
            </Link>
          </p>
        )}
      >
        <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_24px_48px_-32px_rgba(15,23,42,0.55)]">
          <p className="text-sm leading-7 text-[#635b50]">
            We&apos;ve sent a confirmation link to{" "}
            <span className="font-semibold text-[#171717]">{email}</span>.
            Once confirmed, you&apos;ll be ready to use Sunder.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      modeLabel="Sign up"
      title="Welcome to Sunder!"
      description="Create your workspace in minutes. Start with Google or keep the classic email and password flow."
      footer={(
        <p>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-[#2457d6] transition hover:text-[#1a46b8]"
          >
            Log in
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
          label="Sign up with Google"
          isLoading={isGoogleLoading}
          onClick={handleGoogleSignUp}
        />

        <div className="flex items-center gap-4 text-xs font-medium uppercase tracking-[0.16em] text-[#9a9288]">
          <span className="h-px flex-1 bg-black/10" />
          <span>Or</span>
          <span className="h-px flex-1 bg-black/10" />
        </div>

        <form className="grid grid-cols-1 gap-y-5" onSubmit={handleSignUp}>
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <div className="relative">
              <AppIcon
                name="person"
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9c9286]"
              />
              <Input
                id="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-12 rounded-2xl border-black/10 bg-white pl-11 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.45)]"
                disabled={isLoading || isGoogleLoading}
                required
              />
            </div>
          </div>

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
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <AppIcon
                name="lock"
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9c9286]"
              />
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
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
            <span>{isLoading ? "Creating account..." : "Continue"}</span>
            <AppIcon name="arrowRight" className="h-4 w-4" />
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
