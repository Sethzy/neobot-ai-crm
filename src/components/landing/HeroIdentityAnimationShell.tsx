/**
 * Client-only lazy wrapper for the landing hero animation.
 * @module components/landing/HeroIdentityAnimationShell
 */
"use client";

import dynamic from "next/dynamic";

const HeroIdentityAnimation = dynamic(
  () =>
    import("@/components/landing/HeroIdentityAnimation").then(
      (module) => module.HeroIdentityAnimation,
    ),
  {
    ssr: false,
    loading: () => <div className="mb-8 h-28 w-full sm:mb-10 sm:h-32" />,
  },
);

export function HeroIdentityAnimationShell({
  className,
}: {
  className?: string;
}) {
  return <HeroIdentityAnimation className={className} />;
}
