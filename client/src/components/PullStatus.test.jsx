import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PullStatus } from './PullStatus.jsx';

describe('PullStatus accessibility', () => {
  it('renders a progressbar with correct aria attributes', () => {
    render(
      <PullStatus pullStatus={{
        state: 'running',
        progress: 42,
        pulledRecords: 840,
        totalRecords: 2000,
        batchNumber: 5,
        totalBatches: 20,
      }} />
    );

    const bar = screen.getByRole('progressbar');
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute('aria-label', 'Pull progress');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('renders nothing when state is idle', () => {
    const { container } = render(<PullStatus pullStatus={{ state: 'idle' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when state is completed', () => {
    const { container } = render(<PullStatus pullStatus={{ state: 'completed', progress: 100 }} />);
    expect(container.firstChild).toBeNull();
  });
});
