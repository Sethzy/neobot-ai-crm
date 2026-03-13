/**
 * ViewRenderer — json-render provider-stack wrapper for inline specs.
 *
 * Matches the reference ExplorerRenderer pattern from json-render/examples/chat.
 * State comes from `spec.state`, not a separate prop. Includes fallback for
 * unknown component types and loading prop for streaming.
 *
 * @module lib/views/renderer
 */
"use client";

import { type ReactNode } from "react";
import {
  Renderer,
  type ComponentRenderer,
  type Spec,
  StateProvider,
  VisibilityProvider,
  ActionProvider,
} from "@json-render/react";

import { registry } from "./registry";

/** Renders a bordered placeholder for component types not in the registry. */
const fallback: ComponentRenderer = ({ element }) => (
  <div className="p-3 border border-dashed rounded-lg text-muted-foreground text-sm">
    Unknown component: {element.type}
  </div>
);

interface ViewRendererProps {
  spec: Spec | null;
  loading?: boolean;
}

/**
 * Wraps the json-render `Renderer` with the full provider stack required for
 * inline-mode specs: StateProvider > VisibilityProvider > ActionProvider > Renderer.
 *
 * Returns null when spec is null (no spec emitted yet or message has no view).
 */
export function ViewRenderer({ spec, loading }: ViewRendererProps): ReactNode {
  if (!spec) return null;

  return (
    <StateProvider initialState={spec.state ?? {}}>
      <VisibilityProvider>
        <ActionProvider>
          <Renderer
            spec={spec}
            registry={registry}
            fallback={fallback}
            loading={loading}
          />
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>
  );
}
