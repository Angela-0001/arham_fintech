import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Charts } from './Charts.jsx';

const sampleTrades = [
  { tradeId: 'BSE000001', tradeType: 'BUY', symbol: 'RELIANCE', value: 250000, tradeDate: '2024-01-15', timestamp: '2024-01-15T10:00:00.000Z' },
  { tradeId: 'BSE000002', tradeType: 'SELL', symbol: 'TCS', value: 190000, tradeDate: '2024-01-15', timestamp: '2024-01-15T09:00:00.000Z' },
  { tradeId: 'BSE000003', tradeType: 'BUY', symbol: 'RELIANCE', value: 300000, tradeDate: '2024-01-14', timestamp: '2024-01-14T10:00:00.000Z' },
];

describe('Charts accessibility', () => {
  it('renders a role="img" with aria-label for each chart', () => {
    render(<Charts trades={sampleTrades} />);

    const buySell = screen.getByRole('img', { name: /buy vs sell volume chart/i });
    expect(buySell).toBeInTheDocument();

    const topSymbols = screen.getByRole('img', { name: /top 10 symbols by trades chart/i });
    expect(topSymbols).toBeInTheDocument();

    const valueByDate = screen.getByRole('img', { name: /trade value by date chart/i });
    expect(valueByDate).toBeInTheDocument();
  });

  it('renders without throwing for valid trades', () => {
    expect(() => render(<Charts trades={sampleTrades} />)).not.toThrow();
  });

  it('renders nothing when trades array is empty', () => {
    const { container } = render(<Charts trades={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
