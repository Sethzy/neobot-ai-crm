/**
 * Tests for StaleIndicator component.
 * @module components/analyst/stale-indicator.test
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { StaleIndicator } from './stale-indicator';

describe('StaleIndicator', () => {
  it('renders nothing when data is not stale', () => {
    const { container } = render(<StaleIndicator isStale={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows icon when data is stale', () => {
    render(<TooltipProvider><StaleIndicator isStale={true} /></TooltipProvider>);

    expect(screen.getByLabelText(/new uploads detected/i)).toBeInTheDocument();
  });

  it('renders warning icon with amber color', () => {
    render(<TooltipProvider><StaleIndicator isStale={true} /></TooltipProvider>);

    const icon = screen.getByLabelText(/new uploads detected/i).querySelector('svg');
    expect(icon).toHaveClass('text-warning');
  });
});
