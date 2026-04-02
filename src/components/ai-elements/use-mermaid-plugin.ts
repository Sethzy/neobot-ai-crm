/**
 * Hook that lazy-loads the mermaid Streamdown plugin only when content contains a mermaid fence.
 * @module components/ai-elements/use-mermaid-plugin
 */
import type { PluginConfig } from "streamdown";
import { useEffect, useState } from "react";
import { basePlugins, mermaidThemeConfig } from "./streamdown-plugins";

export function useMermaidPlugin(content: string | undefined): PluginConfig {
  const needsMermaid = typeof content === "string" && content.includes("```mermaid");
  const [plugins, setPlugins] = useState<PluginConfig>(basePlugins);

  useEffect(() => {
    if (!needsMermaid) return;
    import("@streamdown/mermaid").then(({ createMermaidPlugin }) => {
      const mermaid = createMermaidPlugin({ config: mermaidThemeConfig });
      setPlugins({ ...basePlugins, mermaid } as PluginConfig);
    });
  }, [needsMermaid]);

  return plugins;
}
