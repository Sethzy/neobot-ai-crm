/**
 * Collapsible field group for CRM record detail panels (matches Twenty's "General" section).
 * @module components/crm/record-drawer/collapsible-field-group
 */
"use client";

import type { ReactNode } from "react";
import { ChevronUp } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface CollapsibleFieldGroupProps {
  /** Group label shown in the trigger row (e.g. "General"). */
  label: string;
  /** Whether the group starts expanded. */
  defaultOpen?: boolean;
  /** Field rows to render inside the collapsible body. */
  children: ReactNode;
}

/**
 * Wraps fields in a collapsible group with a muted label and chevron toggle.
 */
export function CollapsibleFieldGroup({
  label,
  defaultOpen = true,
  children,
}: CollapsibleFieldGroupProps) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between py-1.5 text-sm text-muted-foreground hover:text-foreground">
        <span className="font-medium">{label}</span>
        <ChevronUp className="h-4 w-4 transition-transform duration-200 [[data-state=closed]_&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-0.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
