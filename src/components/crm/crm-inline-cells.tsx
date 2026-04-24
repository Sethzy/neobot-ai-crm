/**
 * Shared compact inline-edit cells for CRM list surfaces.
 * @module components/crm/crm-inline-cells
 */
"use client";

import type { HTMLInputTypeAttribute, ReactNode } from "react";

import { QuickEditCell } from "@/components/crm/quick-edit-cell";
import type { CrmSaveValidationResult } from "@/lib/crm/normalize";
import {
  validateEmailForSave,
  validatePhoneForSave,
  validateWebsiteForSave,
} from "@/lib/crm/normalize";

export interface CrmInlineCellOption {
  value: string;
  label: string;
}

interface SharedInlineCellProps {
  ariaLabel: string;
  displayValue?: string | null;
  children?: ReactNode;
  onSave: (value: string | number | null) => Promise<void> | void;
}

interface TextQuickEditCellProps extends SharedInlineCellProps {
  value: string | null;
  inputType?: HTMLInputTypeAttribute;
  parseValue?: (draft: string) => CrmSaveValidationResult;
}

interface NumberQuickEditCellProps extends SharedInlineCellProps {
  value: number | null;
}

interface SelectQuickEditCellProps extends SharedInlineCellProps {
  value: string | null;
  options: CrmInlineCellOption[];
}

interface LinkQuickEditCellProps extends SharedInlineCellProps {
  value: string | null;
  hrefBuilder: (value: string) => string;
  linkClassName: string;
  linkTarget?: string;
  linkRel?: string;
  inputType?: HTMLInputTypeAttribute;
  parseValue?: (draft: string) => CrmSaveValidationResult;
}

/**
 * Shared plain-text inline editor for CRM list cells.
 */
export function TextQuickEditCell({
  ariaLabel,
  value,
  displayValue,
  children,
  inputType,
  parseValue,
  onSave,
}: TextQuickEditCellProps) {
  return (
    <QuickEditCell
      ariaLabel={ariaLabel}
      value={value}
      displayValue={displayValue}
      inputType={inputType}
      parseValue={parseValue}
      onSave={onSave}
    >
      {children}
    </QuickEditCell>
  );
}

/**
 * Shared numeric inline editor for CRM list cells.
 */
export function NumberQuickEditCell({
  ariaLabel,
  value,
  displayValue,
  children,
  onSave,
}: NumberQuickEditCellProps) {
  return (
    <QuickEditCell
      ariaLabel={ariaLabel}
      value={value}
      displayValue={displayValue}
      type="number"
      onSave={onSave}
    >
      {children}
    </QuickEditCell>
  );
}

/**
 * Shared select inline editor for CRM list cells.
 */
export function SelectQuickEditCell({
  ariaLabel,
  value,
  displayValue,
  options,
  children,
  onSave,
}: SelectQuickEditCellProps) {
  return (
    <QuickEditCell
      ariaLabel={ariaLabel}
      value={value}
      displayValue={displayValue}
      type="select"
      options={options}
      onSave={onSave}
    >
      {children}
    </QuickEditCell>
  );
}

/**
 * Shared link-preserving inline editor for CRM list cells.
 */
export function LinkQuickEditCell({
  ariaLabel,
  value,
  displayValue,
  hrefBuilder,
  linkClassName,
  linkTarget,
  linkRel,
  inputType,
  parseValue,
  onSave,
}: LinkQuickEditCellProps) {
  return (
    <TextQuickEditCell
      ariaLabel={ariaLabel}
      value={value}
      displayValue={displayValue ?? value}
      inputType={inputType}
      parseValue={parseValue}
      onSave={onSave}
    >
      {value ? (
        <a
          href={hrefBuilder(value)}
          target={linkTarget}
          rel={linkRel}
          className={linkClassName}
          onClick={(event) => event.stopPropagation()}
        >
          {displayValue ?? value}
        </a>
      ) : null}
    </TextQuickEditCell>
  );
}

/**
 * Shared email editor that keeps the read-mode `mailto:` link intact.
 */
export function EmailQuickEditCell(props: Omit<LinkQuickEditCellProps, "hrefBuilder" | "inputType" | "linkRel" | "linkTarget" | "parseValue">) {
  return (
    <LinkQuickEditCell
      {...props}
      hrefBuilder={(value) => `mailto:${value}`}
      inputType="email"
      parseValue={validateEmailForSave}
    />
  );
}

/**
 * Shared phone editor that keeps the read-mode `tel:` link intact.
 */
export function PhoneQuickEditCell(props: Omit<LinkQuickEditCellProps, "hrefBuilder" | "inputType" | "linkRel" | "linkTarget" | "parseValue">) {
  return (
    <LinkQuickEditCell
      {...props}
      hrefBuilder={(value) => `tel:${value}`}
      inputType="tel"
      parseValue={validatePhoneForSave}
    />
  );
}

/**
 * Shared website editor that keeps the read-mode outbound link intact.
 */
export function WebsiteQuickEditCell(props: Omit<LinkQuickEditCellProps, "hrefBuilder" | "inputType" | "linkRel" | "linkTarget" | "parseValue">) {
  return (
    <LinkQuickEditCell
      {...props}
      hrefBuilder={(value) => (value.startsWith("http") ? value : `https://${value}`)}
      inputType="url"
      linkTarget="_blank"
      linkRel="noreferrer"
      parseValue={validateWebsiteForSave}
    />
  );
}
