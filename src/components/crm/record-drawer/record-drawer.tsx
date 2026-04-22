/**
 * Shared shell for object-specific CRM record drawers.
 * @module components/crm/record-drawer/record-drawer
 */
"use client";

import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

import { CompanyDrawerContent } from "./company-drawer-content";
import { ContactDrawerContent } from "./contact-drawer-content";
import { DealDrawerContent } from "./deal-drawer-content";
import { TaskDrawerContent } from "./task-drawer-content";

export type RecordObjectType = "contact" | "deal" | "company" | "task";

interface RecordDrawerProps {
  /** Whether the drawer should currently be open. */
  isOpen: boolean;
  /** Record id from the shared detail query param. */
  recordId: string | null;
  /** Record family used to select the drawer body component. */
  objectType: RecordObjectType;
  /** Called when the sheet is closed by UI interaction. */
  onClose: () => void;
}

/**
 * Renders a right-side drawer on desktop and bottom sheet on mobile.
 */
export function RecordDrawer({ isOpen, recordId, objectType, onClose }: RecordDrawerProps) {
  const isMobile = useIsMobile();

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className="w-full p-0 sm:w-[540px] sm:max-w-[540px]"
      >
        <VisuallyHidden>
          <SheetTitle>Record detail</SheetTitle>
        </VisuallyHidden>
        {recordId ? (
          <>
            {objectType === "contact" ? <ContactDrawerContent key={recordId} contactId={recordId} /> : null}
            {objectType === "deal" ? <DealDrawerContent key={recordId} dealId={recordId} /> : null}
            {objectType === "company" ? <CompanyDrawerContent key={recordId} companyId={recordId} /> : null}
            {objectType === "task" ? <TaskDrawerContent taskId={recordId} /> : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
