import { useTrades }      from './hooks/useTrades.js';
import { useFilters }     from './hooks/useFilters.js';
import { Header }         from './components/Header.jsx';
import { StatsBar }       from './components/StatsBar.jsx';
import { PullStatus }     from './components/PullStatus.jsx';
import { Charts }         from './components/Charts.jsx';
import { Filters }        from './components/Filters.jsx';
import { TradesTable }    from './components/TradesTable.jsx';
import { Pagination }     from './components/Pagination.jsx';
import { Notification }   from './components/Notification.jsx';
import { ErrorState }     from './components/ErrorState.jsx';
import { LoadingState }   from './components/LoadingState.jsx';

export default function App() {
  const {
    trades, pullStatus, notification,
    connected, serverError, loading,
    triggerPull, refetch,
  } = useTrades();

  const {
    search, setSearch,
    filterSymbol, setFilterSymbol,
    filterType, setFilterType,
    sortField, sortDir, handleSort,
    paginated, filtered,
    page, setPage, totalPages, PAGE_SIZE,
    symbols, resetFilters,
  } = useFilters(trades);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        pullStatus={pullStatus}
        connected={connected}
        onTriggerPull={triggerPull}
      />

      <main style={{ flex: 1, padding: '24px', maxWidth: 1600, margin: '0 auto', width: '100%' }}>

        {/* Loading state — first paint */}
        {loading && <LoadingState />}

        {/* Server offline error */}
        {!loading && serverError && <ErrorState onRetry={refetch} />}

        {/* Main content */}
        {!loading && !serverError && (
          <>
            <section aria-label="Trade statistics" style={{ marginBottom: 20 }}>
              <StatsBar trades={trades} />
            </section>

            {/* Charts (Fix #3) */}
            {trades.length > 0 && (
              <section aria-label="Trade charts">
                <Charts trades={trades} />
              </section>
            )}

            {/* Pull progress banner */}
            {pullStatus?.state === 'running' && (
              <section aria-label="Pull progress" style={{ marginBottom: 16 }}>
                <PullStatus pullStatus={pullStatus} />
              </section>
            )}

            <section aria-label="Trade filters" style={{ marginBottom: 16 }}>
              <Filters
                search={search} setSearch={setSearch}
                filterSymbol={filterSymbol} setFilterSymbol={setFilterSymbol}
                filterType={filterType} setFilterType={setFilterType}
                symbols={symbols} filtered={filtered}
                resetFilters={resetFilters}
              />
            </section>

            <section aria-label="Trades data table" style={{ marginBottom: 16 }}>
              <TradesTable
                trades={paginated}
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              />
            </section>

            <Pagination
              page={page} setPage={setPage}
              totalPages={totalPages} filtered={filtered}
              PAGE_SIZE={PAGE_SIZE}
            />
          </>
        )}
      </main>

      <Notification notification={notification} />
    </div>
  );
}
