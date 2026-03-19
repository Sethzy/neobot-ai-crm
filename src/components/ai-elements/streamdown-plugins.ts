/**
 * Shared Streamdown plugin configuration used by message and reasoning renderers.
 * @module components/ai-elements/streamdown-plugins
 */
import type { PluginConfig } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { createMermaidPlugin } from "@streamdown/mermaid";
import "streamdown/styles.css";
import "./streamdown-overrides.css";

/**
 * Custom mermaid plugin with Sunder theming and LR-friendly layout.
 * Uses static hex values because Mermaid's SVG renderer cannot resolve
 * CSS variables or oklch(). Values approximate Flexoki light-mode tokens.
 */
const mermaid = createMermaidPlugin({
  config: {
    theme: "base",
    themeVariables: {
      primaryColor: "#F2F0E5",
      primaryTextColor: "#1C1B1A",
      primaryBorderColor: "#B7B5AC",
      lineColor: "#B7B5AC",
      secondaryColor: "#FFFCF0",
      tertiaryColor: "#F2F0E5",
      fontFamily: "Inter, system-ui, sans-serif",
    },
    flowchart: {
      useMaxWidth: false,
      nodeSpacing: 30,
      rankSpacing: 40,
      curve: "basis",
    },
  },
});

/**
 * Cast needed because `@streamdown/mermaid@1.0.2` depends on mermaid 11.12
 * while `streamdown@2.5` ships mermaid 11.13. Runtime API is identical.
 */
export const streamdownPlugins = { cjk, code, math, mermaid } as PluginConfig;
