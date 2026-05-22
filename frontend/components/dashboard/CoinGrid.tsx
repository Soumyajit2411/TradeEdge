'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { LiveTicker, SymbolStats, Trade } from '@/types'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'
import { format } from 'date-fns'
import {
  TrendingUp,
  TrendingDown,
  Search,
  ArrowLeft,
  Activity,
  BookOpen,
  Brain,
  Radio,
} from 'lucide-react'
import { calcHourStats, calcDailyPnlMap } from '@/lib/stats'
import { backendUrl } from '@/lib/api'
import { GlobalBiasReport, groupBySymbol } from '@/lib/bias-analysis'
import { BIAS_COLORS, SEVERITY_LABEL } from '@/lib/bias-colors'

// ── Colour helpers ─────────────────────────────────────────────────────────────

function pnlColor(v: number) {
  return v > 0 ? '#34d399' : v < 0 ? '#f87171' : '#6b7280'
}
function pnlClass(v: number) {
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-white/30'
}
function fmt(v: number, d = 2) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(d)}`
}

// ── Tiny chart on coin cards ───────────────────────────────────────────────────

function MiniPnlChart({ trades }: { trades: Trade[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  const daily = useMemo(() => calcDailyPnlMap(trades), [trades])
  if (daily.length < 2 || !mounted) return <div className="h-10 mt-2" />
  return (
    <div className="h-10 -mx-1 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={daily} margin={{ top: 1, right: 0, left: 0, bottom: 0 }}>
          <Bar dataKey="pnl" radius={[1, 1, 0, 0]}>
            {daily.map((d) => (
              <Cell key={d.date} fill={pnlColor(d.pnl)} fillOpacity={0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Coin detail page ───────────────────────────────────────────────────────────

type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}
type Resolution = '1m' | '5m' | '15m' | '1h' | '1d'
type DetailTab = 'overview' | 'trades' | 'psychology' | 'market'

// ── OHLCV chart + market data panel ──────────────────────────────────────────

const RESOLUTIONS: { key: Resolution; label: string }[] = [
  { key: '1m', label: '1m' },
  { key: '5m', label: '5m' },
  { key: '15m', label: '15m' },
  { key: '1h', label: '1h' },
  { key: '1d', label: '1D' },
]

function priceFmt(v: number) {
  return v >= 10000 ? v.toFixed(0) : v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toFixed(6)
}

function OhlcvChart({ candles, resolution }: { candles: Candle[]; resolution: Resolution }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setWidth(Math.floor(w))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (candles.length < 2)
    return (
      <div className="h-[260px] flex items-center justify-center text-white/20 text-xs">
        Not enough candle data
      </div>
    )

  const H = 260
  const ML = 72,
    MR = 10,
    MT = 8,
    MB = 24
  const VOL_H = 44
  const PRICE_H = H - MT - MB - VOL_H - 6
  const plotW = Math.max(width - ML - MR, 1)
  const n = candles.length

  const prices = candles.flatMap((c) => [c.high, c.low])
  const rawMin = Math.min(...prices)
  const rawMax = Math.max(...prices)
  const pad = (rawMax - rawMin) * 0.04 || rawMax * 0.01
  const minP = rawMin - pad
  const maxP = rawMax + pad
  const priceRange = maxP - minP

  const py = (p: number) => MT + (1 - (p - minP) / priceRange) * PRICE_H
  const cx = (i: number) => ML + (i + 0.5) * (plotW / n)
  const candleW = Math.max(Math.floor((plotW / n) * 0.72), 1)

  const maxVol = Math.max(...candles.map((c) => c.volume), 1)
  const volBarH = (v: number) => Math.max((v / maxVol) * VOL_H * 0.9, 1)
  const volBarY = (v: number) => H - MB - volBarH(v)

  const numTicks = 5
  const yTicks = Array.from(
    { length: numTicks },
    (_, i) => minP + (i / (numTicks - 1)) * priceRange
  )

  const xTickEvery = Math.max(Math.floor(n / 6), 1)
  const xTicks = Array.from({ length: n }, (_, i) => i).filter((i) => i % xTickEvery === 0)

  const fmtX = (i: number) =>
    resolution === '1d'
      ? new Date(candles[i].time * 1000).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })
      : new Date(candles[i].time * 1000).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })

  const hovered = hoverIdx !== null ? candles[hoverIdx] : null

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden select-none">
      {hovered && hoverIdx !== null && (
        <div className="absolute top-2 left-[76px] bg-[#0c0e14] border border-white/[0.1] rounded-lg px-3 py-2 text-[11px] z-10 pointer-events-none">
          <div className="text-white/30 text-[10px] mb-1">{fmtX(hoverIdx)}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-white/35">O</span>
            <span className="text-white tabular-nums">{priceFmt(hovered.open)}</span>
            <span className="text-white/35">H</span>
            <span className="text-emerald-400 tabular-nums">{priceFmt(hovered.high)}</span>
            <span className="text-white/35">L</span>
            <span className="text-red-400 tabular-nums">{priceFmt(hovered.low)}</span>
            <span className="text-white/35">C</span>
            <span
              className={`tabular-nums font-semibold ${hovered.close >= hovered.open ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {priceFmt(hovered.close)}
            </span>
            <span className="text-white/35">Vol</span>
            <span className="text-white/50 tabular-nums">{hovered.volume.toLocaleString()}</span>
          </div>
        </div>
      )}

      {width > 0 && (
        <svg width={width} height={H} style={{ display: 'block' }}>
          {/* Y grid lines */}
          {yTicks.map((p, i) => (
            <line
              key={i}
              x1={ML}
              y1={py(p)}
              x2={ML + plotW}
              y2={py(p)}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
            />
          ))}

          {/* Volume section divider */}
          <line
            x1={ML}
            y1={H - MB - VOL_H - 3}
            x2={ML + plotW}
            y2={H - MB - VOL_H - 3}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
            strokeDasharray="3 5"
          />

          {/* Volume bars */}
          {candles.map((c, i) => {
            const up = c.close >= c.open
            return (
              <rect
                key={`v${i}`}
                x={cx(i) - candleW / 2}
                y={volBarY(c.volume)}
                width={candleW}
                height={volBarH(c.volume)}
                fill={up ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}
                rx={1}
              />
            )
          })}

          {/* Candles */}
          {candles.map((c, i) => {
            const up = c.close >= c.open
            const color = up ? '#34d399' : '#f87171'
            const x = cx(i)
            const highY = py(c.high)
            const lowY = py(c.low)
            const openY = py(c.open)
            const closeY = py(c.close)
            const bodyTop = Math.min(openY, closeY)
            const bodyH = Math.max(Math.abs(closeY - openY), 1.5)
            return (
              <g key={`c${i}`}>
                <line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth={1} />
                <rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} />
              </g>
            )
          })}

          {/* Hover crosshair */}
          {hoverIdx !== null && (
            <line
              x1={cx(hoverIdx)}
              y1={MT}
              x2={cx(hoverIdx)}
              y2={H - MB}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {/* Y-axis labels */}
          {yTicks.map((p, i) => (
            <text
              key={i}
              x={ML - 5}
              y={py(p) + 3.5}
              textAnchor="end"
              fontSize={9}
              fill="rgba(255,255,255,0.3)"
            >
              {priceFmt(p)}
            </text>
          ))}

          {/* X-axis labels */}
          {xTicks.map((i) => (
            <text
              key={i}
              x={cx(i)}
              y={H - 6}
              textAnchor="middle"
              fontSize={9}
              fill="rgba(255,255,255,0.25)"
            >
              {fmtX(i)}
            </text>
          ))}

          {/* Y-axis border */}
          <line
            x1={ML}
            y1={MT}
            x2={ML}
            y2={H - MB}
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={1}
          />

          {/* Last close reference */}
          <line
            x1={ML}
            y1={py(candles[candles.length - 1].close)}
            x2={ML + plotW}
            y2={py(candles[candles.length - 1].close)}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
            strokeDasharray="2 4"
          />

          {/* Hover hit areas (invisible rects per candle) */}
          {candles.map((_, i) => (
            <rect
              key={`h${i}`}
              x={cx(i) - plotW / n / 2}
              y={MT}
              width={plotW / n}
              height={H - MT - MB}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            />
          ))}
        </svg>
      )}
    </div>
  )
}

