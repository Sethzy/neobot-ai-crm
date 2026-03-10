/**
 * Form submit button with built-in pending state for hosted billing actions.
 * @module app/(dashboard)/pricing/submit-button
 */
"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { Loader2 } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  disabled?: boolean;
  idleLabel: string;
  pendingLabel: string;
  variant?: ComponentProps<typeof Button>["variant"];
}

export function SubmitButton({
  disabled = false,
  idleLabel,
  pendingLabel,
  variant = "default",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <Button type="submit" variant={variant} disabled={isDisabled} className="w-full sm:w-auto">
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
