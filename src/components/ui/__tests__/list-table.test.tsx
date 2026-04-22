/**
 * Tests for the shared list table shell.
 * @module components/ui/__tests__/list-table.test
 */
import { render, screen, within } from "@testing-library/react"
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
})
