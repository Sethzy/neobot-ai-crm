/**
 * Lazy inline renderer for show_view outputs to keep the main chat path light.
 * @module components/chat/show-view-inline
 */
"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { ViewCardProps } from "@/components/views/view-card";

const LazyViewCard = dynamic<ViewCardProps>(
  () =>
    import("@/components/views/view-card").then(
      (module) => module.ViewCard as ComponentType<ViewCardProps>,
    ),
  {
    ssr: false,
    loading: () => <div className="min-h-24" data-testid="view-card-loading" />,
  },
);

/**
 * Renders the show_view card behind a code-split boundary.
 */
export function ShowViewInline(props: ViewCardProps) {
  return <LazyViewCard {...props} />;
}
