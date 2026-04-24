'use client'

/**
 * Client-only wrapper that defers the Lenis smooth-scroll runtime until needed.
 * @module components/landing/SmoothScrollShell
 */
import dynamic from "next/dynamic";

const SmoothScroll = dynamic(
  () =>
    import("@/components/landing/SmoothScroll").then((module) => ({
      default: module.SmoothScroll,
    })),
  { ssr: false },
);

interface SmoothScrollShellProps {
  children: React.ReactNode;
}

export function SmoothScrollShell({ children }: SmoothScrollShellProps) {
  return <SmoothScroll>{children}</SmoothScroll>;
}
