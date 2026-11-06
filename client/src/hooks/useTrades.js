/**
 * useTrades.js
 * Fix #1  — SSE init no longer carries 2000 trades; client fetches via REST
 * Fix #4  — page cap warns user instead of silently truncating
 * Fix #6  — loading timeout fallback so spinner never hangs forever
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API        = import.meta.env.VITE_API_URL || 'http://localhost:4000/proxy';
const PAGE_SIZE  = 500;
const MAX_PAGES  = 5; // hard cap = 2500 records max
const LOAD_TIMEOUT_MS = 8000; // Fix #6: clear loading after 8s no matter what

export function useTrades() {
  const [trades,       setTrades]       = useState([]);
  const [pullStatus,   setPullStatus]   = useState(null);
  const [notification, setNotification] = useState(null);
  const [connected,    setConnected]    = useState(false);
  const [serverError,  setServerError]  = useState(false);
  const [loading,      setLoading]      = useState(true);
  const esRef          = useRef(null);
  const fetchTradesRef = useRef(null);

  // ── fetch with pagination + page cap warning (Fix #4) ─────────────────────
  const fetchTrades = useCallback(async () => {
    try {
      let all = [], page = 1, totalPages = 1, cappedWarning = false;

      do {
        const res  = await fetch(`${API}/getTrades?page=${page}&pageSize=${PAGE_SIZE}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.success) throw new Error("API error");

        all        = page === 1 ? json.trades : [...all, ...json.trades];
        totalPages = json.meta.totalPages;
        setPullStatus(prev => ({ ...prev, ...json.meta }));

        if (page >= MAX_PAGES && totalPages > MAX_PAGES) {
          cappedWarning = true;
          break; // Fix #4: stop but warn
        }
        page++;
      } while (page <= totalPages);

      setTrades(all);
      setServerError(false);

      if (cappedWarning) {
        showNotification('error',
          `Showing ${all.length.toLocaleString()} of ${(totalPages * PAGE_SIZE).toLocaleString()}+ trades. Dataset exceeds display limit.`
        );
      }
    } catch (err) {
      console.error('[useTrades] fetch failed:', err);
      setServerError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Keep stable ref so SSE handlers can call it without effect re-running
  useEffect(() => { fetchTradesRef.current = fetchTrades; }, [fetchTrades]);

  useEffect(() => {
    // Fix #6: loading timeout — clear spinner after 8s even if server never responds
    const loadingTimer = setTimeout(() => {
      setLoading(false);
      setServerError(true);
    }, LOAD_TIMEOUT_MS);

    fetchTradesRef.current?.().then(() => clearTimeout(loadingTimer));

    const es = new EventSource(`${API}/events`);
    esRef.current = es;

    es.addEventListener('open',  () => { setConnected(true); setServerError(false); });
    es.addEventListener('error', () => setConnected(false));

    // Fix #1: init only carries pullStatus + count, not trades
    // Client already fetched via REST above
    es.addEventListener('init', (e) => {
      const data = JSON.parse(e.data);
      setPullStatus(data.pullStatus);
      // Only set trades from init if REST fetch returned nothing (edge case)
      if (data.trades?.length > 0) setTrades(data.trades);
      setConnected(true);
      setLoading(false);
      clearTimeout(loadingTimer);
    });

    es.addEventListener('pull_started', (e) => {
      const data = JSON.parse(e.data);
      setPullStatus(prev => ({ ...prev, state: 'running', ...data }));
      showNotification('info', `Pull started — ${data.totalRecords?.toLocaleString()} records incoming`);
    });

    // Delta merge with dedup
    es.addEventListener('pull_progress', (e) => {
      const data = JSON.parse(e.data);
      setPullStatus(prev => ({ ...prev, ...data, state: 'running' }));
      if (data.newTrades?.length > 0) {
        setTrades(prev => {
          const seen  = new Set(prev.map(t => t.tradeId));
          const fresh = data.newTrades.filter(t => !seen.has(t.tradeId));
          return fresh.length > 0 ? [...fresh, ...prev] : prev;
        });
      }
    });

    // Signal only — re-fetch authoritatively
    es.addEventListener('pull_complete', (e) => {
      const data = JSON.parse(e.data);
      setPullStatus(prev => ({ ...prev, state: 'completed', completedAt: data.completedAt, totalRecords: data.totalRecords, progress: 100 }));
      fetchTradesRef.current?.();
      showNotification('success', `Pull complete — ${data.totalRecords?.toLocaleString()} trades loaded`);
    });

    es.addEventListener('pull_error', (e) => {
      const data = JSON.parse(e.data);
      setPullStatus(prev => ({ ...prev, state: 'failed', error: data.error }));
      showNotification('error', `Pull failed: ${data.error}`);
    });

    es.addEventListener('server_shutdown', () => {
      setConnected(false);
      showNotification('error', 'Server restarting — reconnecting automatically…');
    });

    return () => {
      clearTimeout(loadingTimer);
      es.close();
      setConnected(false);
    };
  }, []); // stable — SSE created once

  function showNotification(type, message) {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 6000);
  }

  async function triggerPull() {
    try {
      const res  = await fetch(`${API}/pull/start`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) showNotification('error', json.message);
    } catch {
      showNotification('error', 'Could not reach server');
    }
  }

  return { trades, pullStatus, notification, connected, serverError, loading, triggerPull, refetch: fetchTrades };
}
