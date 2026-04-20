/**
 * CRM list page layout that pairs a list view with an inline, resizable
 * record detail panel. Thin wrapper around `ResizableInlinePanelLayout`
 * that adds the CRM-specific header strip and wires the panel open state
 * to the shared `?detail=<recordId>` URL convention.
 *
 * On mobile, falls back to the existing Sheet-based RecordDrawer overlay.
 * @module components/crm/crm-list-panel-layout
 */
"use client";

import type { ReactNode } from "react";

import { ResizableInlinePanelLayout } from "@/components/ui/resizable-inline-panel-layout";
import { useRecordDrawer } from "@/hooks/use-record-drawer";

import { RecordDrawer, type RecordObjectType } from "./record-drawer/record-drawer";

interface CrmListPanelLayoutProps {
  /** Entity type for the mobile Sheet fallback. */
  objectType: RecordObjectType;
  /** Leading icon rendered next to the page title. */
  icon: ReactNode;
  /** Primary page title shown in the dashboard header. */
  title: string;
  /** Optional secondary text shown below the title. */
  description?: ReactNode;
  /** Optional controls aligned to the right side of the header. */
  headerActions?: ReactNode;
  /** Optional additional classes for the card body wrapper. */
  bodyClassName?: string;
  /** Main page content rendered inside the rounded card surface. */
  children: ReactNode;
  /** Renders the detail panel body for a given record id (desktop only). */
  renderPanelContent: (recordId: string, options: { closeButton: ReactNode }) => ReactNode;
}

export function CrmListPanelLayout({
  objectType,
  icon,
  title,
  description,
  headerActions,
  bodyClassName,
  children,
  renderPanelContent,
}: CrmListPanelLayoutProps) {
  const { isOpen, recordId, close } = useRecordDrawer();

  const hasHeaderMeta = Boolean(description) || Boolean(headerActions);

  const header = (
    <div
      className={
        hasHeaderMeta
          ? "flex shrink-0 flex-col gap-3 bg-sidebar px-4 py-3 md:px-8 lg:flex-row lg:items-start lg:justify-between"
          : "flex shrink-0 items-center justify-between bg-sidebar px-4 py-3 md:px-8"
      }
    >
      <div className={description ? "space-y-1" : undefined}>
        <div className="flex items-center gap-2">
          {icon}
          <h1 className="text-sm font-medium text-foreground">{title}</h1>
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {headerActions}
    </div>
  );

  const panelIsOpen = isOpen && Boolean(recordId);

  return (
    <ResizableInlinePanelLayout
      header={header}
      bodyClassName={["px-4 pt-4", bodyClassName].filter(Boolean).join(" ")}
      isPanelOpen={panelIsOpen}
      onClosePanel={close}
      renderPanelContent={
        panelIsOpen
          ? ({ closeButton }) => renderPanelContent(recordId!, { closeButton })
          : undefined
      }
      mobileSlot={
        <RecordDrawer
          isOpen={isOpen}
          recordId={recordId}
          objectType={objectType}
          onClose={close}
        />
      }
    >
      {children}
    </ResizableInlinePanelLayout>
  );
}
