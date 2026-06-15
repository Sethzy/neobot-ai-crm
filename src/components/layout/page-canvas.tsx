/**
 * Shared authenticated product layout primitives.
 *
 * Centralizes the rules that govern every authenticated route: outer scroll
 * surface, inner max-width, horizontal gutter, vertical rhythm, and the small
 * set of surface treatments. Every dashboard page funnels through these
 * primitives so width, padding, and centering cannot drift page by page.
 *
 * The horizontal rhythm (`PAGE_GUTTER_CLASSES`) and vertical rhythm
 * (`PAGE_VERTICAL_CLASSES`) are also consumed by `ResizableInlinePanelLayout`
 * so CRM list + panel pages line up with plain `PageCanvas` pages at the
 * same outer gutter.
 *
 * @module components/layout/page-canvas
 */
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/** Max-width for the default `content` variant — the canonical page body. */
export const PAGE_CONTENT_MAX_WIDTH = "max-w-5xl";
/** Max-width for `form` variant — narrower reading column for settings. */
export const PAGE_FORM_MAX_WIDTH = "max-w-3xl";
/** Horizontal gutter applied at every dashboard breakpoint. */
export const PAGE_GUTTER_CLASSES = "px-4 md:px-8 lg:px-10";
/** Vertical rhythm between the top of the scroll area and the first block. */
export const PAGE_VERTICAL_CLASSES = "py-6 md:py-8";
/** Vertical spacing between stacked blocks inside a page body. */
export const PAGE_STACK_GAP = "gap-6";

// The outer wrapper owns the horizontal gutter and vertical rhythm. The
// inner wrapper owns the max-width cap and the stack gap. Splitting them
// keeps the padding *outside* `max-w-5xl` — matching `ResizableInlinePanelLayout`
// — so CRM list pages and plain PageCanvas pages compute the same content
// width (e.g. 1024px at `max-w-5xl` regardless of gutter).
const canvasOuterClassMap = {
  workspace: cn("flex w-full min-w-0 flex-col", PAGE_GUTTER_CLASSES, PAGE_VERTICAL_CLASSES),
  content: cn("flex w-full min-w-0 flex-col", PAGE_GUTTER_CLASSES, PAGE_VERTICAL_CLASSES),
  form: cn("flex w-full min-w-0 flex-col", PAGE_GUTTER_CLASSES, PAGE_VERTICAL_CLASSES),
} as const;

const canvasInnerClassMap = {
  workspace: cn("flex w-full min-w-0 flex-col", PAGE_STACK_GAP),
  content: cn(
    "mx-auto flex w-full min-w-0 flex-col",
    PAGE_CONTENT_MAX_WIDTH,
    PAGE_STACK_GAP,
  ),
  form: cn(
    "mx-auto flex w-full min-w-0 flex-col",
    PAGE_FORM_MAX_WIDTH,
    PAGE_STACK_GAP,
  ),
} as const;

const surfaceClassMap = {
  default: "surface-app",
  muted: "surface-app-muted",
  elevated: "surface-app-elevated",
  ghost: "rounded-xl border border-app-border-subtle/80 bg-transparent",
} as const;

const surfacePaddingClassMap = {
  none: "",
  sm: "p-4 md:p-5",
  md: "p-5 md:p-6",
  lg: "p-6 md:p-8",
} as const;

type PageCanvasVariant = keyof typeof canvasInnerClassMap;
type PageSurfaceVariant = keyof typeof surfaceClassMap;
type PageSurfacePadding = keyof typeof surfacePaddingClassMap;

export interface PageCanvasProps extends HTMLAttributes<HTMLDivElement> {
  /** Supported authenticated page family. */
  variant?: PageCanvasVariant;
  /** Extra classes applied to the inner width-constrained content wrapper. */
  contentClassName?: string;
}

export interface PageSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Shared authenticated surface treatment. */
  variant?: PageSurfaceVariant;
  /** Shared interior padding recipe. */
  padding?: PageSurfacePadding;
}

export function PageCanvas({
  children,
  className,
  contentClassName,
  variant = "content",
  ...props
}: PageCanvasProps) {
  // `content` is the default because it drives the canonical centered rhythm.
  // Pages that genuinely need edge-to-edge chrome (Kanban boards, full-bleed
  // calendars) opt into `workspace` explicitly.
  return (
    <div className={cn("page-canvas", className)} {...props}>
      <div className={canvasOuterClassMap[variant]}>
        <div className={cn(canvasInnerClassMap[variant], contentClassName)}>{children}</div>
      </div>
    </div>
  );
}

export function PageSurface({
  children,
  className,
  padding = "md",
  variant = "default",
  ...props
}: PageSurfaceProps) {
  return (
    <div
      className={cn(surfaceClassMap[variant], surfacePaddingClassMap[padding], className)}
      {...props}
    >
      {children}
    </div>
  );
}
