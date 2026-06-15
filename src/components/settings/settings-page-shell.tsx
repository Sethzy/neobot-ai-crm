/**
 * Inner content wrapper for pages rendered inside the persistent settings shell.
 * Settings already owns the scroll container and side navigation, so this keeps
 * the page rhythm without reusing the dashboard-level PageCanvas.
 * @module components/settings/settings-page-shell
 */
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SettingsPageShellProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  contentClassName?: string;
  width?: "default" | "wide";
}

const widthClassMap = {
  default: "max-w-2xl",
  wide: "max-w-4xl",
} satisfies Record<NonNullable<SettingsPageShellProps["width"]>, string>;

export function SettingsPageShell({
  children,
  className,
  contentClassName,
  width = "default",
  ...props
}: SettingsPageShellProps) {
  return (
    <div
      className={cn("flex w-full min-w-0 flex-col px-4 py-6 md:px-8 md:py-8", className)}
      {...props}
    >
      <div
        className={cn(
          "mx-auto flex w-full min-w-0 flex-col gap-6",
          widthClassMap[width],
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
