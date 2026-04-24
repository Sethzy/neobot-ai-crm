/**
 * Tests CRM page-mode navigation context preservation.
 * @module components/crm/__tests__/use-record-open-behavior
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRecordOpenBehavior } from "@/components/crm/use-record-open-behavior";

const mockPush = vi.hoisted(() => vi.fn());
const mockPathname = vi.hoisted(() => vi.fn(() => "/customers/deals"));
const mockSearchParams = vi.hoisted(
  () => vi.fn(() => new URLSearchParams("savedView=view-1&view=kanban")),
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
}));

function Harness({
  openDrawer,
  openMode,
}: {
  openDrawer: (recordId: string) => void;
  openMode: "drawer" | "page";
}) {
  const { openFullPage, openRecord } = useRecordOpenBehavior({
    objectType: "deal",
    openDrawer,
    openMode,
  });

  return (
    <div>
      <button type="button" onClick={() => openRecord("deal-1")}>
        Open record
      </button>
      <button type="button" onClick={() => openFullPage("deal-1")}>
        Open page
      </button>
    </div>
  );
}

describe("useRecordOpenBehavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue("/customers/deals");
    mockSearchParams.mockReturnValue(new URLSearchParams("savedView=view-1&view=kanban"));
  });

  it("pushes page-mode detail routes with the current CRM workspace href", async () => {
    const user = userEvent.setup();
    const openDrawer = vi.fn();

    render(<Harness openDrawer={openDrawer} openMode="page" />);

    await user.click(screen.getByRole("button", { name: "Open record" }));

    expect(openDrawer).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(
      "/customers/deals/deal-1?from=%2Fcustomers%2Fdeals%3FsavedView%3Dview-1%26view%3Dkanban",
    );
  });

  it("keeps drawer mode local instead of navigating", async () => {
    const user = userEvent.setup();
    const openDrawer = vi.fn();

    render(<Harness openDrawer={openDrawer} openMode="drawer" />);

    await user.click(screen.getByRole("button", { name: "Open record" }));

    expect(openDrawer).toHaveBeenCalledWith("deal-1");
    expect(mockPush).not.toHaveBeenCalled();
  });
});
