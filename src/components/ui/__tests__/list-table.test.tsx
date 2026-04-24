/**
 * Tests for the shared list table shell.
 * @module components/ui/__tests__/list-table.test
 */
import { render, screen, within } from "@testing-library/react"
import { fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ListTable } from "../list-table"

interface PersonRow {
  id: string
  name: string
  email: string
  updated_at: string
}

const columns = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "updated_at", header: "Updated" },
] as const

const rows: PersonRow[] = [
  { id: "1", name: "Sarah Chen", email: "sarah@example.com", updated_at: "2026-03-02T12:30:00.000Z" },
  { id: "2", name: "Adam Tan", email: "adam@example.com", updated_at: "2026-03-01T12:30:00.000Z" },
]

if (!HTMLElement.prototype.hasPointerCapture) {
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: () => false,
  })
}

if (!HTMLElement.prototype.setPointerCapture) {
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: () => undefined,
  })
}

if (!HTMLElement.prototype.releasePointerCapture) {
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: () => undefined,
  })
}

describe("ListTable", () => {
  it("sorts rows, isolates row actions, and forwards pagination clicks", async () => {
    const user = userEvent.setup()
    const rowClickSpy = vi.fn()
    const deleteSpy = vi.fn()
    const pageChangeSpy = vi.fn()

    render(
      <ListTable<PersonRow>
        columns={[...columns]}
        data={rows}
        onRowClick={rowClickSpy}
        rowActions={(row) => [
          {
            id: `delete-${row.id}`,
            label: "Delete",
            onSelect: () => deleteSpy(row.id),
            destructive: true,
          },
        ]}
        pagination={{
          page: 1,
          pageSize: 20,
          total: 47,
          totalPages: 3,
          onPageChange: pageChangeSpy,
        }}
      />,
    )

    await user.click(screen.getByRole("button", { name: /Name/i }))

    const tableRows = within(screen.getByRole("table")).getAllByRole("row")
    expect(within(tableRows[1]).getByText("Adam Tan")).toBeInTheDocument()
    expect(within(tableRows[2]).getByText("Sarah Chen")).toBeInTheDocument()

    await user.click(within(tableRows[1]).getByText("Adam Tan"))
    expect(rowClickSpy).toHaveBeenCalledWith(rows[1])

    await user.click(within(tableRows[1]).getByRole("button", { name: "Open row actions" }))
    await user.click(screen.getByRole("menuitem", { name: "Delete" }))

    expect(deleteSpy).toHaveBeenCalledWith("2")
    expect(rowClickSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Showing 1 to 20 of 47 results")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(pageChangeSpy).toHaveBeenCalledWith(2)
  })

  it("renders error and empty states", () => {
    const { rerender } = render(
      <ListTable<PersonRow> columns={[...columns]} data={[]} error="Failed to load" />,
    )
    expect(screen.getByText("Failed to load")).toBeInTheDocument()

    rerender(<ListTable<PersonRow> columns={[...columns]} data={[]} />)
    expect(screen.getByText("No results.")).toBeInTheDocument()
  })

  it("applies resized widths and notifies when a column resize finishes", async () => {
    const onColumnResize = vi.fn()

    render(
      <ListTable<PersonRow>
        columns={[
          { accessorKey: "name", header: "Name", size: 200, minSize: 104 },
          { accessorKey: "email", header: "Email", size: 220, minSize: 104 },
          { accessorKey: "updated_at", header: "Updated", size: 140, minSize: 104 },
        ]}
        data={rows}
        onColumnResize={onColumnResize}
      />,
    )

    const resizeHandle = screen.getByRole("button", { name: /resize name column/i })
    fireEvent.mouseDown(resizeHandle, { clientX: 200 })
    fireEvent.mouseMove(document, { clientX: 260 })
    fireEvent.mouseUp(document, { clientX: 260 })

    expect(await screen.findByRole("button", { name: /resize email column/i })).toBeInTheDocument()
    expect(onColumnResize).toHaveBeenCalledWith("name", 260)
    expect(screen.getByText("Name").closest("th")).toHaveStyle({ width: "260px" })
    expect(screen.getByText("Sarah Chen").closest("td")).toHaveStyle({ width: "260px" })
  })
})
