/**
 * Client-side install/uninstall button that also invalidates cached installed
 * skill queries in the current app session.
 *
 * Renders as a compact inline text button matching the competitor's UI:
 * "+ Install" for recommended skills, "Uninstall" for installed skills.
 *
 * @module app/(dashboard)/skills/skill-install-button
 */
"use client";

import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { installedSkillKeys } from "@/hooks/use-installed-skills";

import { installSkillAction, uninstallSkillAction } from "./actions";

interface SkillInstallButtonProps {
  isInstalled: boolean;
  slug: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}

export function SkillInstallButton({
  isInstalled,
  slug,
  size = "sm",
  variant = "ghost",
}: SkillInstallButtonProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      className={variant === "ghost" ? "h-7 gap-1 px-2.5 text-caption text-muted-foreground hover:text-foreground" : "gap-1"}
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          if (isInstalled) {
            await uninstallSkillAction(slug);
          } else {
            await installSkillAction(slug);
          }

          await queryClient.invalidateQueries({
            queryKey: installedSkillKeys.all,
          });
          router.refresh();
        });
      }}
      size={size}
      type="button"
      variant={variant}
    >
      {isPending ? (
        "Saving..."
      ) : isInstalled ? (
        "Uninstall"
      ) : (
        <>
          <Plus className="size-3.5" />
          Install
        </>
      )}
    </Button>
  );
}
