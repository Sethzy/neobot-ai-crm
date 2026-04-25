/**
 * Shared CRM filter overlay rendered as a left-side sheet-style panel.
 * It owns the simplified filter contract used by the shared list pages.
 * @module components/ui/filter-overlay
 */
"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * Describes a single option in a shared select-style filter.
 */
export interface FilterOption {
  value: string
  label: string
}

/**
 * Stores a date range filter using ISO-like date input values.
 */
export interface DateRangeFilterValue {
  from?: string
  to?: string
}

/**
 * Defines the supported field types for the CRM list filter system.
 */
export interface FilterDef {
  id: string
  label: string
  type: "text" | "select" | "checkbox" | "dateRange"
  options?: FilterOption[]
  multiple?: boolean
  placeholder?: string
  formatValue?: (value: string) => string
}

/**
 * Tracks the currently applied filter values keyed by filter id.
 */
export type FilterValues = Record<string, unknown>

interface FilterOverlayProps {
  title?: string
  filters: FilterDef[]
  initialValues: FilterValues
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (values: FilterValues) => void
  onClear?: () => void
}

const controlClassName =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 py-1 text-control shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

function normalizeKeys(source: FilterValues | null | undefined): string[] {
  if (!source) {
    return []
  }

  return Object.keys(source).filter((key) => source[key] !== undefined)
}

function areFieldValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false
    }

    return left.every((value, index) => areFieldValuesEqual(value, right[index]))
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = normalizeKeys(left)
    const rightKeys = normalizeKeys(right)

    if (leftKeys.length !== rightKeys.length) {
      return false
    }

    return leftKeys.every(
      (key) => rightKeys.includes(key) && areFieldValuesEqual(left[key], right[key])
    )
  }

  return false
}

function areFilterValuesEqual(left?: FilterValues | null, right?: FilterValues | null): boolean {
  if (left === right) {
    return true
  }

  const leftKeys = normalizeKeys(left)
  const rightKeys = normalizeKeys(right)

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every(
    (key) => rightKeys.includes(key) && areFieldValuesEqual(left?.[key], right?.[key])
  )
}

/**
 * Returns whether a filter value should count as active in the shared UI.
 */
export function isFilterValueActive(value: unknown): boolean {
  if (value == null) {
    return false
  }

  if (typeof value === "string") {
    return value.trim().length > 0
  }

  if (Array.isArray(value)) {
    return value.length > 0
  }

  if (isPlainObject(value)) {
    return Object.values(value).some((fieldValue) => isFilterValueActive(fieldValue))
  }

  if (typeof value === "boolean") {
    return true
  }

  return Boolean(value)
}

/**
 * Counts how many filter ids currently contain an active value.
 */
export function countActiveFilters(values: FilterValues): number {
  return Object.values(values).filter(isFilterValueActive).length
}

/**
 * Converts a filter value into the user-facing chip label used by the filter bar.
 */
export function formatFilterValueLabel(filter: FilterDef, value: unknown): string | null {
  if (!isFilterValueActive(value)) {
    return null
  }

  if (filter.type === "dateRange" && isPlainObject(value)) {
    const from = typeof value.from === "string" ? value.from : ""
    const to = typeof value.to === "string" ? value.to : ""

    if (from && to) {
      return `${from} -> ${to}`
    }

    if (from) {
      return `From ${from}`
    }

    if (to) {
      return `Until ${to}`
    }

    return null
  }

  if (filter.type === "checkbox") {
    if (value === true || value === "true") {
      return "Yes"
    }

    if (value === false || value === "false") {
      return "No"
    }
  }

  if (typeof value === "string") {
    if (filter.formatValue) {
      return filter.formatValue(value)
    }

    const matchingOption = filter.options?.find((option) => option.value === value)
    return matchingOption?.label ?? value
  }

  if (typeof value === "number") {
    return String(value)
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No"
  }

  return null
}

/**
 * Renders the shared filter overlay for list pages.
 */