function LiveMarketPanel({ ticker, symbol }: { ticker: LiveTicker; symbol: string }) {
  const [resolution, setResolution] = useState<Resolution>('1h')
  const [candles, setCandles] = useState<Candle[]>([])
  const [candleLoad, setCandleLoad] = useState(true)
  const [candleErr, setCandleErr] = useState<string | null>(null)

  const spread = ticker.spot_price > 0 ? Math.abs(ticker.mark_price - ticker.spot_price) : 0
  const spreadPct = ticker.spot_price > 0 ? (spread / ticker.spot_price) * 100 : 0

  useEffect(() => {
    let alive = true
    setCandleLoad(true)
    setCandleErr(null)
    fetch(`${backendUrl(`/api/delta/candles/${symbol}`)}?resolution=${resolution}`)
      .then((r) => r.json())
      .then((data) => {
        if (alive) {
          setCandles(Array.isArray(data) ? data : [])
          setCandleLoad(false)
        }
      })
      .catch(() => {
        if (alive) {
          setCandleErr('Failed to load chart data')
          setCandleLoad(false)
        }
      })
    return () => {
      alive = false
    }
  }, [symbol, resolution])

  return (
    <div className="space-y-4">
      {/* OHLCV Chart */}
      <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/30 uppercase tracking-widest font-medium">
              Price Chart
            </span>
            <span className="text-[10px] text-white/20">· Close price + Volume</span>
          </div>
          <div className="flex gap-1">
            {RESOLUTIONS.map((r) => (
              <button
                key={r.key}
                onClick={() => setResolution(r.key)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  resolution === r.key
                    ? 'bg-violet-600 text-white'
                    : 'bg-white/[0.04] text-white/30 hover:text-white/60'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {candleLoad ? (
          <div className="h-52 flex items-center justify-center text-white/20 text-xs">
            Loading candles…
          </div>
        ) : candleErr ? (
          <div className="h-52 flex items-center justify-center text-red-400/60 text-xs">
            {candleErr}
          </div>
        ) : (
          <OhlcvChart candles={candles} resolution={resolution} />
        )}
      </div>

      {/* Market data grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {(
          [
            {
              label: 'Mark Price',
              value: ticker.mark_price > 0 ? priceFmt(ticker.mark_price) : '—',
              cls: 'text-white',
            },
            {
              label: 'Spot Price',
              value: ticker.spot_price > 0 ? priceFmt(ticker.spot_price) : '—',
              cls: 'text-slate-300',
            },
            {
              label: '24h Change',
              value: `${fmt(ticker.change_24h, 2)}%`,
              cls: ticker.change_24h >= 0 ? 'text-emerald-400' : 'text-red-400',
            },
            {
              label: '24h Open',
              value: ticker.open > 0 ? priceFmt(ticker.open) : '—',
              cls: 'text-white/70',
            },
            {
              label: '24h Close',
              value: ticker.close > 0 ? priceFmt(ticker.close) : '—',
              cls: 'text-white/70',
            },
            {
              label: 'Mark/Spot Spread',
              value: spread > 0 ? `${spreadPct.toFixed(3)}%` : '—',
              cls: spreadPct > 0.1 ? 'text-amber-400' : 'text-white/50',
            },
            {
              label: 'Volume 24h',
              value: ticker.volume_24h > 0 ? ticker.volume_24h.toLocaleString() : '—',
              cls: 'text-white/70',
            },
            {
              label: 'Turnover 24h',
              value:
                ticker.turnover_24h > 0 ? `${(ticker.turnover_24h / 1_000_000).toFixed(2)}M` : '—',
              cls: 'text-white/70',
            },
          ] as { label: string; value: string; cls: string }[]
        ).map((s) => (
          <div
            key={s.label}
            className="bg-[#0f1117] border border-white/[0.06] rounded-xl px-3 py-3"
          >
            <div className="text-[10px] text-white/25 uppercase tracking-wide mb-1.5">
              {s.label}
            </div>
            <div className={`text-sm font-bold tabular-nums ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Contract metadata */}
      {(ticker.contract_type || ticker.underlying_asset_symbol || ticker.quote_asset_symbol) && (
        <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl px-4 py-3 flex flex-wrap gap-6">
          {ticker.contract_type && (
            <div>
              <div className="text-[10px] text-white/25 uppercase tracking-wide mb-1">
                Contract Type
              </div>
              <div className="text-xs text-white font-semibold uppercase">
                {ticker.contract_type}
              </div>
            </div>
          )}
          {ticker.underlying_asset_symbol && (
            <div>
              <div className="text-[10px] text-white/25 uppercase tracking-wide mb-1">
                Underlying
              </div>
              <div className="text-xs text-white/70 font-medium">
                {ticker.underlying_asset_symbol}
              </div>
            </div>
          )}
          {ticker.quote_asset_symbol && (
            <div>
              <div className="text-[10px] text-white/25 uppercase tracking-wide mb-1">
                Quote Asset
              </div>
              <div className="text-xs text-white/70 font-medium">{ticker.quote_asset_symbol}</div>
            </div>
          )}
          <div>
            <div className="text-[10px] text-white/25 uppercase tracking-wide mb-1">Symbol</div>
            <div className="text-xs text-white/70 font-medium">{ticker.symbol}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function EquityCurve({ trades }: { trades: Trade[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  const data = useMemo(() => {
    const sorted = trades
      .filter((t) => t.pnl !== 0)
      .sort((a, b) => a.entry_time.localeCompare(b.entry_time))
    let cum = 0
    return sorted.map((t) => {
      cum = parseFloat((cum + t.pnl).toFixed(4))
      return { date: t.entry_time.slice(0, 10), equity: cum, pnl: t.pnl }
    })
  }, [trades])
  if (data.length < 2 || !mounted)
    return (
      <div className="h-40 flex items-center justify-center text-white/20 text-xs">
        Not enough data
      </div>
    )

  const min = data.reduce((m, d) => (d.equity < m ? d.equity : m), Infinity)
  const max = data.reduce((m, d) => (d.equity > m ? d.equity : m), -Infinity)
  const color = data[data.length - 1].equity >= 0 ? '#34d399' : '#f87171'

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.15} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: '#ffffff30' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => v.slice(5)}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#ffffff30' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => v.toFixed(2)}
          width={52}
          domain={[min * 1.05, max * 1.05]}
        />
        <ReferenceLine y={0} stroke="#ffffff15" strokeDasharray="3 3" />
        <Tooltip
          contentStyle={{
            background: '#0f1117',
            border: '1px solid #ffffff15',
            borderRadius: 8,
            fontSize: 11,
          }}
          labelStyle={{ color: '#ffffff60' }}
          formatter={(v) => [fmt(Number(v), 4) + ' USDT', 'Equity']}
        />
        <Line
          type="monotone"
          dataKey="equity"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          fill="url(#eqGrad)"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function DailyPnlChart({ trades }: { trades: Trade[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  const daily = useMemo(() => calcDailyPnlMap(trades), [trades])
  if (!mounted || daily.length < 2)
    return (
      <div className="h-32 flex items-center justify-center text-white/20 text-xs">
        Not enough data
      </div>
    )
  return (
    <ResponsiveContainer width="100%" height={128}>
      <BarChart data={daily} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 9, fill: '#ffffff25' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => v.slice(5)}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 9, fill: '#ffffff25' }}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v) => v.toFixed(1)}
        />
        <ReferenceLine y={0} stroke="#ffffff15" />
        <Tooltip
          contentStyle={{
            background: '#0f1117',
            border: '1px solid #ffffff15',
            borderRadius: 8,
            fontSize: 11,
          }}
          formatter={(v) => [fmt(Number(v), 2) + ' USDT', 'PnL']}
        />
        <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
          {daily.map((d) => (
            <Cell key={d.date} fill={pnlColor(d.pnl)} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function HourlyHeatmap({ trades }: { trades: Trade[] }) {
  const hours = useMemo(() => calcHourStats(trades).filter((h) => h.trades > 0), [trades])
  if (!hours.length) return <p className="text-xs text-white/20">No data</p>
  const maxAbs = Math.max(
    hours.reduce((m, h) => (Math.abs(h.pnl) > m ? Math.abs(h.pnl) : m), 0),
    1
  )
  return (
    <div className="flex flex-wrap gap-1">
      {hours.map((h) => {
        const intensity = Math.abs(h.pnl) / maxAbs
        const color =
          h.pnl >= 0
            ? `rgba(52,211,153,${0.15 + intensity * 0.65})`
            : `rgba(248,113,113,${0.15 + intensity * 0.65})`
        return (
          <div
            key={h.hour}
            title={`${h.label}: ${fmt(h.pnl, 2)} USDT (${h.trades} fills)`}
            style={{ background: color }}
            className="w-10 h-10 rounded-lg flex flex-col items-center justify-center gap-0.5 cursor-default"
          >
            <span className="text-[9px] text-white/50">{h.label.slice(0, 2)}h</span>
            <span className="text-[9px] text-white font-semibold">{fmt(h.pnl, 1)}</span>
          </div>
        )
      })}
    </div>
  )
}

function DirectionBreakdown({ trades }: { trades: Trade[] }) {
  const closed = trades.filter((t) => t.pnl !== 0)
  const longs = closed.filter((t) => t.direction === 'long')
  const shorts = closed.filter((t) => t.direction === 'short')
  const longWins = longs.filter((t) => t.pnl > 0)
  const shortWins = shorts.filter((t) => t.pnl > 0)
  const longPnl = longs.reduce((s, t) => s + t.pnl, 0)
  const shortPnl = shorts.reduce((s, t) => s + t.pnl, 0)

  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        {
          label: 'LONG',
          count: longs.length,
          wins: longWins.length,
          pnl: longPnl,
          color: 'emerald',
        },
        {
          label: 'SHORT',
          count: shorts.length,
          wins: shortWins.length,
          pnl: shortPnl,
          color: 'red',
        },
      ].map((d) => (
        <div key={d.label} className="bg-[#080a0f] border border-white/[0.06] rounded-xl p-3">
          <div
            className={`text-xs font-bold mb-2 ${d.color === 'emerald' ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {d.label}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-white/35">Trades</span>
              <span className="text-white">{d.count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/35">Win Rate</span>
              <span className="text-white">
                {d.count ? ((d.wins / d.count) * 100).toFixed(0) : 0}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/35">Net PnL</span>
              <span className={pnlClass(d.pnl)}>{fmt(d.pnl, 2)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function FullTradeTable({ trades }: { trades: Trade[] }) {
  const [page, setPage] = useState(0)
  const [sortKey, setSortKey] = useState<'time' | 'pnl' | 'qty'>('time')
  const PER_PAGE = 25

  const sorted = useMemo(() => {
    const base = trades.filter((t) => t.pnl !== 0)
    if (sortKey === 'pnl') return [...base].sort((a, b) => b.pnl - a.pnl)
    if (sortKey === 'qty') return [...base].sort((a, b) => b.quantity - a.quantity)
    return [...base].sort((a, b) => b.entry_time.localeCompare(a.entry_time))
  }, [trades, sortKey])

  const pages = Math.ceil(sorted.length / PER_PAGE)
  const slice = sorted.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  const sortBtns: { key: typeof sortKey; label: string }[] = [
    { key: 'time', label: 'Latest' },
    { key: 'pnl', label: 'Best P&L' },
    { key: 'qty', label: 'Largest' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-white/30">{sorted.length} trades</span>
        <div className="flex gap-1 ml-auto">
          {sortBtns.map((b) => (
            <button
              key={b.key}
              onClick={() => {
                setSortKey(b.key)
                setPage(0)
              }}
              className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${sortKey === b.key ? 'bg-violet-600 text-white' : 'bg-white/[0.04] text-white/40 hover:text-white/70'}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/20 border-b border-white/[0.05]">
              {['Side', 'Price', 'Size', 'Realized PnL', '%', 'Details', 'Date (UTC)'].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((t) => (
              <tr
                key={t.id}
                className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
              >
                <td className="px-3 py-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.direction === 'long' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}
                  >
                    {t.direction === 'long' ? 'BUY' : 'SELL'}
                  </span>
                </td>
                <td className="px-3 py-2 text-white/60 tabular-nums">{t.entry_price.toFixed(2)}</td>
                <td className="px-3 py-2 text-white/40 tabular-nums">{t.quantity}</td>
                <td className={`px-3 py-2 font-semibold tabular-nums ${pnlClass(t.pnl)}`}>
                  {fmt(t.pnl, 4)}
                </td>
                <td className={`px-3 py-2 tabular-nums ${pnlClass(t.pnl_percent)}`}>
                  {fmt(t.pnl_percent, 2)}%
                </td>
                <td className="px-3 py-2 text-white/20 max-w-[180px] truncate">{t.notes}</td>
                <td className="px-3 py-2 text-white/25 whitespace-nowrap">
                  {format(new Date(t.entry_time), 'MMM d, HH:mm')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1 rounded-lg text-xs bg-white/[0.04] text-white/40 hover:text-white/70 disabled:opacity-30 transition-colors"
          >
            ←
          </button>
          <span className="text-xs text-white/25 px-2">
            {page + 1} / {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page === pages - 1}
            className="px-3 py-1 rounded-lg text-xs bg-white/[0.04] text-white/40 hover:text-white/70 disabled:opacity-30 transition-colors"
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}

function PsychologyTab({ biasReport, symbol }: { biasReport: GlobalBiasReport; symbol: string }) {
  const coinBias = biasReport.symbolReports.find((r) => r.symbol === symbol)
  const biases = coinBias?.biases ?? biasReport.biases

  const [expanded, setExpanded] = useState<string | null>(null)
  const healthScore = coinBias?.healthScore ?? biasReport.overallHealthScore
  const color = healthScore >= 70 ? '#22c55e' : healthScore >= 50 ? '#f59e0b' : '#ef4444'
  const r = 38
  const circ = 2 * Math.PI * r
  const dash = (healthScore / 100) * circ

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-5">
        {/* Health ring */}
        <div className="relative flex items-center justify-center w-24 h-24 shrink-0">
          <svg className="w-24 h-24 -rotate-90 absolute" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={r} fill="none" stroke="#ffffff08" strokeWidth="9" />
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={color}
              strokeWidth="9"
              strokeDasharray={`${dash} ${circ}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="text-center z-10">
            <div className="text-xl font-bold" style={{ color }}>
              {healthScore}
            </div>
            <div className="text-[10px] text-white/30 leading-none mt-0.5">health</div>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-white mb-0.5">
            {symbol} Psychological Health
          </div>
          <div className="text-xs text-white/40">
            {biases.reduce((s, b) => s + b.instances.length, 0)} bias signals detected across{' '}
            {biases.filter((b) => b.instances.length > 0).length} pattern types
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {biases.map((bias) => {
          const c = BIAS_COLORS[bias.type as keyof typeof BIAS_COLORS]
          const isOpen = expanded === bias.type
          return (
            <div
              key={bias.type}
              className="bg-[#080a0f] border border-white/[0.06] rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setExpanded(isOpen ? null : bias.type)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${c.bar}`} />
                <span className={`text-xs font-semibold flex-1 text-left ${c.text}`}>
                  {bias.label}
                </span>
                {bias.instances.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.bg} ${c.text}`}>
                    {bias.instances.length}
                  </span>
                )}
                <span className="text-[10px] text-white/25 ml-1">
                  {SEVERITY_LABEL[bias.severity]}
                </span>
                <div className="w-16 h-1 bg-white/[0.05] rounded-full overflow-hidden ml-2 shrink-0">
                  <div
                    className={`h-full ${c.bar} rounded-full`}
                    style={{ width: `${bias.score}%` }}
                  />
                </div>
                <span className="text-white/20 text-xs ml-1">{isOpen ? '↑' : '↓'}</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-3 border-t border-white/[0.05]">
                  <p className="text-[11px] text-white/30 mt-2 mb-3">{bias.description}</p>
                  {bias.instances.length === 0 ? (
                    <p className="text-xs text-white/20 italic">
                      No instances detected — clean execution on this pattern.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {bias.instances.map((inst, i) => (
                        <div
                          key={i}
                          className={`flex gap-2 text-xs px-2 py-1.5 rounded-lg ${c.bg}`}
                        >
                          <span className={`shrink-0 font-bold ${c.text}`}>
                            {'●'.repeat(inst.severity)}
                            {'○'.repeat(3 - inst.severity)}
                          </span>
                          <div>
                            <span className="text-white/60">{inst.reason}</span>
                            <span className="text-white/25 ml-2 text-[10px]">
                              {inst.entryTime.slice(0, 16).replace('T', ' ')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CoinDetailPage({
  symbol,
  stats,
  trades,
  ticker,
  biasReport,
  onBack,
}: {
  symbol: string
  stats?: SymbolStats
  trades: Trade[]
  ticker?: LiveTicker
  biasReport: GlobalBiasReport
  onBack: () => void
}) {
  const [tab, setTab] = useState<DetailTab>(ticker ? 'market' : 'overview')
  const pf = stats ? (isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞') : '—'

  const TABS: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
    { key: 'market', label: 'Market', icon: <Radio size={12} /> },
    { key: 'overview', label: 'My Trades', icon: <Activity size={12} /> },
    { key: 'trades', label: 'Trade Log', icon: <BookOpen size={12} /> },
    { key: 'psychology', label: 'Psychology', icon: <Brain size={12} /> },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/70 transition-colors mb-3"
          >
            <ArrowLeft size={12} /> Back to all coins
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white">{symbol}</h2>
            {ticker && (
              <span className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" /> LIVE
              </span>
            )}
            {ticker?.contract_type && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-white/40 font-medium uppercase tracking-wide">
                {ticker.contract_type}
              </span>
            )}
          </div>
          {ticker && (
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-xl font-semibold text-white tabular-nums">
                {ticker.mark_price.toFixed(4)}
              </span>
              <span
                className={`flex items-center gap-1 text-sm font-medium ${ticker.change_24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {ticker.change_24h >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {fmt(ticker.change_24h, 2)}% 24h
              </span>
              <span className="text-xs text-white/25">
                Vol {ticker.volume_24h > 0 ? ticker.volume_24h.toLocaleString() : '—'}
              </span>
              <span className="text-xs text-white/25">
                Spot {ticker.spot_price > 0 ? ticker.spot_price.toFixed(4) : '—'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Quick stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            {
              label: 'Net PnL',
              value: fmt(stats.totalPnl, 2) + ' USDT',
              cls: pnlClass(stats.totalPnl),
            },
            { label: 'Win Rate', value: `${stats.winRate.toFixed(1)}%`, cls: '' },
            { label: 'Trades', value: String(stats.closedTrades), cls: '' },
            { label: 'Profit Factor', value: pf, cls: '' },
            { label: 'Avg P&L', value: fmt(stats.avgPnl, 4), cls: pnlClass(stats.avgPnl) },
            { label: 'Best', value: `+${stats.bestTrade.toFixed(4)}`, cls: 'text-emerald-400' },
            { label: 'Worst', value: stats.worstTrade.toFixed(4), cls: 'text-red-400' },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-[#0f1117] border border-white/[0.06] rounded-xl px-3 py-2.5"
            >
              <div className="text-[10px] text-white/30 uppercase tracking-wide mb-1">
                {s.label}
              </div>
              <div className={`text-sm font-bold tabular-nums ${s.cls || 'text-white'}`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] pb-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-white/35 hover:text-white/60'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="pt-1">
        {tab === 'market' &&
          (ticker ? (
            <LiveMarketPanel ticker={ticker} symbol={symbol} />
          ) : (
            <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-8 flex flex-col items-center justify-center gap-3 text-white/25">
              <Radio size={24} />
              <p className="text-sm">No live market data available for {symbol}</p>
              <p className="text-xs">
                Live data streams from Delta Exchange when the market is open.
              </p>
            </div>
          ))}

        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
              <div className="text-[10px] text-white/25 uppercase tracking-widest mb-3">
                Cumulative Equity
              </div>
              <EquityCurve trades={trades} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
                <div className="text-[10px] text-white/25 uppercase tracking-widest mb-3">
                  Daily P&L
                </div>
                <DailyPnlChart trades={trades} />
              </div>
              <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4 space-y-4">
                <div>
                  <div className="text-[10px] text-white/25 uppercase tracking-widest mb-3">
                    Long vs Short
                  </div>
                  <DirectionBreakdown trades={trades} />
                </div>
              </div>
            </div>
            <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
              <div className="text-[10px] text-white/25 uppercase tracking-widest mb-3">
                Hourly P&L (UTC)
              </div>
              <HourlyHeatmap trades={trades} />
            </div>
          </div>
        )}

        {tab === 'trades' && (
          <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
            <FullTradeTable trades={trades} />
          </div>
        )}

        {tab === 'psychology' && (
          <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
            <PsychologyTab biasReport={biasReport} symbol={symbol} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Coin grid (list view) ──────────────────────────────────────────────────────

type SortKeyLive = 'turnover' | 'change24h' | 'price' | 'pnl'
type CoinRow = { symbol: string; ticker?: LiveTicker; stats?: SymbolStats }

export function CoinGrid({
  symbolStats,
  trades,
  liveTickers,
  liveLoading,
  liveError,
  biasReport,
}: {
  symbolStats: SymbolStats[]
  trades: Trade[]
  liveTickers: LiveTicker[]
  liveLoading: boolean
  liveError: string | null
  biasReport: GlobalBiasReport
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKeyLive>('turnover')
  const [search, setSearch] = useState('')

  const tradesBySymbol = useMemo(() => groupBySymbol(trades), [trades])

  const rows = useMemo<CoinRow[]>(() => {
    const statsBySymbol = new Map(symbolStats.map((s) => [s.symbol, s]))
    if (liveTickers.length > 0)
      return liveTickers.map((t) => ({
        symbol: t.symbol,
        ticker: t,
        stats: statsBySymbol.get(t.symbol),
      }))
    return symbolStats.map((s) => ({ symbol: s.symbol, stats: s }))
  }, [symbolStats, liveTickers])

  const sorted = useMemo(() => {
    const list = rows.filter((r) => r.symbol.toLowerCase().includes(search.toLowerCase()))
    if (sort === 'change24h')
      return [...list].sort(
        (a, b) => (b.ticker?.change_24h ?? -999) - (a.ticker?.change_24h ?? -999)
      )
    if (sort === 'price')
      return [...list].sort((a, b) => (b.ticker?.mark_price ?? 0) - (a.ticker?.mark_price ?? 0))
    if (sort === 'pnl')
      return [...list].sort((a, b) => (b.stats?.totalPnl ?? -999) - (a.stats?.totalPnl ?? -999))
    return [...list].sort(
      (a, b) => (b.ticker?.turnover_24h ?? -999) - (a.ticker?.turnover_24h ?? -999)
    )
  }, [rows, sort, search])

  // When a coin is selected show its full detail page
  if (selected) {
    const row = rows.find((r) => r.symbol === selected)
    return (
      <CoinDetailPage
        symbol={selected}
        stats={row?.stats}
        trades={tradesBySymbol.get(selected) ?? []}
        ticker={row?.ticker}
        biasReport={biasReport}
        onBack={() => setSelected(null)}
      />
    )
  }

  const sortBtns: { key: SortKeyLive; label: string }[] = [
    { key: 'turnover', label: '24h Turnover' },
    { key: 'change24h', label: '24h Change' },
    { key: 'price', label: 'Price' },
    { key: 'pnl', label: 'My P&L' },
  ]

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol…"
            className="w-full bg-[#0f1117] border border-white/[0.07] rounded-lg pl-8 pr-3 py-2 text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-violet-500/40"
          />
        </div>
        <div className="flex gap-1">
          {sortBtns.map((b) => (
            <button
              key={b.key}
              onClick={() => setSort(b.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sort === b.key ? 'bg-violet-600 text-white' : 'bg-white/[0.04] text-white/40 hover:text-white/70'}`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-white/25">{sorted.length} symbols</span>
      </div>

      <div className="flex gap-4 text-xs text-white/30">
        <span className="text-emerald-400/70">
          {symbolStats.filter((s) => s.totalPnl > 0).length} profitable coins
        </span>
        <span className="text-red-400/70">
          {symbolStats.filter((s) => s.totalPnl < 0).length} losing coins
        </span>
        <span className="text-white/20">
          {liveTickers.length || symbolStats.length} live markets
        </span>
      </div>

      {liveLoading && <div className="text-xs text-white/40">Loading live Delta prices…</div>}
      {liveError && <div className="text-xs text-red-300/80">Live prices: {liveError}</div>}

      {/* Coin cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {sorted.map((row) => {
          const symTrades = tradesBySymbol.get(row.symbol) ?? []
          const pf = row.stats
            ? isFinite(row.stats.profitFactor)
              ? row.stats.profitFactor.toFixed(2)
              : '∞'
            : null
          const change24 = row.ticker?.change_24h ?? 0
          const price = row.ticker?.mark_price ?? 0

          return (
            <button
              key={row.symbol}
              onClick={() => setSelected(row.symbol)}
              className="w-full text-left bg-[#0f1117] border border-white/[0.07] rounded-xl p-4 transition-all hover:border-violet-500/40 hover:bg-violet-500/[0.04] group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-white">{row.symbol}</span>
                <ArrowLeft
                  size={11}
                  className="text-white/15 group-hover:text-violet-400/50 rotate-180 transition-colors"
                />
              </div>
              <div className="text-lg font-bold tabular-nums text-white">
                {price > 0 ? price.toFixed(4) : '—'}
              </div>
              <div
                className={`text-xs mt-1 ${change24 >= 0 ? 'text-emerald-400/90' : 'text-red-400/90'}`}
              >
                24h {fmt(change24, 2)}%
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-xs text-white/30">
                <span>Vol {Math.round(row.ticker?.volume_24h ?? 0).toLocaleString()}</span>
              </div>
              {row.stats ? (
                <div className="mt-2 text-[11px] text-white/35">
                  <span className={pnlClass(row.stats.totalPnl)}>{fmt(row.stats.totalPnl, 2)}</span>{' '}
                  · WR {row.stats.winRate.toFixed(0)}% · PF {pf} · {row.stats.closedTrades}T
                </div>
              ) : (
                <div className="mt-2 text-[11px] text-white/20">No trade history</div>
              )}
              <MiniPnlChart trades={symTrades} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
