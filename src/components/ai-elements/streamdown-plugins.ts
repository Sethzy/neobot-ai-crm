/**
 * Shared Streamdown plugin configuration used by message and reasoning renderers.
 * Mermaid is lazy-loaded via `useMermaidPlugin` to keep it out of the initial bundle.
 * @module components/ai-elements/streamdown-plugins
 */
import type { PluginConfig } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import "streamdown/styles.css";
import "./streamdown-overrides.css";

/** Base plugins loaded eagerly on every chat page (cjk, code, math). */
export const basePlugins: PluginConfig = { cjk, code, math };

/**
 * Flexoki theme config passed to `createMermaidPlugin` when lazy-loaded.
 * Uses static hex values because Mermaid's SVG renderer cannot resolve
 * CSS variables or oklch(). Values approximate Flexoki light-mode tokens.
 */
export const mermaidThemeConfig = {
  theme: "base" as const,
  themeVariables: {
    primaryColor: "#F2F0E5",
    primaryTextColor: "#1C1B1A",
    primaryBorderColor: "#B7B5AC",
    lineColor: "#B7B5AC",
    secondaryColor: "#FFFCF0",
    tertiaryColor: "#F2F0E5",
    fontFamily: "Figtree, system-ui, sans-serif",
  },
};
