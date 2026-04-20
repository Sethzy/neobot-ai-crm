/**
 * Shared row primitive for the Messaging Channels page.
 * Renders an icon tile + title + optional description + a right-side action slot.
 * @module components/settings/messaging-channels/channel-row
 */
"use client";

import { Children, type ReactNode } from "react";

import { AppIcon, type AppIconName } from "@/components/icons/app-icons";
import { cn } from "@/lib/utils";

interface ChannelRowProps {
  icon: AppIconName;
  iconTint?: "blue" | "green" | "purple" | "neutral";
  title: string;
  description?: string;
  action: ReactNode;
  children?: ReactNode;
}

const TINT_CLASSES: Record<NonNullable<ChannelRowProps["iconTint"]>, string> = {
  blue: "bg-info/10 text-info",
  green: "bg-success/10 text-success",
  purple: "bg-accent/40 text-foreground",
  neutral: "bg-muted text-muted-foreground",
};

export function ChannelRow({
  icon,
  iconTint = "blue",
  title,
  description,
  action,
  children,
}: ChannelRowProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-start gap-4 p-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TINT_CLASSES[iconTint])}>
          <AppIcon name={icon} className="h-5 w-5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{title}</p>
              {description ? (
                <p className="text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
            <div className="shrink-0">{action}</div>
          </div>
        </div>
      </div>
      {Children.toArray(children).length > 0 ? (
        <div className="border-t border-border/60 p-4">{children}</div>
      ) : null}
    </div>
  );
}
