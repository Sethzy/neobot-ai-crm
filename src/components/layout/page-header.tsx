/**
 * Shared header primitive for authenticated product surfaces.
 *
 * Every authenticated page (dashboard, settings, CRM lists, detail panes)
 * renders its title at a single unified scale. We deliberately do not
 * expose size variants here — uniformity across the product is the goal.
 *
 * @module components/layout/page-header
 */
import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** Primary title for the surface. */
  title: ReactNode;
  /** Optional icon shown before the title. */
  icon?: ReactNode;
  /** Optional supporting copy shown below the title. */
  description?: ReactNode;
  /** Optional metadata row shown below the description. */
  meta?: ReactNode;
  /** Optional actions aligned to the trailing edge. */
  actions?: ReactNode;
  /** Override the title element for accessibility semantics. */
  titleAs?: ElementType;
  /** Override the description element when paragraph semantics are not desired. */
  descriptionAs?: ElementType;
  /** Extra classes applied to the outer wrapper. */
  className?: string;
  /** Extra classes applied to the left content column. */
  contentClassName?: string;
  /** Extra classes applied to the title element. */
  titleClassName?: string;
  /** Extra classes applied to the description element. */
  descriptionClassName?: string;
  /** Extra classes applied to the metadata row. */
  metaClassName?: string;
}

export function PageHeader({
  title,
  icon,
  description,
  meta,
  actions,
  titleAs: TitleTag = "h1",
  descriptionAs: DescriptionTag = "p",
  className,
  contentClassName,
  titleClassName,
  descriptionClassName,
  metaClassName,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-start md:justify-between",
        className,
      )}
    >
      <div className={cn("min-w-0 flex-1", contentClassName)}>
        <div className="flex items-center gap-2.5">
          {icon ? <div className="shrink-0">{icon}</div> : null}
          <TitleTag className={cn("min-w-0 type-toolbar-title", titleClassName)}>
            {title}
          </TitleTag>
        </div>

        {description ? (
          <DescriptionTag
            className={cn("mt-1 type-toolbar-description", descriptionClassName)}
          >
            {description}
          </DescriptionTag>
        ) : null}

        {meta ? (
          <div
            className={cn(
              "mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 type-toolbar-description text-muted-foreground",
              metaClassName,
            )}
          >
            {meta}
          </div>
        ) : null}
      </div>

      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
