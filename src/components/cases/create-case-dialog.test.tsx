/**
 * Tests for CreateCaseDialog component.
 * @module components/cases/create-case-dialog.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { CreateCaseDialog } from "./create-case-dialog";

const mockMutate = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@/hooks/use-cases", () => ({
  useCreateCase: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
    isError: false,
    error: null,
  })),
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const createTestRouter = (dialogOpen: boolean, onOpenChange: (open: boolean) => void) => {
  const rootRoute = createRootRoute({
    component: () => (
      <CreateCaseDialog open={dialogOpen} onOpenChange={onOpenChange} />
    ),
  });
  const routeTree = rootRoute;
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
};

const renderWithProviders = (open = true, onOpenChange = vi.fn()) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createTestRouter(open, onOpenChange);

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    ),
    onOpenChange,
  };
};

describe("CreateCaseDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog title when open", async () => {
    renderWithProviders(true);
    expect(await screen.findByText("Create new case")).toBeInTheDocument();
  });

  it("renders all form fields", async () => {
    renderWithProviders(true);
    expect(await screen.findByLabelText(/case name/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/case reference/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/description/i)).toBeInTheDocument();
    // Date fields use Calendar popover instead of input, check by text
    expect(await screen.findByText(/case opened at/i)).toBeInTheDocument();
    expect(await screen.findByText(/case event date/i)).toBeInTheDocument();
  });

  it("shows validation errors for empty required fields", async () => {
    const user = userEvent.setup();
    renderWithProviders(true);

    const submitButton = await screen.findByRole("button", {
      name: /create case/i,
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/case name is required/i)).toBeInTheDocument();
    });
  });

  it("submits form with valid data", async () => {
    const user = userEvent.setup();
    renderWithProviders(true);

    await user.type(await screen.findByLabelText(/case name/i), "Test Case");
    await user.type(await screen.findByLabelText(/case reference/i), "REF-001");

    const submitButton = await screen.findByRole("button", {
      name: /create case/i,
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalled();
    });
  });

  it("calls onOpenChange when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(true, onOpenChange);

    const cancelButton = await screen.findByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
