'use client'
import { useState, useRef, useMemo } from 'react'
import { ExtendedDashboardStats, SymbolStats, HourStats, Trade } from '@/types'
import { authFetch } from '@/lib/api'
import { BiasSummary, BiasInstance, SymbolBiasReport, GlobalBiasReport } from '@/lib/bias-analysis'
import { BIAS_COLORS as COLORS, SEVERITY_LABEL } from '@/lib/bias-colors'
import {
  Sparkles,
  Loader2,
  AlertCircle,
  ChevronRight,
  Brain,
  Activity,
  RefreshCw,
  TrendingUp,
  DollarSign,
} from 'lucide-react'

interface Props {
  stats: ExtendedDashboardStats
  symbolStats: SymbolStats[]
  hourStats: HourStats[]
  trades: Trade[]
  biasReport: GlobalBiasReport
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function safeResponseText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return `HTTP ${res.status}`
  }
}

async function readStream(res: Response, onChunk: (text: string) => void): Promise<void> {
  if (!res.body) throw new Error('Server returned no response body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let acc = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      acc += decoder.decode(value, { stream: true })
      onChunk(acc)
    }
  } finally {
    reader.releaseLock()
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function HealthRing({ score }: { score: number }) {
  const color = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'
  const r = 38
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
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
          {score}
        </div>
        <div className="text-[10px] text-white/30 leading-none mt-0.5">health</div>
      </div>
    </div>
  )
}

function BiasBar({ bias }: { bias: BiasSummary }) {
  const c = COLORS[bias.type]
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
          <span className={`text-xs font-medium truncate ${c.text}`}>{bias.label}</span>
          {bias.instances.length > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.bg} ${c.text} shrink-0`}>
              {bias.instances.length}
            </span>
          )}
        </div>
        <span className="text-[10px] text-white/30 shrink-0">{SEVERITY_LABEL[bias.severity]}</span>
      </div>
      <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
        <div
          className={`h-full ${c.bar} rounded-full transition-all duration-700`}
          style={{ width: `${bias.score}%`, opacity: bias.score === 0 ? 0.3 : 1 }}
        />
      </div>
    </div>
  )
}

function InstanceList({ instances, type }: { instances: BiasInstance[]; type: string }) {
  const [expanded, setExpanded] = useState(false)
  const c = COLORS[type as keyof typeof COLORS]
  const shown = expanded ? instances : instances.slice(0, 3)
  if (instances.length === 0)
    return <p className="text-xs text-white/25 italic pl-1">No instances detected</p>
  return (
    <div className="space-y-1.5">
      {shown.map((inst, i) => (
        <div key={i} className={`flex gap-2 text-xs px-2 py-1.5 rounded-lg ${c.bg}`}>
          <span className={`shrink-0 font-bold ${c.text}`}>
            {'●'.repeat(inst.severity)}
            {'○'.repeat(3 - inst.severity)}
          </span>
          <div className="min-w-0">
            <span className="text-white/60">{inst.reason}</span>
            <span className="text-white/25 ml-1.5 text-[10px]">
              {inst.entryTime.slice(0, 16).replace('T', ' ')}
            </span>
          </div>
        </div>
      ))}
      {instances.length > 3 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-[11px] text-white/30 hover:text-white/60 pl-1 transition-colors"
        >
          {expanded ? '↑ Show less' : `↓ Show ${instances.length - 3} more`}
        </button>
      )}
    </div>
  )
}

function CoinBiasPanel({ report }: { report: SymbolBiasReport }) {
  const totalInstances = report.biases.reduce((s, b) => s + b.instances.length, 0)
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <HealthRing score={report.healthScore} />
        <div>
          <div className="text-base font-semibold text-white">{report.symbol}</div>
          <div className="text-xs text-white/40 mt-0.5">
            {report.totalTrades} fills · {totalInstances} bias signals detected
          </div>
        </div>
      </div>
      {report.biases.map((bias) => (
        <div key={bias.type} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${COLORS[bias.type].text}`}>{bias.label}</span>
            <span className="text-[10px] text-white/25">{bias.description}</span>
          </div>
          <InstanceList instances={bias.instances} type={bias.type} />
        </div>
      ))}
    </div>
  )
}

