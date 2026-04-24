/**
 * Pinned footer bar for CRM record detail panels — primary "Open" action
 * with a platform-aware ⌘↵ / Ctrl+↵ keyboard shortcut.
 * @module components/crm/record-drawer/record-detail-panel-footer
 */
"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CornerDownLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { isModifierPressed, useModifierKey } from "@/hooks/use-modifier-key";

interface RecordDetailPanelFooterProps {
  /**
   * When set, renders a primary "Open" button that navigates to the full-page
   * detail view and binds `Mod+Enter` as its keyboard shortcut. Omit for
   * surfaces that have no page view (e.g. tasks) — the footer renders nothing.
   */
  openHref?: string;
}

/**
 * Renders a pinned footer with the primary "Open" action on the right,
 * matching Twenty's detail drawer footer. While mounted, a global
 * `Mod+Enter` listener triggers the same Link used by the button, so
 * client-side routing stays consistent. Editable targets are exempt so
 * inline-edit submits still work.
 */
export function RecordDetailPanelFooter({ openHref }: RecordDetailPanelFooterProps) {
  const modifier = useModifierKey();
  const linkRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (!openHref) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      if (!isModifierPressed(event)) return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      linkRef.current?.click();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openHref]);

  if (!openHref) return null;

  return (
    <div className="flex items-center justify-end border-t border-border/60 px-4 py-2">
      <Button asChild size="sm" className="gap-2">
        <Link ref={linkRef} href={openHref}>
          <span>Open</span>
          <KbdGroup>
            <Kbd className="bg-primary-foreground/15 text-primary-foreground">{modifier}</Kbd>
            <Kbd className="bg-primary-foreground/15 text-primary-foreground">
              <CornerDownLeft className="size-3" />
            </Kbd>
          </KbdGroup>
        </Link>
      </Button>
    </div>
  );
}

/**
 * Bail-out guard so the shortcut doesn't steal `Mod+Enter` from inline-edit
 * fields, the title editor, textareas, or any contenteditable surface.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}
