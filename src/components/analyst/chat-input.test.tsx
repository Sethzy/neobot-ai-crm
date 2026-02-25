/**
 * Tests for ChatInput component.
 * @module components/analyst/chat-input.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from './chat-input';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

describe('ChatInput', () => {
  /** Default props for ChatInput with filter fields */
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    isLoading: false,
    availableTags: ['invoice', 'po'],
    selectedTags: [],
    onTagChange: vi.fn(),
    isFilterLocked: false,
    tagCounts: { invoice: 5, po: 3 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders textarea with placeholder', () => {
    render(<ChatInput {...defaultProps} />);

    expect(screen.getByPlaceholderText(/assign work or ask anything/i)).toBeInTheDocument();
  });

  it('disables textarea and button when loading', () => {
    render(<ChatInput {...defaultProps} value="test" isLoading={true} />);

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: '' })).toBeDisabled(); // Send button has no text
  });

  it('disables button when input is empty', () => {
    render(<ChatInput {...defaultProps} value="" />);

    // The submit button (Send icon) should be disabled
    const buttons = screen.getAllByRole('button');
    const submitButton = buttons.find((btn) => btn.getAttribute('type') === 'submit');
    expect(submitButton).toBeDisabled();
  });

  it('enables button when input has content', () => {
    render(<ChatInput {...defaultProps} value="hello" />);

    const buttons = screen.getAllByRole('button');
    const submitButton = buttons.find((btn) => btn.getAttribute('type') === 'submit');
    expect(submitButton).not.toBeDisabled();
  });

  it('submits form on Enter (without Shift)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e) => e.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <ChatInput {...defaultProps} value="test message" />
      </form>
    );

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '{Enter}');

    expect(onSubmit).toHaveBeenCalled();
  });

  it('does not submit on Shift+Enter (allows newline)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e) => e.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <ChatInput {...defaultProps} value="test message" />
      </form>
    );

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '{Shift>}{Enter}{/Shift}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  describe('image attachments', () => {
    it('renders image thumbnails when images are attached', () => {
      const file = new File(['test'], 'screenshot.png', { type: 'image/png' });
      render(
        <ChatInput
          {...defaultProps}
          attachedImages={[file]}
          onImagesChange={vi.fn()}
        />
      );

      expect(screen.getByRole('img', { name: /screenshot\.png/i })).toBeInTheDocument();
    });

    it('calls onImagesChange when remove button clicked', async () => {
      const user = userEvent.setup();
      const file = new File(['test'], 'screenshot.png', { type: 'image/png' });
      const onImagesChange = vi.fn();

      render(
        <ChatInput
          {...defaultProps}
          attachedImages={[file]}
          onImagesChange={onImagesChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /remove screenshot\.png/i }));
      expect(onImagesChange).toHaveBeenCalledWith([]);
    });

    it('renders attachment button', () => {
      render(<ChatInput {...defaultProps} attachedImages={[]} onImagesChange={vi.fn()} />);
      expect(screen.getByRole('button', { name: /add screenshots/i })).toBeInTheDocument();
    });

    it('opens file picker when attachment button clicked', async () => {
      const user = userEvent.setup();
      render(<ChatInput {...defaultProps} attachedImages={[]} onImagesChange={vi.fn()} />);

      const attachButton = screen.getByRole('button', { name: /add screenshots/i });
      await user.click(attachButton);

      // File input should exist (hidden)
      expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
    });

    it('handles image paste from clipboard', async () => {
      const user = userEvent.setup();
      const onImagesChange = vi.fn();
      const file = new File(['test'], 'screenshot.png', { type: 'image/png' });

      render(<ChatInput {...defaultProps} attachedImages={[]} onImagesChange={onImagesChange} />);

      const textarea = screen.getByRole('textbox');

      // Simulate paste event with image
      const clipboardData = {
        items: [{ type: 'image/png', getAsFile: () => file }],
      };
      await user.click(textarea);
      fireEvent.paste(textarea, { clipboardData });

      expect(onImagesChange).toHaveBeenCalledWith([file]);
    });

    it('handles image drop', () => {
      const onImagesChange = vi.fn();
      const file = new File(['test'], 'screenshot.png', { type: 'image/png' });

      render(<ChatInput {...defaultProps} attachedImages={[]} onImagesChange={onImagesChange} />);

      const container = screen.getByRole('textbox').closest('div.rounded-2xl');

      fireEvent.dragOver(container!, { dataTransfer: { types: ['Files'] } });
      fireEvent.drop(container!, {
        dataTransfer: { files: [file], types: ['Files'] },
      });

      expect(onImagesChange).toHaveBeenCalledWith([file]);
    });

    it('shows drop zone highlight on drag over', () => {
      render(<ChatInput {...defaultProps} attachedImages={[]} onImagesChange={vi.fn()} />);

      const container = screen.getByRole('textbox').closest('div.rounded-2xl');

      fireEvent.dragOver(container!, { dataTransfer: { types: ['Files'] } });

      expect(container).toHaveClass('border-dashed');
    });

    it('shows error toast for file over 5MB', () => {
      const largeFile = new File(['x'.repeat(6 * 1024 * 1024)], 'large.png', { type: 'image/png' });
      const onImagesChange = vi.fn();

      render(<ChatInput {...defaultProps} attachedImages={[]} onImagesChange={onImagesChange} />);

      // Simulate file selection via input
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [largeFile] } });

      expect(toast.error).toHaveBeenCalledWith('Image must be under 5MB');
      expect(onImagesChange).not.toHaveBeenCalled();
    });

    it('shows error toast when max images reached', () => {
      const files = Array.from({ length: 5 }, (_, i) =>
        new File(['x'], `img${i}.png`, { type: 'image/png' })
      );
      const onImagesChange = vi.fn();

      render(<ChatInput {...defaultProps} attachedImages={files} onImagesChange={onImagesChange} />);

      const newFile = new File(['x'], 'extra.png', { type: 'image/png' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [newFile] } });

      expect(toast.error).toHaveBeenCalledWith('You can only attach 5 images at a time');
    });

    it('enables submit button when images attached without text', () => {
      const file = new File(['test'], 'screenshot.png', { type: 'image/png' });
      render(
        <ChatInput
          {...defaultProps}
          value=""
          attachedImages={[file]}
          onImagesChange={vi.fn()}
        />
      );

      const buttons = screen.getAllByRole('button');
      const submitButton = buttons.find((btn) => btn.getAttribute('type') === 'submit');
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('template upload', () => {
    it('renders template upload button', () => {
      render(
        <ChatInput
          {...defaultProps}
          templateFiles={[]}
          onTemplateFilesChange={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /attach template files/i })).toBeInTheDocument();
    });

    it('hides template upload after first message', () => {
      render(
        <ChatInput
          {...defaultProps}
          templateFiles={[]}
          onTemplateFilesChange={vi.fn()}
          isFilterLocked={true}
        />
      );

      expect(
        screen.queryByRole('button', { name: /attach template files/i })
      ).not.toBeInTheDocument();
    });

    it('displays template file chips', () => {
      const files = [
        new File([''], 'budget.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ];

      render(
        <ChatInput
          {...defaultProps}
          templateFiles={files}
          onTemplateFilesChange={vi.fn()}
        />
      );

      expect(screen.getByText('budget.xlsx')).toBeInTheDocument();
    });
  });

  describe('doc type filter', () => {
    it('shows filter dropdown when not locked', () => {
      render(<ChatInput {...defaultProps} />);

      expect(screen.getByRole('button', { name: /all doc types/i })).toBeInTheDocument();
    });

    it('shows lock icon when filter is locked', () => {
      render(<ChatInput {...defaultProps} isFilterLocked={true} />);

      // Locked state shows a disabled button with lock icon
      const filterButton = screen.getByRole('button', { name: /all doc types/i });
      expect(filterButton).toBeDisabled();
    });

    it('shows selected tag count in label', () => {
      render(
        <ChatInput {...defaultProps} selectedTags={['invoice', 'po']} />
      );

      expect(screen.getByRole('button', { name: /2 selected/i })).toBeInTheDocument();
    });
  });
});
