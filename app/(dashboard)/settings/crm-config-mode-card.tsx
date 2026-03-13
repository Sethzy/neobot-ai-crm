/**
 * CRM Configuration Mode card with destructive confirmation modal.
 * @module app/(dashboard)/settings/crm-config-mode-card
 */
"use client";

import { useState } from "react";

import { AlertTriangle } from "@/components/icons/lucide-compat";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CrmConfigModeCardProps {
  /** Server-side resolved initial state: ISO expiry string if active, null if inactive. */
  initialExpiresAt: string | null;
}

export function CrmConfigModeCard({ initialExpiresAt }: CrmConfigModeCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    expiresAt?: string;
    error?: string;
  } | null>(
    initialExpiresAt ? { success: true, expiresAt: initialExpiresAt } : null,
  );

  async function handleEnable() {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/settings/crm-config-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable" }),
      });

      const data = await response.json();

      if (!response.ok) {
        setResult({ success: false, error: data.error ?? "Failed to enable." });
        return;
      }

      setResult({ success: true, expiresAt: data.expiresAt });
    } catch {
      setResult({ success: false, error: "Network error." });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDisable() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/settings/crm-config-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable" }),
      });

      if (!response.ok) {
        setResult({ success: false, error: "Failed to disable configuration mode." });
        return;
      }

      setResult(null);
    } catch {
      setResult({ success: false, error: "Network error." });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardDescription>CRM Configuration</CardDescription>
        <CardTitle className="text-xl">Reconfigure CRM</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Activate configuration mode to let Sunder change your CRM stages, contact types,
          custom fields, and other vocabulary. This is a destructive operation — changes
          affect all existing records.
        </p>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Warning</p>
              <p>
                Configuration mode gives the agent access to modify your CRM schema.
                It auto-expires after 1 hour. Only activate when you intend to make changes.
              </p>
            </div>
          </div>
        </div>

        {result?.success && result.expiresAt && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
            <p className="font-medium text-foreground">Configuration mode is active.</p>
            <p>
              Go to chat and ask Sunder to reconfigure your CRM. Expires at{" "}
              {new Date(result.expiresAt).toLocaleTimeString()}.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={isLoading}
              onClick={handleDisable}
            >
              Disable now
            </Button>
          </div>
        )}

        {result?.success === false && (
          <p className="text-sm text-destructive">{result.error}</p>
        )}
      </CardContent>
      <CardFooter className="border-t">
        {!result?.success ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isLoading}>
                {isLoading ? "Activating..." : "Activate configuration mode"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Activate CRM configuration mode?</AlertDialogTitle>
                <AlertDialogDescription>
                  This gives Sunder the ability to modify your CRM stages, contact types,
                  custom fields, and other vocabulary for the next hour. Changes affect all
                  existing records and cannot be easily undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleEnable}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Yes, activate
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </CardFooter>
    </Card>
  );
}
