/**
 * Platform-aware modifier-key label for keyboard shortcut affordances.
 * @module hooks/use-modifier-key
 */
"use client";

import { useSyncExternalStore } from "react";

export type ModifierKeyLabel = "⌘" | "Ctrl";

function subscribe(): () => void {
  return () => {};
}

function getModifierKeySnapshot(): ModifierKeyLabel {
  if (typeof navigator === "undefined") {
    return "⌘";
  }

  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "⌘" : "Ctrl";
}

function getModifierKeyServerSnapshot(): ModifierKeyLabel {
  return "⌘";
}

/**
 * Returns the modifier key glyph/label to display in shortcut chips.
 *
 * Uses `useSyncExternalStore()` so the server snapshot stays hydration-safe
 * while the client snapshot can still reflect the current platform.
 */
export function useModifierKey(): ModifierKeyLabel {
  return useSyncExternalStore(
    subscribe,
    getModifierKeySnapshot,
    getModifierKeyServerSnapshot,
  );
}

/**
 * Whether the given keyboard event carries the platform modifier key —
 * `metaKey` on Apple, `ctrlKey` elsewhere. Mirrors the same detection used
 * in {@link useModifierKey}.
 */
export function isModifierPressed(event: KeyboardEvent | React.KeyboardEvent): boolean {
  const isApple =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isApple ? event.metaKey : event.ctrlKey;
}
