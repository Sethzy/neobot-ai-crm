'use client';

/**
 * Signup page with Google OAuth and email/password — green SlimLayout.
 * @module app/register/page
 */
import Link from "next/link";
import { useState } from "react";

import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { Button } from "@/components/landing/Button";
import { Logo } from "@/components/landing/Logo";
import { SlimLayout } from "@/components/landing/SlimLayout";
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
      <SlimLayout>
        <div className="flex">
          <Link href="/" aria-label="Home">
            <Logo className="h-10 w-auto" />
          </Link>
        </div>
        <h2 className="mt-20 text-lg font-semibold text-foreground">
          Check your email
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We&apos;ve sent a confirmation link to{" "}
          <span className="font-semibold text-foreground">{email}</span>.
          Once confirmed, you&apos;ll be ready to use Sunder.
        </p>
        <div className="mt-8">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to login
          </Link>
        </div>
      </SlimLayout>
    );
  }

  return (
    <SlimLayout>
      <div className="flex">
        <Link href="/" aria-label="Home">
          <Logo className="h-10 w-auto" />
        </Link>
      </div>
      <h2 className="mt-20 text-lg font-semibold text-foreground">
        Get started for free
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>{" "}
        to your account.
      </p>

      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-8">
        <GoogleAuthButton
          label="Sign up with Google"
          isLoading={isGoogleLoading}
          onClick={handleGoogleSignUp}
        />
      </div>

      <div className="mt-6 flex items-center gap-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>Or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        className="mt-6 grid grid-cols-1 gap-y-8"
        onSubmit={handleSignUp}
      >
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
              {isLoading ? "Creating account..." : "Sign up"}{" "}
              <span aria-hidden="true">&rarr;</span>
            </span>
          </Button>
        </div>
      </form>
    </SlimLayout>
  );
}
