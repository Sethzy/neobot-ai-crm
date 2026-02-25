/**
 * Tests for Case Detail page.
 * @module routes/cases/$caseId.test
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { UploadProvider } from "@/contexts/upload-context";

const mockCase = {
  id: "case-123",
  case_name: "Smith v Jones",
  case_ref: "CASE-001",
  description: "Motor accident claim",
  case_opened_at: "2025-12-19T10:00:00Z",
  event_date: "2025-11-15",
  created_by: "user-123",
  created_at: "2025-12-19T10:00:00Z",
  updated_at: "2025-12-19T10:00:00Z",
};

vi.mock("@/hooks/use-cases", () => ({
  useCase: vi.fn(() => ({
    data: mockCase,
    isLoading: false,
    isError: false,
  })),
  useUpdateCase: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

vi.mock("@/hooks/use-documents", () => ({
  useDocuments: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
  })),
  useDeleteDocument: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

vi.mock("@/hooks/use-session", () => ({
  useSession: vi.fn(() => ({
    user: { id: "user-123", email: "test@example.com" },
    isLoading: false,
  })),
}));

// Mock AppLayout to avoid sidebar dependencies in tests
vi.mock("@/components/layout/app-layout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

import { CaseDetailPage } from "./$caseId.lazy";

const createTestRouter = () => {
  const rootRoute = createRootRoute();
  const caseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/cases/$caseId",
    component: () => <CaseDetailPage />,
  });
  const routeTree = rootRoute.addChildren([caseRoute]);
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/cases/case-123"] }),
  });
};

const renderWithProviders = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createTestRouter();

  return render(
    <QueryClientProvider client={queryClient}>
      <UploadProvider>
        <RouterProvider router={router} />
      </UploadProvider>
    </QueryClientProvider>
  );
};

describe("CaseDetailPage", () => {
  it("renders breadcrumb with case reference", async () => {
    renderWithProviders();
    // Multiple "CASE-001" elements exist (breadcrumb + header card), use findAllBy
    const caseRefs = await screen.findAllByText("CASE-001");
    expect(caseRefs.length).toBeGreaterThanOrEqual(1);
    // Check nav element contains Cases link
    const allCasesLinks = await screen.findAllByText("Cases");
    expect(allCasesLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("renders case name in header", async () => {
    renderWithProviders();
    expect(await screen.findByText("Smith v Jones")).toBeInTheDocument();
  });

  it("renders case reference and opened date", async () => {
    renderWithProviders();
    expect(await screen.findByText("CASE REFERENCE")).toBeInTheDocument();
    expect(await screen.findByText("CASE OPENED")).toBeInTheDocument();
  });

  it("renders edit button", async () => {
    renderWithProviders();
    expect(
      await screen.findByRole("button", { name: /edit/i })
    ).toBeInTheDocument();
  });

  it("renders Documents and DocGen tabs", async () => {
    renderWithProviders();
    expect(await screen.findByText("Documents")).toBeInTheDocument();
    expect(await screen.findByText("DocGen")).toBeInTheDocument();
  });

  it("shows Documents tab content by default", async () => {
    renderWithProviders();
    expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument();
  });
});
