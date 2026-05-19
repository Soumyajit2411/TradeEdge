'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BarChart2, Wifi, WifiOff, TrendingUp, TrendingDown,
  Search, ChevronUp, ChevronDown, Minus, Activity,
} from 'lucide-react'
import { LiveTicker } from '@/types'
import { backendUrl, fetchJson } from '@/lib/api'
import { Footer } from '@/components/layout/Footer'
import { SYSTEM_MESSAGES } from '@/constants/system'

const MARKET_POLL_INTERVAL_MS = 30_000

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (v >= 1)    return v.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return v.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

function fmtCompact(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '—'
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)         return `${(v / 1_000).toFixed(2)}K`
  return v.toFixed(2)
}

function pct(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = 'symbol' | 'mark_price' | 'change_24h' | 'volume_24h' | 'turnover_24h'
type SortDir = 'asc' | 'desc'

const CONTRACT_TYPES = ['All', 'perpetual_futures', 'futures', 'put_options', 'call_options', 'move_options'] as const
type ContractFilter = typeof CONTRACT_TYPES[number]

const CONTRACT_LABELS: Record<string, string> = {
  All: 'All',
  perpetual_futures: 'Perps',
  futures: 'Futures',
  put_options: 'Puts',
  call_options: 'Calls',
  move_options: 'Move',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChangeBadge({ value }: { value: number }) {
  const positive = value >= 0
  const zero     = value === 0 || !Number.isFinite(value)
  if (zero) return <span className="text-white/35">—</span>
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
      {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {pct(value)}
    </span>
  )
}

function MoverCard({ ticker, rank }: { ticker: LiveTicker; rank: number }) {
  const positive = ticker.change_24h >= 0
  return (
    <div className={`flex-1 min-w-[140px] rounded-xl border px-3.5 py-2.5 ${
      positive
        ? 'bg-emerald-500/[0.06] border-emerald-500/20'
        : 'bg-red-500/[0.06] border-red-500/20'
    }`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] text-white/30 font-medium">#{rank}</span>
        <span className={`text-[11px] font-bold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
          {pct(ticker.change_24h)}
        </span>
      </div>
      <div className="text-xs font-semibold text-white/90 truncate">{ticker.underlying_asset_symbol ?? ticker.symbol}</div>
      <div className="text-[11px] text-white/40 mt-0.5 tabular-nums">{fmtPrice(ticker.mark_price)}</div>
    </div>
  )
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <Minus size={10} className="text-white/20" />
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="text-violet-400" />
    : <ChevronDown size={11} className="text-violet-400" />
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LiveMarketsPage() {
  const [rows,      setRows]      = useState<LiveTicker[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const [search,   setSearch]   = useState('')
  const [ctFilter, setCtFilter] = useState<ContractFilter>('All')
  const [sortKey,  setSortKey]  = useState<SortKey>('turnover_24h')
  const [sortDir,  setSortDir]  = useState<SortDir>('desc')

  useEffect(() => {
    let alive = true

    const fetchSnapshot = async () => {
      try {
        const data = await fetchJson<LiveTicker[]>('/api/delta/tickers')
        if (!alive) return
        setRows(Array.isArray(data) ? data : [])
        setLoading(false)
        setError(null)
        setUpdatedAt(new Date())
      } catch (e) {
        if (!alive) return
        setError(SYSTEM_MESSAGES.serversTemporarilyDown)
        setLoading(false)
      }
    }

    fetchSnapshot()
    const id = window.setInterval(fetchSnapshot, MARKET_POLL_INTERVAL_MS)

    const stream = new EventSource(backendUrl('/api/delta/tickers/stream'))
    stream.onopen    = () => setStreaming(true)
    stream.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as LiveTicker[]
        if (!alive || !Array.isArray(data)) return
        setRows(data)
        setLoading(false)
        setError(null)
        setStreaming(true)
        setUpdatedAt(new Date())
      } catch { /* ignore malformed frames */ }
    }
    stream.onerror = () => {
      if (!alive) return
      setStreaming(false)
    }

    return () => { alive = false; window.clearInterval(id); stream.close() }
  }, [])

  // Derived stats
  const gainers = useMemo(() => rows.filter(r => r.change_24h > 0).length, [rows])
  const losers  = useMemo(() => rows.filter(r => r.change_24h < 0).length, [rows])

  // Top movers (perps only for meaningful comparison)
  const perps = useMemo(
    () => rows.filter(r => r.contract_type === 'perpetual_futures' && Number.isFinite(r.change_24h)),
    [rows],
  )
  const topGainers = useMemo(
    () => [...perps].sort((a, b) => b.change_24h - a.change_24h).slice(0, 5),
    [perps],
  )
  const topLosers = useMemo(
    () => [...perps].sort((a, b) => a.change_24h - b.change_24h).slice(0, 5),
    [perps],
  )

  // Unique contract types present
  const presentTypes = useMemo(() => {
    const types = new Set(rows.map(r => r.contract_type ?? '').filter(Boolean))
    return CONTRACT_TYPES.filter(ct => ct === 'All' || types.has(ct))
  }, [rows])

  // Filter + sort
  const displayRows = useMemo(() => {
    let filtered = rows
    if (ctFilter !== 'All') filtered = filtered.filter(r => r.contract_type === ctFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      filtered = filtered.filter(r =>
        r.symbol.toLowerCase().includes(q) ||
        (r.underlying_asset_symbol ?? '').toLowerCase().includes(q),
      )
    }
    filtered = [...filtered].sort((a, b) => {
      const av = a[sortKey] as number | string
      const bv = b[sortKey] as number | string
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      const an = (av as number) || 0
      const bn = (bv as number) || 0
      return sortDir === 'asc' ? an - bn : bn - an
    })
    return filtered
  }, [rows, ctFilter, search, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const colHeader = (label: string, key: SortKey, align: 'left' | 'right' = 'right') => (
    <th
      className={`px-3 py-3 cursor-pointer select-none group ${align === 'left' ? 'text-left' : 'text-right'}`}
      onClick={() => handleSort(key)}
    >
      <span className={`inline-flex items-center gap-1 text-xs uppercase tracking-widest text-white/40 group-hover:text-white/70 transition-colors ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        <SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
        {label}
      </span>
    </th>
  )

  return (
    <div className="min-h-screen bg-[#080a0f] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/[0.07] px-6 py-4 sticky top-0 z-20 bg-[#080a0f]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <BarChart2 size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">TradeEdge</span>
            <span className="text-xs text-white/20 ml-0.5">Delta Exchange</span>
          </Link>

          <div className="flex items-center gap-3 text-xs">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
              streaming
                ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                : 'text-amber-300 border-amber-500/30 bg-amber-500/10'
            }`}>
              {streaming
                ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><Wifi size={11} /> Live</>
                : <><WifiOff size={11} /> Snapshot</>}
            </div>
            {updatedAt && (
              <span className="text-white/30 hidden sm:block">
                Updated {updatedAt.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6 space-y-5">

        {/* Page title + summary */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Activity size={18} className="text-violet-400" />
              Live Market Feed
            </h1>
            <p className="text-sm text-white/35 mt-1">Delta Exchange India — realtime websocket data</p>
          </div>

          {!loading && rows.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-center px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                <div className="text-lg font-bold text-white">{rows.length}</div>
                <div className="text-[10px] text-white/35 uppercase tracking-wider">Markets</div>
              </div>
              <div className="text-center px-3 py-1.5 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20">
                <div className="text-lg font-bold text-emerald-400">{gainers}</div>
                <div className="text-[10px] text-emerald-400/60 uppercase tracking-wider">Gainers</div>
              </div>
              <div className="text-center px-3 py-1.5 rounded-xl bg-red-500/[0.08] border border-red-500/20">
                <div className="text-lg font-bold text-red-400">{losers}</div>
                <div className="text-[10px] text-red-400/60 uppercase tracking-wider">Losers</div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Top movers */}
        {!loading && (topGainers.length > 0 || topLosers.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {topGainers.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp size={13} className="text-emerald-400" />
                  <span className="text-xs font-medium text-white/50 uppercase tracking-widest">Top Gainers</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {topGainers.map((t, i) => <MoverCard key={t.symbol} ticker={t} rank={i + 1} />)}
                </div>
              </div>
            )}
            {topLosers.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingDown size={13} className="text-red-400" />
                  <span className="text-xs font-medium text-white/50 uppercase tracking-widest">Top Losers</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {topLosers.map((t, i) => <MoverCard key={t.symbol} ticker={t} rank={i + 1} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search + filters */}
        {!loading && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              <input
                type="text"
                placeholder="Search symbol or asset…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.07] transition"
              />
            </div>

            <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1">
              {presentTypes.map(ct => (
                <button
                  key={ct}
                  onClick={() => setCtFilter(ct)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    ctFilter === ct
                      ? 'bg-violet-600/30 text-violet-300 border border-violet-500/30'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {CONTRACT_LABELS[ct] ?? ct}
                </button>
              ))}
            </div>

            <span className="text-xs text-white/30 ml-auto">{displayRows.length} results</span>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="h-56 flex items-center justify-center text-white/25 text-sm gap-2">
            <Activity size={14} className="animate-pulse text-violet-400" />
            Loading live markets…
          </div>
        ) : displayRows.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-white/25 text-sm">
            No markets match your search.
          </div>
        ) : (
          <div className="border border-white/[0.08] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white/[0.025] border-b border-white/[0.06]">
                  <tr>
                    {colHeader('Symbol',     'symbol',      'left')}
                    {colHeader('Mark',       'mark_price')}
                    {colHeader('Spot',       'mark_price')}
                    {colHeader('24h %',      'change_24h')}
                    {colHeader('Volume',     'volume_24h')}
                    {colHeader('Turnover',   'turnover_24h')}
                    <th className="text-left px-3 py-3 text-xs uppercase tracking-widest text-white/40">Type</th>
                    <th className="text-left px-3 py-3 text-xs uppercase tracking-widest text-white/40">Asset</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((t, idx) => (
                    <tr
                      key={t.symbol}
                      className={`border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors ${idx % 2 === 0 ? '' : 'bg-white/[0.01]'}`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-white/90 text-[13px]">{t.symbol}</div>
                        {t.quote_asset_symbol && (
                          <div className="text-[10px] text-white/30 mt-0.5">{t.quote_asset_symbol}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-white/80">
                        {fmtPrice(t.mark_price)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-white/50">
                        {fmtPrice(t.spot_price)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <ChangeBadge value={t.change_24h} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-white/55">
                        {fmtCompact(t.volume_24h)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-white/55">
                        {fmtCompact(t.turnover_24h)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-white/45">
                          {CONTRACT_LABELS[t.contract_type ?? ''] ?? t.contract_type ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-white/60 font-medium">
                        {t.underlying_asset_symbol ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
