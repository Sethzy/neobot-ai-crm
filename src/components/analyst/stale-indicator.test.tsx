/**
 * Tests for StaleIndicator component.
 * @module components/analyst/stale-indicator.test
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StaleIndicator } from './stale-indicator';

describe('StaleIndicator', () => {
  it('renders nothing when data is not stale', () => {
    const { container } = render(<StaleIndicator isStale={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows icon when data is stale', () => {
    render(<StaleIndicator isStale={true} />);

    expect(screen.getByLabelText(/new documents available/i)).toBeInTheDocument();
  });

  it('renders warning icon with amber color', () => {
    render(<StaleIndicator isStale={true} />);

    const icon = screen.getByLabelText(/new documents available/i).querySelector('svg');
    expect(icon).toHaveClass('text-amber-500');
  });
});
