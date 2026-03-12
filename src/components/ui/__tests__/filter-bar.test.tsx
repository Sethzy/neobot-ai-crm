/**
 * Tests for the shared CRM filter and search toolbar.
 * @module components/ui/__tests__/filter-bar.test
 */
import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { FilterBar } from "../filter-bar"

describe("FilterBar", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("debounces search changes before notifying the parent", () => {
    vi.useFakeTimers()

    const searchChangeSpy = vi.fn()

    render(
      <FilterBar
        searchValue=""
        onSearchChange={searchChangeSpy}
        searchPlaceholder="Search people"
      />
    )

    fireEvent.change(screen.getByPlaceholderText("Search people"), {
      target: { value: "Sarah" },
    })

    act(() => {
      vi.advanceTimersByTime(999)
    })

    expect(searchChangeSpy).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(searchChangeSpy).toHaveBeenCalledWith("Sarah")
  })

  it("renders active chips, removes a single filter, and clears all filters", async () => {
    const user = userEvent.setup()
    const applySpy = vi.fn()
    const clearSpy = vi.fn()

    render(
      <FilterBar
        filters={[
          {
            id: "status",
            label: "Status",
            type: "select",
            options: [{ value: "active", label: "Active" }],
          },
          {
            id: "source",
            label: "Source",
            type: "select",
            options: [{ value: "referral", label: "Referral" }],
          },
        ]}
        values={{ status: "active", source: "referral" }}
        onApply={applySpy}
        onClear={clearSpy}
      />
    )

    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Filters/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Perspectives" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Status: Active/i }))

    expect(applySpy).toHaveBeenCalledWith({ source: "referral" })

    await user.click(screen.getByRole("button", { name: "Clear all" }))

    expect(clearSpy).toHaveBeenCalledTimes(1)
  })
})
