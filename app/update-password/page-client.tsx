"use client";

/**
 * Update-password page client implementation.
 * @module app/update-password/page-client
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import posthog from "posthog-js";

import { AuthShell } from "@/components/auth/auth-shell";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function UpdatePasswordPageClient() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setIsLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await supabase.auth.signOut();
    posthog.reset();
    router.push("/login");
  };

  return (
    <AuthShell
      description="Choose a new password for your workspace."
      footer={(
        <p>
          Need to start over?{" "}
          <Link href="/login" className="font-medium text-primary hover:text-foreground">
            Back to login
          </Link>
          .
        </p>
      )}
      modeLabel="Password reset"
      title="Set new password"
    >
      {error ? (
        <div className="mb-6 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-meta text-destructive">
          {error}
        </div>
      ) : null}

      <form className="grid grid-cols-1 gap-6" onSubmit={handleUpdatePassword}>
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            required
            className="h-11 text-base"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            required
            className="h-11 text-base"
          />
        </div>

        <Button type="submit" className="h-12 w-full rounded-xl" disabled={isLoading}>
          {isLoading ? "Updating..." : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
