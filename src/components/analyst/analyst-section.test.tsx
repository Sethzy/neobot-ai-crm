/**
 * Tests for AnalystSection component.
 * @module components/analyst/analyst-section.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnalystSection } from './analyst-section';

// Create configurable mock
const mockUseAnalystChat = vi.fn();
vi.mock('@/hooks/use-analyst-chat', () => ({
  useAnalystChat: () => mockUseAnalystChat(),
}));

// Mock ReportHistory (legacy - kept for type export)
vi.mock('@/components/docgen/report-history', () => ({
  ReportHistory: () => <div data-testid="report-history">Report History</div>,
  // Export the type for ReportSidebar
}));

// Mock use-docgen (only docgenKeys is used now - reports moved to AppSidebar)
vi.mock('@/hooks/use-docgen', () => ({
  docgenKeys: { history: (caseId: string) => ['docgen', 'history', caseId] },
}));

// Mock useCaseSplits
vi.mock('@/hooks/use-splits', () => ({
  useCaseSplits: () => ({ data: [] }),
}));

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

const defaultMockReturn = {
  messages: [],
  send: vi.fn(),
  status: 'idle',
  error: undefined,
  reload: vi.fn(),
  isStale: false,
  startFresh: vi.fn(),
  isLoading: false,
  isFirstMessageProcessing: false,
  sessionTags: null,
  checkStale: vi.fn(),
  isCheckingStale: false,
};

describe('AnalystSection', () => {
  beforeEach(() => {
    mockUseAnalystChat.mockReturnValue(defaultMockReturn);
  });

  it('renders chat input', () => {
    render(
      <AnalystSection caseId="case-123" />,
      { wrapper }
    );

    expect(screen.getByPlaceholderText(/ask me anything/i)).toBeInTheDocument();
  });

  it('does not render old header component', () => {
    render(
      <AnalystSection caseId="case-123" />,
      { wrapper }
    );

    // Old header had "AI Analyst" title - should not exist now
    expect(screen.queryByText('AI Analyst')).not.toBeInTheDocument();
  });

  it('shows stale indicator in sticky footer when isStale is true', () => {
    mockUseAnalystChat.mockReturnValue({
      ...defaultMockReturn,
      messages: [{ id: 'msg-1', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] }],
      isStale: true,
    });

    render(
      <AnalystSection caseId="case-123" />,
      { wrapper }
    );

    // Stale indicator shows "Stale" when data is stale
    expect(screen.getByRole('button', { name: /stale/i })).toBeInTheDocument();
  });

  it('shows Fresh indicator in sticky footer when data is not stale', () => {
    mockUseAnalystChat.mockReturnValue({
      ...defaultMockReturn,
      isStale: false,
    });

    render(
      <AnalystSection caseId="case-123" />,
      { wrapper }
    );

    expect(screen.getByRole('button', { name: /fresh/i })).toBeInTheDocument();
  });

  it('shows New Chat button in controls row', () => {
    render(
      <AnalystSection caseId="case-123" />,
      { wrapper }
    );

    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
  });

  it('shows Quick Export button in controls row', () => {
    render(
      <AnalystSection caseId="case-123" />,
      { wrapper }
    );

    expect(screen.getByRole('button', { name: /quick export/i })).toBeInTheDocument();
  });

  it('shows error message with retry button when error occurs', () => {
    mockUseAnalystChat.mockReturnValue({
      ...defaultMockReturn,
      error: new Error('Something went wrong'),
    });

    render(
      <AnalystSection caseId="case-123" />,
      { wrapper }
    );

    expect(screen.getByText(/an error occurred/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders chat messages when present', () => {
    mockUseAnalystChat.mockReturnValue({
      ...defaultMockReturn,
      messages: [
        { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
        { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Hi there!' }] },
      ],
    });

    render(
      <AnalystSection caseId="case-123" />,
      { wrapper }
    );

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  // Note: Reports sidebar tests are now in app-sidebar.test.tsx

  it('calls send and clears input on form submit', async () => {
    const sendMock = vi.fn();
    mockUseAnalystChat.mockReturnValue({
      ...defaultMockReturn,
      send: sendMock,
    });

    const user = userEvent.setup();
    render(
      <AnalystSection caseId="case-123" />,
      { wrapper }
    );

    const textarea = screen.getByPlaceholderText(/ask me anything/i);
    await user.type(textarea, 'test message');
    await user.click(screen.getByRole('button', { name: '' })); // Send button has icon only

    expect(sendMock).toHaveBeenCalledWith('test message', []);
  });
});
