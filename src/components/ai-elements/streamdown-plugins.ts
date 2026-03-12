/**
 * Shared Streamdown plugin configuration used by message and reasoning renderers.
 * @module components/ai-elements/streamdown-plugins
 */
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { createMermaidPlugin } from "@streamdown/mermaid";

/** Custom mermaid plugin with Sunder theming and LR-friendly layout. */
const mermaid = createMermaidPlugin({
  config: {
    theme: "base",
    themeVariables: {
      primaryColor: "#e0f2fe",
      primaryTextColor: "#0c4a6e",
      primaryBorderColor: "#7dd3fc",
      lineColor: "#94a3b8",
      secondaryColor: "#f0f9ff",
      tertiaryColor: "#f8fafc",
      fontFamily: "Inter, system-ui, sans-serif",
    },
    flowchart: {
      useMaxWidth: false,
      nodeSpacing: 30,
      rankSpacing: 40,
    },
  },
});

export const streamdownPlugins = { cjk, code, math, mermaid };
