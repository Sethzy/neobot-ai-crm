/**
 * Tests for CasesTable horizontal scroll on mobile.
 * @module components/cases/cases-table.test
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CasesTable } from "./cases-table";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/hooks/use-local-storage", () => ({
  useLocalStorage: (key: string, initial: unknown) => [initial, vi.fn()],
}));

const mockCase = {
  id: "case-1",
  case_ref: "REF-001",
  case_name: "Test Case",
  description: "A test case",
  case_opened_at: "2026-01-01",
  event_date: "2026-01-01",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  validation_review_completed_at: null,
};

describe("CasesTable", () => {
  it("table element has min-width for mobile horizontal scrolling", () => {
    const { container } = render(<CasesTable cases={[mockCase]} />);
    const table = container.querySelector("table");

    expect(table).not.toBeNull();
    expect(table?.className).toMatch(/min-w-\[/);
  });
});
