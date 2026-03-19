/**
 * Tests for ChatMessage component.
 * @module components/analyst/chat-message.test
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatMessage } from './chat-message';
import type { UIMessage } from '@/hooks/use-analyst-chat';

describe('ChatMessage', () => {
  it('renders text parts', () => {
    const message: UIMessage = {
      id: 'msg-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Hello, how can I help?' }],
    };

    render(<ChatMessage message={message} />);

    expect(screen.getByText('Hello, how can I help?')).toBeInTheDocument();
  });

  it('applies user background style for user messages', () => {
    const message: UIMessage = {
      id: 'msg-1',
      role: 'user',
      parts: [{ type: 'text', text: 'What is this data?' }],
    };

    const { container } = render(<ChatMessage message={message} />);

    // User messages align right and use the tokenized muted background
    expect(container.firstChild).toHaveClass('justify-end');
    const bubble = container.querySelector('.bg-muted');
    expect(bubble).toBeInTheDocument();
  });

  it('applies assistant background style for assistant messages', () => {
    const message: UIMessage = {
      id: 'msg-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Let me analyze that.' }],
    };

    const { container } = render(<ChatMessage message={message} />);

    // Assistant messages align left and have transparent background
    expect(container.firstChild).toHaveClass('justify-start');
    const bubble = container.querySelector('.bg-transparent');
    expect(bubble).toBeInTheDocument();
  });

  it('renders file parts with FileDownload component', () => {
    const message: UIMessage = {
      id: 'msg-1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Here is your report:' },
        { type: 'file', url: 'https://example.com/report.xlsx', mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'report.xlsx' },
      ],
    };

    render(<ChatMessage message={message} />);

    expect(screen.getByText('Here is your report:')).toBeInTheDocument();
    expect(screen.getByText('report.xlsx')).toBeInTheDocument();
  });

  it('renders code execution tool parts with ToolExecutionStep', () => {
    const message: UIMessage = {
      id: 'msg-1',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolCallId: 'call-1',
          toolName: 'code_execution',
          state: 'output-available',
          input: { code: 'print("hello")' },
          output: { stdout: 'hello' },
        },
      ],
    };

    render(<ChatMessage message={message} />);

    expect(screen.getByText('Code Sandbox')).toBeInTheDocument();
  });

  it('renders bash tool parts with ToolExecutionStep', () => {
    const message: UIMessage = {
      id: 'msg-1',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolCallId: 'call-2',
          toolName: 'bash',
          state: 'output-available',
          input: { command: 'ls -la' },
          output: { stdout: 'total 0' },
        },
      ],
    };

    render(<ChatMessage message={message} />);

    expect(screen.getByText('Code Sandbox')).toBeInTheDocument();
  });

  it('renders reasoning parts as collapsible ThinkingBlock', async () => {
    const user = userEvent.setup();
    const message: UIMessage = {
      id: 'msg-1',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'Let me think about this problem...' },
        { type: 'text', text: 'The answer is 42.' },
      ],
    };

    render(<ChatMessage message={message} />);

    expect(screen.getByText('Thinking Process')).toBeInTheDocument();
    expect(screen.getByText('The answer is 42.')).toBeInTheDocument();

    // Expand thinking block
    await user.click(screen.getByText('Thinking Process'));
    expect(screen.getByText('Let me think about this problem...')).toBeInTheDocument();
  });

  describe('image parts', () => {
    it('renders user-attached images', () => {
      const message: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'image', data: 'iVBORw0KGgo=', mediaType: 'image/png' },
          { type: 'text', text: 'Check this out' },
        ],
      };

      render(<ChatMessage message={message} />);

      expect(screen.getByRole('img')).toBeInTheDocument();
      expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=');
    });
  });
});
