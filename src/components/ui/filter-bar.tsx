/**
 * Shared CRM search and filter toolbar used above the list tables.
 * It provides the debounced search input, filter overlay trigger, and active chips.
 * @module components/ui/filter-bar
 */
"use client"

import * as React from "react"
import { Filter, Search, SlidersHorizontal, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  FilterOverlay,
  countActiveFilters,
  formatFilterValueLabel,
  isFilterValueActive,
  type FilterDef,
  type FilterValues,
} from "@/components/ui/filter-overlay"
import { cn } from "@/lib/utils"

interface FilterBarProps {
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  filters?: FilterDef[]
  values?: FilterValues
  onApply?: (values: FilterValues) => void
  onClear?: () => void
  className?: string
}

/**
 * Renders the shared CRM filter bar shell.
 */
export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search",
  filters = [],
  values = {},
  onApply,
  onClear,
  className,
}: FilterBarProps) {
  const [isOverlayOpen, setIsOverlayOpen] = React.useState(false)
  const [searchDraft, setSearchDraft] = React.useState(searchValue ?? "")
  const lastAppliedSearchRef = React.useRef(searchValue ?? "")

  React.useEffect(() => {
    const nextSearchValue = searchValue ?? ""
    lastAppliedSearchRef.current = nextSearchValue
    setSearchDraft((currentValue) =>
      currentValue === nextSearchValue ? currentValue : nextSearchValue
    )
  }, [searchValue])

  React.useEffect(() => {
    if (!onSearchChange) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      if (lastAppliedSearchRef.current === searchDraft) {
        return
      }

      lastAppliedSearchRef.current = searchDraft
      onSearchChange(searchDraft)
    }, 1000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [onSearchChange, searchDraft])

  const activeFilterCount = React.useMemo(() => countActiveFilters(values), [values])

  const handleClearAll = React.useCallback(() => {
    if (onClear) {
      onClear()
      return
    }

    onApply?.({})
  }, [onApply, onClear])

  const handleRemoveFilterValue = React.useCallback(
    (filterId: string, valueToRemove?: string) => {
      const nextValues = { ...values }
      const currentValue = nextValues[filterId]

      if (Array.isArray(currentValue) && valueToRemove !== undefined) {
        const filteredValues = currentValue.filter(
          (value): value is string => typeof value === "string" && value !== valueToRemove
        )

        if (filteredValues.length > 0) {
          nextValues[filterId] = filteredValues
        } else {
          delete nextValues[filterId]
        }
      } else {
        delete nextValues[filterId]
      }

      if (Object.keys(nextValues).length === 0 && onClear) {
        onClear()
        return
      }

      onApply?.(nextValues)
    },
    [onApply, onClear, values]
  )

  const hasToolbarControls = Boolean(onSearchChange) || filters.length > 0

  if (!hasToolbarControls) {
    return null
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2 w-full">
        {filters.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            className="h-9 shrink-0 bg-card"
            onClick={() => setIsOverlayOpen(true)}
          >
            <Filter className="h-4 w-4 opacity-80" />
            <span>Filters</span>
            {activeFilterCount > 0 ? (
              <Badge
                variant="outline"
                className="h-5 min-w-5 rounded-full border-border/60 px-1.5 text-caption"
                aria-hidden="true"
              >
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
        ) : null}
        {filters.length > 0 ? (
          <Button type="button" variant="outline" className="h-9 shrink-0 bg-card">
            <SlidersHorizontal className="h-4 w-4 opacity-80" />
            <span>Perspectives</span>
          </Button>
        ) : null}
        {onSearchChange ? (
          <div className="relative w-full sm:w-auto sm:min-w-[180px] sm:max-w-[240px] sm:ml-auto">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 pl-8 pr-2 text-meta"
            />
          </div>
        ) : null}
      </div>
      {filters.length > 0 && activeFilterCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => {
            const value = values[filter.id]

            if (!isFilterValueActive(value)) {
              return null
            }

            if (Array.isArray(value)) {
              return value
                .filter((entry): entry is string => typeof entry === "string")
                .map((entry) => {
                  const label = formatFilterValueLabel(filter, entry)

                  if (!label) {
                    return null
                  }

                  return (
                    <Button
                      key={`${filter.id}:${entry}`}
                      type="button"
                      variant="outline"
                      size="xs"
                      className="max-w-full"
                      onClick={() => handleRemoveFilterValue(filter.id, entry)}
                    >
                      <span className="truncate">
                        {filter.label}: {label}
                      </span>
                      <X className="size-3" />
                    </Button>
                  )
                })
            }

            const label = formatFilterValueLabel(filter, value)

            if (!label) {
              return null
            }

            return (
              <Button
                key={filter.id}
                type="button"
                variant="outline"
                size="xs"
                className="max-w-full"
                onClick={() => handleRemoveFilterValue(filter.id)}
              >
                <span className="truncate">
                  {filter.label}: {label}
                </span>
                <X className="size-3" />
              </Button>
            )
          })}
          <Button type="button" variant="ghost" size="xs" onClick={handleClearAll}>
            Clear all
          </Button>
        </div>
      ) : null}
      <FilterOverlay
        open={isOverlayOpen}
        onOpenChange={setIsOverlayOpen}
        filters={filters}
        initialValues={values}
        onApply={(nextValues) => onApply?.(nextValues)}
        onClear={onClear}
      />
    </div>
  )
}

export type { FilterDef, FilterValues } from "@/components/ui/filter-overlay"