export function FilterOverlay({
  title = "Filters",
  filters,
  initialValues,
  open,
  onOpenChange,
  onApply,
  onClear,
}: FilterOverlayProps) {
  const [draftValues, setDraftValues] = React.useState<FilterValues>(initialValues)
  const [lastInitialValues, setLastInitialValues] = React.useState(initialValues)

  if (lastInitialValues !== initialValues) {
    if (!areFilterValuesEqual(lastInitialValues, initialValues)) {
      setDraftValues(initialValues)
    }

    setLastInitialValues(initialValues)
  }

  const setFilterValue = React.useCallback((filterId: string, nextValue: unknown) => {
    setDraftValues((currentValues) => {
      const nextValues = { ...currentValues }

      if (isFilterValueActive(nextValue)) {
        nextValues[filterId] = nextValue
      } else {
        delete nextValues[filterId]
      }

      return nextValues
    })
  }, [])

  const handleApply = React.useCallback(() => {
    onApply(draftValues)
    onOpenChange(false)
  }, [draftValues, onApply, onOpenChange])

  const handleClear = React.useCallback(() => {
    setDraftValues({})

    if (onClear) {
      onClear()
      return
    }

    onApply({})
  }, [onApply, onClear])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] w-full flex-col rounded-t-xl border-t border-border/40 bg-background shadow-xl outline-none data-open:animate-in data-open:slide-in-from-bottom-10 data-closed:animate-out data-closed:slide-out-to-bottom-10 sm:inset-y-0 sm:left-0 sm:bottom-auto sm:max-h-none sm:max-w-[380px] sm:rounded-none sm:border-r sm:border-t-0 sm:data-open:slide-in-from-left-10 sm:data-closed:slide-out-to-left-10"
        >
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-4">
            <DialogPrimitive.Title className="type-toolbar-title">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon-sm" }),
                  "text-muted-foreground hover:text-foreground"
                )}
              >
                <XIcon className="size-4" />
                <span className="sr-only">Close filters</span>
              </button>
            </DialogPrimitive.Close>
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-3">
            <Button type="button" variant="outline" size="sm" onClick={handleClear}>
              Clear
            </Button>
            <Button type="button" size="sm" onClick={handleApply}>
              Apply
            </Button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
            {filters.map((filter) => {
              const value = draftValues[filter.id]

              return (
                <div key={filter.id} className="space-y-2">
                  <label className="type-control">
                    {filter.label}
                  </label>
                  {filter.type === "text" ? (
                    <Input
                      aria-label={filter.label}
                      type="text"
                      placeholder={filter.placeholder}
                      value={typeof value === "string" ? value : ""}
                      onChange={(event) => setFilterValue(filter.id, event.target.value)}
                    />
                  ) : null}
                  {filter.type === "dateRange" ? (
                    <div className="grid gap-3">
                      <div className="grid gap-1.5">
                        <span className="type-row-meta">From</span>
                        <Input
                          aria-label={`${filter.label} From`}
                          type="date"
                          value={
                            isPlainObject(value) && typeof value.from === "string"
                              ? value.from
                              : ""
                          }
                          onChange={(event) =>
                            setFilterValue(filter.id, {
                              ...(isPlainObject(value) ? value : {}),
                              from: event.target.value || undefined,
                            } satisfies DateRangeFilterValue)
                          }
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <span className="type-row-meta">To</span>
                        <Input
                          aria-label={`${filter.label} To`}
                          type="date"
                          value={
                            isPlainObject(value) && typeof value.to === "string"
                              ? value.to
                              : ""
                          }
                          onChange={(event) =>
                            setFilterValue(filter.id, {
                              ...(isPlainObject(value) ? value : {}),
                              to: event.target.value || undefined,
                            } satisfies DateRangeFilterValue)
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                  {filter.type === "select" && filter.multiple ? (
                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-border/40 bg-muted/20 p-3">
                      {filter.options?.map((option) => {
                        const selectedValues = Array.isArray(value)
                          ? value.filter((entry): entry is string => typeof entry === "string")
                          : []
                        const isChecked = selectedValues.includes(option.value)

                        return (
                          <label key={option.value} className="flex items-center gap-2 text-control">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const nextValues = new Set(selectedValues)

                                if (checked) {
                                  nextValues.add(option.value)
                                } else {
                                  nextValues.delete(option.value)
                                }

                                setFilterValue(filter.id, Array.from(nextValues))
                              }}
                            />
                            <span>{option.label}</span>
                          </label>
                        )
                      })}
                    </div>
                  ) : null}
                  {filter.type === "select" && !filter.multiple ? (
                    <select
                      aria-label={filter.label}
                      className={controlClassName}
                      value={typeof value === "string" ? value : ""}
                      onChange={(event) => setFilterValue(filter.id, event.target.value)}
                    >
                      <option value="">{filter.placeholder ?? "Select an option"}</option>
                      {filter.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {filter.type === "checkbox" ? (
                    <select
                      aria-label={filter.label}
                      className={controlClassName}
                      value={
                        value === true ? "true" : value === false ? "false" : ""
                      }
                      onChange={(event) => {
                        if (event.target.value === "true") {
                          setFilterValue(filter.id, true)
                          return
                        }

                        if (event.target.value === "false") {
                          setFilterValue(filter.id, false)
                          return
                        }

                        setFilterValue(filter.id, undefined)
                      }}
                    >
                      <option value="">{filter.placeholder ?? "Any"}</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  ) : null}
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border/40 px-4 py-3">
            <Button type="button" variant="outline" size="sm" onClick={handleClear}>
              Clear
            </Button>
            <Button type="button" size="sm" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
