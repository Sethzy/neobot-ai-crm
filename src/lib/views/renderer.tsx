/**
 * ViewRenderer — json-render provider-stack wrapper for inline specs.
 *
 * Matches the reference ExplorerRenderer pattern from json-render/examples/chat.
 * State comes from `spec.state`, not a separate prop. Includes fallback for
 * unknown component types, loading prop for streaming, and an error boundary
 * so chart/component crashes never take down the entire chat panel.
 *
 * @module lib/views/renderer
 */
"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  Renderer,
  type ComponentRenderer,
  type Spec,
  StateProvider,
  VisibilityProvider,
  ActionProvider,
} from "@json-render/react";

import { registry } from "./registry";
import { createConsoleLogger } from "@/lib/logger";

const console = createConsoleLogger();

/** Renders a bordered placeholder for component types not in the registry. */
const fallback: ComponentRenderer = ({ element }) => (
  <div className="p-3 border border-dashed rounded-lg text-muted-foreground text-sm">
    Unknown component: {element.type}
  </div>
);

/** Error boundary that catches rendering crashes inside inline views. */
class ViewErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ViewRenderer] render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-3 text-sm text-muted-foreground">
          View failed to render{this.state.errorMessage ? `: ${this.state.errorMessage}` : "."}
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <ViewErrorBoundary>
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
    </ViewErrorBoundary>
  );
}
