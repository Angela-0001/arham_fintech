/**
 * useFilters.js — client-side filtering + sorting over the trades array.
 */

import { useState, useMemo } from 'react';

export function useFilters(trades) {
  const [search, setSearch] = useState('');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterType, setFilterType] = useState('');       // BUY | SELL | ''
  const [sortField, setSortField] = useState('timestamp');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const symbols = useMemo(
    () => [...new Set(trades.map(t => t.symbol))].sort(),
    [trades]
  );

  const filtered = useMemo(() => {
    let data = trades;

    if (search) {
      const q = search.toLowerCase();
      data = data.filter(t =>
        t.tradeId.toLowerCase().includes(q) ||
        t.client.toLowerCase().includes(q) ||
        t.symbol.toLowerCase().includes(q)
      );
    }

    if (filterSymbol) data = data.filter(t => t.symbol === filterSymbol);
    if (filterType)   data = data.filter(t => t.tradeType === filterType);

    data = [...data].sort((a, b) => {
      let av = a[sortField], bv = b[sortField];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return data;
  }, [trades, search, filterSymbol, filterType, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(1);
  }

  function resetFilters() {
    setSearch('');
    setFilterSymbol('');
    setFilterType('');
    setPage(1);
  }

  // Reset to page 1 whenever filters change
  const setSearchReset   = v => { setSearch(v);        setPage(1); };
  const setSymbolReset   = v => { setFilterSymbol(v);  setPage(1); };
  const setTypeReset     = v => { setFilterType(v);    setPage(1); };

  return {
    search, setSearch: setSearchReset,
    filterSymbol, setFilterSymbol: setSymbolReset,
    filterType, setFilterType: setTypeReset,
    sortField, sortDir, handleSort,
    paginated, filtered,
    page, setPage, totalPages, PAGE_SIZE,
    symbols, resetFilters,
  };
}
