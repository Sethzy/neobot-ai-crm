/**
 * Tests for the shared CRM filter overlay panel.
 * @module components/ui/__tests__/filter-overlay.test
 */
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { FilterOverlay } from "../filter-overlay"

describe("FilterOverlay", () => {
  it("applies edited filter values", async () => {
    const user = userEvent.setup()
    const applySpy = vi.fn()

    render(
      <FilterOverlay
        open
        onOpenChange={vi.fn()}
        onApply={applySpy}
        filters={[
          { id: "query", label: "Search term", type: "text" },
          {
            id: "status",
            label: "Status",
            type: "select",
            options: [{ value: "active", label: "Active" }],
          },
          { id: "hasEmail", label: "Has Email", type: "checkbox" },
          { id: "createdAt", label: "Created At", type: "dateRange" },
        ]}
        initialValues={{}}
      />
    )

    await user.type(screen.getByRole("textbox", { name: "Search term" }), "Sarah")
    await user.selectOptions(screen.getByLabelText("Status"), "active")
    await user.selectOptions(screen.getByLabelText("Has Email"), "true")
    await user.type(screen.getByLabelText("Created At From"), "2026-03-01")
    await user.type(screen.getByLabelText("Created At To"), "2026-03-05")
    await user.click(screen.getAllByRole("button", { name: "Apply" })[0])

    expect(applySpy).toHaveBeenCalledWith({
      query: "Sarah",
      status: "active",
      hasEmail: true,
      createdAt: { from: "2026-03-01", to: "2026-03-05" },
    })
  })

  it("clears current filters through the shared clear handler", async () => {
    const user = userEvent.setup()
    const clearSpy = vi.fn()

    render(
      <FilterOverlay
        open
        onOpenChange={vi.fn()}
        onApply={vi.fn()}
        onClear={clearSpy}
        filters={[{ id: "query", label: "Search term", type: "text" }]}
        initialValues={{ query: "Existing value" }}
      />
    )

    expect(screen.getByRole("textbox", { name: "Search term" })).toHaveValue("Existing value")

    await user.click(screen.getAllByRole("button", { name: "Clear" })[0])

    expect(clearSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("textbox", { name: "Search term" })).toHaveValue("")
  })

  it("emits boolean checkbox filter values and removes blank selections", async () => {
    const user = userEvent.setup()
    const applySpy = vi.fn()

    render(
      <FilterOverlay
        open
        onOpenChange={vi.fn()}
        onApply={applySpy}
        filters={[{ id: "vip", label: "VIP", type: "checkbox" }]}
        initialValues={{}}
      />,
    )

    await user.selectOptions(screen.getByLabelText("VIP"), "true")
    await user.click(screen.getAllByRole("button", { name: "Apply" })[0])
    expect(applySpy).toHaveBeenLastCalledWith({ vip: true })

    await user.selectOptions(screen.getByLabelText("VIP"), "false")
    await user.click(screen.getAllByRole("button", { name: "Apply" })[0])
    expect(applySpy).toHaveBeenLastCalledWith({ vip: false })

    await user.selectOptions(screen.getByLabelText("VIP"), "")
    await user.click(screen.getAllByRole("button", { name: "Apply" })[0])
    expect(applySpy).toHaveBeenLastCalledWith({})
  })

  it("preserves in-progress draft state when the parent re-renders with equal initial values", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <FilterOverlay
        open
        onOpenChange={vi.fn()}
        onApply={vi.fn()}
        filters={[{ id: "query", label: "Search term", type: "text" }]}
        initialValues={{ query: "Existing value" }}
      />,
    )

    const input = screen.getByRole("textbox", { name: "Search term" })
    await user.clear(input)
    await user.type(input, "typing")

    rerender(
      <FilterOverlay
        open
        onOpenChange={vi.fn()}
        onApply={vi.fn()}
        filters={[{ id: "query", label: "Search term", type: "text" }]}
        initialValues={{ query: "Existing value" }}
      />,
    )

    expect(screen.getByRole("textbox", { name: "Search term" })).toHaveValue("typing")
  })
})
