/**
 * Mobile-only nav trigger for the settings surface.
 * On viewports below `md`, shows a top bar with a hamburger button that opens
 * a Sheet containing the full `SettingsNav`.
 * @module components/settings/settings-mobile-nav
 */
"use client";

import { MenuIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SettingsNav, SETTINGS_NAV_SECTIONS } from "@/components/settings/settings-nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

function resolveCurrentTitle(pathname: string): string {
  for (const section of SETTINGS_NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return item.label;
      }
    }
  }
  return "Settings";
}

export function SettingsMobileNav() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  // Close the sheet whenever the user navigates to a new route. Adjusting state
  // during render (rather than in a useEffect) avoids `react-hooks/set-state-in-effect`.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (open) {
      setOpen(false);
    }
  }

  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open settings navigation"
            className="size-11 -ml-2"
          >
            <MenuIcon className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Settings navigation</SheetTitle>
          </SheetHeader>
          <div className="h-full overflow-y-auto px-4 py-6">
            <SettingsNav />
          </div>
        </SheetContent>
      </Sheet>
      <span className="type-control">{resolveCurrentTitle(pathname)}</span>
    </div>
  );
}
