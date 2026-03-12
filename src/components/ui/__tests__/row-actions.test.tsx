/**
 * Tests for the shared CRM row action menu.
 * @module components/ui/__tests__/row-actions.test
 */
import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RowActions } from "../row-actions"

describe("RowActions", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("opens on click and executes actions without bubbling to the parent row", async () => {
    const user = userEvent.setup()
    const parentClickSpy = vi.fn()
    const deleteSpy = vi.fn()

    render(
      <div onClick={parentClickSpy}>
        <RowActions
          items={[
            { label: "Open in tab", href: "/customers/people/1", newTab: true },
            { label: "Delete", onSelect: deleteSpy, destructive: true },
          ]}
        />
      </div>
    )

    await user.click(screen.getByRole("button", { name: "Open row actions" }))

    expect(parentClickSpy).not.toHaveBeenCalled()
    expect(screen.getByRole("menuitem", { name: "Open in tab" })).toHaveAttribute(
      "href",
      "/customers/people/1"
    )
    expect(screen.getByRole("menuitem", { name: "Open in tab" })).toHaveAttribute(
      "target",
      "_blank"
    )

    await user.click(screen.getByRole("menuitem", { name: "Delete" }))

    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(parentClickSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument()
  })

  it("opens on hover and closes after the leave delay", () => {
    vi.useFakeTimers()

    render(<RowActions items={[{ label: "View", href: "/customers/people/1" }]} />)

    const trigger = screen.getByRole("button", { name: "Open row actions" })

    fireEvent.pointerEnter(trigger, { pointerType: "mouse" })

    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument()

    fireEvent.pointerLeave(trigger, { pointerType: "mouse" })

    act(() => {
      vi.advanceTimersByTime(149)
    })

    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(screen.queryByRole("menuitem", { name: "View" })).not.toBeInTheDocument()
  })
})
