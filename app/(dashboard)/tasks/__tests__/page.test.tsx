/**
 * Tests for Tasks page query states.
 * @module app/(dashboard)/tasks/__tests__/page
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TasksPage from "../page";

const mockInvalidateQueries = vi.fn();
const mockOpen = vi.fn();
const mockCaptureTimelineActivity = vi.fn().mockResolvedValue(true);
const mockFrom = vi.fn();
const mockUseMutation = vi.fn();
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockTaskCalendarView = vi.fn(() => <div>Mock Calendar View</div>);

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/tasks",
}));

vi.mock("@/hooks/use-crm-tasks", () => ({
  useCrmTasks: vi.fn(),
  crmTaskKeys: { all: ["crm-tasks"] },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
    useMutation: (...args: unknown[]) => mockUseMutation(...args),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return { unsubscribe: vi.fn() };
      },
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/components/ui/list-table", () => ({
  ListTable: () => <div>CRM Tasks Table</div>,
}));

vi.mock("@/components/crm/task-calendar-view", () => ({
  TaskCalendarView: mockTaskCalendarView,
}));

vi.mock("@/hooks/use-record-drawer", () => ({
  useRecordDrawer: () => ({
    isOpen: false,
    recordId: null,
    open: mockOpen,
    close: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-client-id", () => ({
  useClientId: () => ({
    data: "client-1",
  }),
}));

vi.mock("@/hooks/use-update-crm-task", () => ({
  useUpdateCrmTaskMutation: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/hooks/use-crm-views", () => ({
  useCrmViews: () => ({
    data: [],
  }),
}));

vi.mock("@/hooks/use-crm-config", () => ({
  useCrmConfig: () => ({
    data: {
      hasConfig: false,
      config: {
        task_custom_fields: [],
      },
    },
  }),
}));

vi.mock("@/lib/crm/timeline-capture", () => ({
  captureTimelineActivity: (...args: unknown[]) => mockCaptureTimelineActivity(...args),
}));

describe("TasksPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMutation.mockImplementation((options: {
      mutationFn: (variables?: unknown) => Promise<unknown>;
      onSuccess?: (data: unknown) => Promise<void> | void;
      onError?: (error: unknown) => void;
    }) => ({
      mutate: (variables?: unknown) => {
        void options.mutationFn(variables)
          .then((data) => options.onSuccess?.(data))
          .catch((error) => options.onError?.(error));
      },
      mutateAsync: vi.fn(),
      isPending: false,
    }));
  });

  it("shows error state and retries when tasks query fails", async () => {
    const { useCrmTasks } = await import("@/hooks/use-crm-tasks");
    const mockRefetch = vi.fn();

    vi.mocked(useCrmTasks).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as never);

    render(<TasksPage />);

    expect(screen.getByText(/unable to load tasks/i)).toBeInTheDocument();
    screen.getByRole("button", { name: /retry/i }).click();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("shows empty state with icon when no tasks exist", async () => {
    const { useCrmTasks } = await import("@/hooks/use-crm-tasks");

    vi.mocked(useCrmTasks).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);

    render(<TasksPage />);

    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument();
  });

  it("does not load the calendar bundle when the table view is active", async () => {
    const { useCrmTasks } = await import("@/hooks/use-crm-tasks");

    vi.mocked(useCrmTasks).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);

    render(<TasksPage />);

    expect(mockTaskCalendarView).not.toHaveBeenCalled();
  });

  it("captures a created timeline activity when a task is created from the page", async () => {
    const { useCrmTasks } = await import("@/hooks/use-crm-tasks");
    vi.mocked(useCrmTasks).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);

    const insertSingle = vi.fn().mockResolvedValue({
      data: {
        task_id: "task-2",
        client_id: "client-1",
        title: "New Task",
        status: "todo",
        description: null,
        due_date: null,
        contact_id: null,
        deal_id: null,
        custom_fields: {},
        created_at: "2026-04-05T10:00:00+08:00",
        updated_at: "2026-04-05T10:00:00+08:00",
      },
      error: null,
    });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });

    mockFrom.mockImplementation((table: string) => {
      if (table === "crm_tasks") {
        return { insert };
      }

      return {};
    });

    const user = userEvent.setup();
    render(<TasksPage />);

    await user.click(screen.getByRole("button", { name: /^new$/i }));

    expect(mockCaptureTimelineActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-1",
        recordType: "task",
        recordId: "task-2",
        action: "created",
        actorType: "user",
        after: expect.objectContaining({
          task_id: "task-2",
        }),
      }),
    );
    expect(mockOpen).toHaveBeenCalledWith("task-2");
  });
});
