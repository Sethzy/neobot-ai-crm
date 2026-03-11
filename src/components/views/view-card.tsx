/**
 * Inline json-render surface for agent-generated chat views.
 * @module components/views/view-card
 */
"use client";

import {
  Renderer,
  StateProvider,
  VisibilityProvider,
  type Spec,
  type StateModel,
} from "@json-render/react";

import { registry } from "@/lib/views/registry";

export interface ViewCardProps {
  spec: Spec;
  state: StateModel;
}

/**
 * Wraps the json-render renderer with the minimum providers required for PR42a.
 */
export function ViewCard({ spec, state }: ViewCardProps) {
  return (
    <div
      data-testid="view-card"
      className="min-w-0"
    >
      <StateProvider initialState={state}>
        <VisibilityProvider>
          <Renderer spec={spec} registry={registry} />
        </VisibilityProvider>
      </StateProvider>
    </div>
  );
}
