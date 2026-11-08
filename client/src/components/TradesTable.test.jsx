import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TradesTable } from './TradesTable.jsx';

const sampleTrades = [
  { tradeId: 'BSE000001', timestamp: '2024-01-15T10:00:00.000Z', symbol: 'RELIANCE', client: 'Aditya Capital', tradeType: 'BUY', series: 'EQ', quantity: 100, price: 2500, value: 250000 },
  { tradeId: 'BSE000002', timestamp: '2024-01-15T09:00:00.000Z', symbol: 'TCS', client: 'Bharat Securities', tradeType: 'SELL', series: 'EQ', quantity: 50, price: 3800, value: 190000 },
];

describe('TradesTable accessibility', () => {
  it('renders sort buttons inside column headers', () => {
    render(<TradesTable trades={sampleTrades} sortField="timestamp" sortDir="desc" onSort={() => {}} />);
    const symbolBtn = screen.getByRole('button', { name: /sort by symbol/i });
    expect(symbolBtn).toBeInTheDocument();
    // The th should have scope="col" and aria-sort
    const th = symbolBtn.closest('th');
    expect(th).toHaveAttribute('scope', 'col');
    expect(th).toHaveAttribute('aria-sort');
  });

  it('triggers onSort via keyboard (Tab + Enter)', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(<TradesTable trades={sampleTrades} sortField="timestamp" sortDir="desc" onSort={onSort} />);

    const symbolBtn = screen.getByRole('button', { name: /sort by symbol/i });
    await user.tab();
    // Tab until we reach the button (first button might be a different header)
    while (!symbolBtn.matches(':focus')) {
      await user.tab();
    }
    await user.keyboard('{Enter}');
    expect(onSort).toHaveBeenCalledWith('symbol');
  });

  it('triggers onSort via keyboard (Space)', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(<TradesTable trades={sampleTrades} sortField="timestamp" sortDir="desc" onSort={onSort} />);

    const tradeIdBtn = screen.getByRole('button', { name: /sort by trade id/i });
    while (!tradeIdBtn.matches(':focus')) {
      await user.tab();
    }
    await user.keyboard(' ');
    expect(onSort).toHaveBeenCalledWith('tradeId');
  });

  it('shows aria-sort ascending/descending/none correctly', () => {
    render(<TradesTable trades={sampleTrades} sortField="symbol" sortDir="asc" onSort={() => {}} />);
    const symbolBtn = screen.getByRole('button', { name: /sort by symbol/i });
    const th = symbolBtn.closest('th');
    expect(th).toHaveAttribute('aria-sort', 'ascending');
  });
});
