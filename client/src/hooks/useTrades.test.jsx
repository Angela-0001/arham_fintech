import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../config.js', () => ({
  API_URL: 'http://localhost:4000/proxy',
}));

// ── Mock EventSource ──────────────────────────────────────────────────────
let _listeners = {};

class MockEventSource {
  constructor() {
    this.readyState = 1;
    _listeners = {};
  }
  addEventListener(event, handler) {
    (_listeners[event] ||= []).push(handler);
  }
  removeEventListener() {}
  close() { this.readyState = 2; }
}

function dispatch(event, data) {
  for (const h of _listeners[event] || []) {
    h({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }
}

// ── Mock fetch ─────────────────────────────────────────────────────────────
const mockFetch = vi.fn(async () => ({
  ok: true,
  json: async () => ({ success: true, trades: [], meta: { totalPages: 0 } }),
}));

const { useTrades } = await import('./useTrades.js');

describe('useTrades — notification timer reset', () => {
  let origES, origFetch;

  beforeEach(() => {
    vi.useFakeTimers();
    origES = global.EventSource;
    origFetch = global.fetch;
    global.EventSource = MockEventSource;
    global.fetch = mockFetch;
    _listeners = {};
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.EventSource = origES;
    global.fetch = origFetch;
  });

  it('resets the auto-clear timer so a fast second notification is not cleared early', async () => {
    const { result } = renderHook(() => useTrades());

    // Flush initial effect (fetch + EventSource setup + init event)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await act(async () => {
      dispatch('init', { pullStatus: { state: 'idle' }, totalCommitted: 0 });
    });

    // ── Notification A (pull_started) ──────────────────────────────────────
    await act(async () => {
      dispatch('pull_started', { totalRecords: 2000, estimatedMs: 200, startedAt: '2024-01-01T00:00:00.000Z' });
    });
    expect(result.current.notification).not.toBeNull();
    expect(result.current.notification.message).toContain('Pull started');

    // Advance 3s — timer A has 3s left, notification A still visible
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.notification).not.toBeNull();

    // ── Notification B (pull_complete) ─────────────────────────────────────
    // This should CLEAR timer A and start a fresh 6s timer.
    await act(async () => {
      dispatch('pull_complete', { totalRecords: 2000, completedAt: '2024-01-01T00:00:00.000Z' });
    });
    expect(result.current.notification).not.toBeNull();
    expect(result.current.notification.message).toContain('Pull complete');

    // Advance 3s — if timer A was NOT reset, it would fire NOW and clear
    // notification B early. With the fix, timer B still has 3s left.
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.notification).not.toBeNull();
    expect(result.current.notification.message).toContain('Pull complete');

    // Advance 3s more — 6s since notification B, timer B fires, clears it.
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.notification).toBeNull();
  });

  it('clears a single notification after 6s', async () => {
    const { result } = renderHook(() => useTrades());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await act(async () => {
      dispatch('init', { pullStatus: { state: 'idle' }, totalCommitted: 0 });
    });

    await act(async () => {
      dispatch('pull_started', { totalRecords: 2000, estimatedMs: 200, startedAt: '2024-01-01T00:00:00.000Z' });
    });
    expect(result.current.notification).not.toBeNull();

    // 5s — still visible
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(result.current.notification).not.toBeNull();

    // 1s more (6s total) — cleared
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(result.current.notification).toBeNull();
  });
});