function MarkdownSection({ text }: { text: string }) {
  const sections = text.split(/(?=^## )/m)
  return (
    <div className="space-y-4 text-sm leading-relaxed text-white/80">
      {sections.map((section, i) => {
        const lines = section.split('\n')
        const heading = lines[0].replace(/^## /, '').trim()
        const body = lines.slice(1).join('\n').trim()
        if (!heading)
          return (
            <p key={i} className="text-white/70">
              {body}
            </p>
          )
        return (
          <div key={i}>
            <h3 className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
              <ChevronRight size={13} className="text-violet-400" />
              {heading}
            </h3>
            <div className="pl-5 space-y-1">
              {body.split('\n').map((line, j) => {
                const cleaned = line
                  .replace(/^[-*•]\s*/, '')
                  .replace(/^\d+\.\s*/, '')
                  .replace(/\*\*(.*?)\*\*/g, '$1')
                  .trim()
                if (!cleaned) return null
                return (
                  <div key={j} className="flex items-start gap-2 text-white/65">
                    <span className="text-violet-400/60 mt-0.5 shrink-0">•</span>
                    <span>{cleaned}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── NEW: 30-Day P&L Calendar ───────────────────────────────────────────────────

function PnlCalendar({ trades }: { trades: Trade[] }) {
  const days = useMemo(() => {
    const result: string[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      result.push(d.toISOString().slice(0, 10))
    }
    return result
  }, [])

  const byDate = useMemo(() => {
    const map = new Map<string, { pnl: number; count: number }>()
    trades.forEach((t) => {
      const d = t.entry_time.slice(0, 10)
      const cur = map.get(d) ?? { pnl: 0, count: 0 }
      map.set(d, { pnl: cur.pnl + t.pnl, count: cur.count + 1 })
    })
    return map
  }, [trades])

  const maxAbs = useMemo(() => {
    let m = 0
    byDate.forEach((v) => {
      if (Math.abs(v.pnl) > m) m = Math.abs(v.pnl)
    })
    return Math.max(m, 1)
  }, [byDate])

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="bg-[#0f1117] border border-white/[0.07] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={13} className="text-white/30" />
        <span className="text-xs text-white/30 uppercase tracking-widest font-medium">
          30-Day P&L Calendar
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {days.map((day) => {
          const data = byDate.get(day)
          const pnl = data?.pnl ?? null
          const intensity = pnl !== null ? Math.abs(pnl) / maxAbs : 0
          const isToday = day === today
          const bg =
            pnl === null
              ? 'rgba(255,255,255,0.03)'
              : pnl >= 0
                ? `rgba(52,211,153,${0.15 + intensity * 0.65})`
                : `rgba(248,113,113,${0.15 + intensity * 0.65})`
          const label = `${day}: ${pnl !== null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT (${data?.count} trades)` : 'No trades'}`
          return (
            <div
              key={day}
              title={label}
              style={{ background: bg }}
              className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-default transition-transform hover:scale-110 ${isToday ? 'ring-1 ring-violet-400' : ''}`}
            >
              <span className="text-[9px] text-white/50 font-medium select-none">
                {parseInt(day.slice(-2))}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-2 mt-2">
        {[-1, -0.5, 0, 0.5, 1].map((v, i) => (
          <div
            key={i}
            style={{
              background:
                v === 0
                  ? 'rgba(255,255,255,0.04)'
                  : v > 0
                    ? `rgba(52,211,153,${0.15 + v * 0.65})`
                    : `rgba(248,113,113,${0.15 + Math.abs(v) * 0.65})`,
            }}
            className="w-3.5 h-3.5 rounded-sm"
          />
        ))}
        <span className="text-[10px] text-white/20 ml-0.5">Loss → Gain · Ring = today</span>
      </div>
    </div>
  )
}

// ── NEW: Commission Impact ─────────────────────────────────────────────────────

function CommissionPanel({ stats, trades }: { stats: ExtendedDashboardStats; trades: Trade[] }) {
  const grossWin = useMemo(
    () => trades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0),
    [trades]
  )
  const commission = stats.totalCommission

  const commissionPct = grossWin > 0 ? (commission / grossWin) * 100 : 0
  const activeDays = useMemo(() => {
    const days = new Set(trades.map((t) => t.entry_time.slice(0, 10)))
    return Math.max(days.size, 1)
  }, [trades])
  const dailyCommission = commission / activeDays
  const monthlyEst = dailyCommission * 22

  return (
    <div className="bg-[#0f1117] border border-white/[0.07] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign size={13} className="text-white/30" />
        <span className="text-xs text-white/30 uppercase tracking-widest font-medium">
          Commission Impact
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Gross P&L',
            value: `${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}`,
            cls: stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
          },
          { label: 'Commission', value: `-${commission.toFixed(2)}`, cls: 'text-amber-400' },
          {
            label: '% of Gross',
            value: `${commissionPct.toFixed(1)}%`,
            cls:
              commissionPct > 15
                ? 'text-red-400'
                : commissionPct > 8
                  ? 'text-amber-400'
                  : 'text-white/70',
          },
          { label: 'Est./Month', value: `~${monthlyEst.toFixed(0)} USDT`, cls: 'text-white/70' },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-[10px] text-white/25 mb-1 uppercase tracking-wide">{s.label}</div>
            <div className={`text-base font-bold tabular-nums ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>
      {commissionPct > 15 && (
        <p className="text-xs text-red-400/70 mt-3">
          ⚠ Commission is {commissionPct.toFixed(0)}% of your gross wins — high frequency is eating
          significantly into returns. Consider reducing trade count.
        </p>
      )}
    </div>
  )
}

// ── NEW: Best Setups ───────────────────────────────────────────────────────────

function BestSetups({ trades }: { trades: Trade[] }) {
  const setups = useMemo(() => {
    const map = new Map<string, { wins: number; total: number; pnl: number }>()
    trades
      .filter((t) => t.pnl !== 0)
      .forEach((t) => {
        const hour = new Date(t.entry_time).getUTCHours()
        const key = `${t.symbol}|${t.direction}|${String(hour).padStart(2, '0')}h UTC`
        const cur = map.get(key) ?? { wins: 0, total: 0, pnl: 0 }
        map.set(key, {
          wins: cur.wins + (t.pnl > 0 ? 1 : 0),
          total: cur.total + 1,
          pnl: cur.pnl + t.pnl,
        })
      })
    return [...map.entries()]
      .filter(([, v]) => v.total >= 5)
      .map(([key, v]) => ({ key, winRate: (v.wins / v.total) * 100, ...v }))
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 5)
  }, [trades])

  if (!setups.length) return null

  return (
    <div className="bg-[#0f1117] border border-white/[0.07] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={13} className="text-white/30" />
        <span className="text-xs text-white/30 uppercase tracking-widest font-medium">
          Your Best Setups (≥5 samples)
        </span>
      </div>
      <div className="space-y-2">
        {setups.map((s, i) => {
          const [sym, dir, time] = s.key.split('|')
          const isLong = dir === 'long'
          return (
            <div key={s.key} className="flex items-center gap-3">
              <span className="text-[10px] text-white/25 w-4 text-right">{i + 1}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${isLong ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}
              >
                {isLong ? 'LONG' : 'SHORT'}
              </span>
              <span className="text-xs font-semibold text-white/80 shrink-0">{sym}</span>
              <span className="text-[11px] text-white/35 shrink-0">@ {time}</span>
              <div className="flex-1 h-1 bg-white/[0.05] rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${s.winRate}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-emerald-400 w-10 text-right tabular-nums">
                {s.winRate.toFixed(0)}%
              </span>
              <span className="text-[10px] text-white/25 w-12 text-right tabular-nums">
                {s.total}t
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────────

export function AiInsights({ stats, symbolStats, hourStats, trades, biasReport }: Props) {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const report = biasReport
  const hasTrades = stats.closedTrades > 0

  const activeSymbol: SymbolBiasReport | undefined = selectedSymbol
    ? report.symbolReports.find((r) => r.symbol === selectedSymbol)
    : report.symbolReports[0]

  async function generate() {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setError(null)
    setAnalysis('')
    try {
      const res = await authFetch('/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({
          stats,
          symbolStats,
          hourStats,
          recentTrades: trades.slice(0, 200),
          biasReport: {
            overallHealthScore: report.overallHealthScore,
            biases: report.biases.map((b) => ({
              type: b.type,
              label: b.label,
              count: b.instances.length,
              score: b.score,
              severity: b.severity,
              topInstances: b.instances.slice(0, 5).map((i) => ({
                symbol: i.symbol,
                reason: i.reason,
                severity: i.severity,
              })),
            })),
            symbolHealthScores: report.symbolReports.map((r) => ({
              symbol: r.symbol,
              healthScore: r.healthScore,
              biasCounts: Object.fromEntries(r.biases.map((b) => [b.type, b.instances.length])),
            })),
          },
        }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) {
        const msg = await safeResponseText(res)
        throw new Error(msg || `Analysis failed (${res.status})`)
      }
      await readStream(res, setAnalysis)
    } catch (e) {
      if ((e as Error).name !== 'AbortError')
        setError(e instanceof Error ? e.message : 'Failed to generate analysis')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Global health overview */}
      <div className="bg-[#0f1117] border border-white/[0.07] rounded-xl p-5">
        <div className="flex items-start gap-5">
          <HealthRing score={report.overallHealthScore} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={14} className="text-violet-400" />
              <span className="text-xs font-semibold text-white/60 uppercase tracking-widest">
                Psychological Profile — All Coins
              </span>
            </div>
            <div className="space-y-2.5">
              {report.biases.map((bias) => (
                <BiasBar key={bias.type} bias={bias} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 30-Day Calendar */}
      {hasTrades && <PnlCalendar trades={trades} />}

      {/* Per-coin analysis */}
      {hasTrades && report.symbolReports.length > 0 && (
        <div className="bg-[#0f1117] border border-white/[0.07] rounded-xl overflow-hidden">
          <div className="flex items-center gap-1 px-3 pt-3 pb-0 flex-wrap">
            <Activity size={13} className="text-white/30 mr-1" />
            {report.symbolReports.map((r) => {
              const isActive = (selectedSymbol ?? report.symbolReports[0]?.symbol) === r.symbol
              const worstBias = r.biases.reduce((max, b) => (b.score > max ? b.score : max), 0)
              const dotColor =
                worstBias >= 60 ? 'bg-red-500' : worstBias >= 30 ? 'bg-yellow-500' : 'bg-green-500'
              return (
                <button
                  key={r.symbol}
                  onClick={() => setSelectedSymbol(r.symbol)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors mb-1 ${
                    isActive
                      ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                      : 'text-white/40 hover:text-white/70 border border-transparent'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                  {r.symbol}
                </button>
              )
            })}
          </div>
          {activeSymbol && (
            <div className="p-5 border-t border-white/[0.05] mt-2">
              <CoinBiasPanel report={activeSymbol} />
            </div>
          )}
        </div>
      )}

      {/* Commission + Best Setups */}
      {hasTrades && (
        <div className="grid grid-cols-1 gap-4">
          <CommissionPanel stats={stats} trades={trades} />
          <BestSetups trades={trades} />
        </div>
      )}

      {/* AI Report trigger */}
      <div className="bg-[#0f1117] border border-white/[0.07] rounded-xl p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-white/40 uppercase tracking-widest font-medium mb-1">
              AI Deep Report
            </div>
            <p className="text-sm text-white/50">
              {hasTrades
                ? `Gemini will analyze ${stats.closedTrades} trades + ${report.biases.reduce((s, b) => s + b.instances.length, 0)} bias signals across ${report.symbolReports.length} coins.`
                : 'No closed trades yet. Sync from Delta Exchange first.'}
            </p>
          </div>
          <button
            onClick={generate}
            disabled={loading || !hasTrades}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-white transition-colors whitespace-nowrap"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Analyzing…
              </>
            ) : (
              <>
                <Sparkles size={14} /> Generate Report
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-300 font-medium">Analysis failed</p>
            <p className="text-xs text-red-300/70 mt-0.5">{error}</p>
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs text-red-300 hover:bg-red-500/10 transition-colors shrink-0"
          >
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      )}

      {analysis && (
        <div className="bg-[#0f1117] border border-white/[0.07] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/[0.06]">
            <Sparkles size={14} className="text-violet-400" />
            <span className="text-xs text-violet-400/80 font-semibold uppercase tracking-widest">
              Gemini Analysis
            </span>
            {loading && <Loader2 size={12} className="animate-spin text-white/30 ml-auto" />}
          </div>
          <MarkdownSection text={analysis} />
        </div>
      )}

      {!analysis && !loading && !error && hasTrades && (
        <div className="text-center py-10 text-white/20 text-sm">
          Click "Generate Report" for a deep narrative analysis powered by Gemini.
        </div>
      )}
    </div>
  )
}
