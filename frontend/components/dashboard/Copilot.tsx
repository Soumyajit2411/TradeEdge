'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { Trade, ExtendedDashboardStats } from '@/types'
import { authFetch } from '@/lib/api'
import {
  computeWarnings, computeRiskProfile, computeSessionProfile,
  computeWeeklyDiscipline, scoreTradeQuality,
  BehavioralWarning, TradeQualityScore,
} from '@/lib/copilot-analysis'
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine,
} from 'recharts'
import { format } from 'date-fns'
import {
  AlertTriangle, ShieldAlert, Info, Zap, Brain, Activity,
  TrendingUp, TrendingDown, Loader2, RotateCcw,
  BookOpen, Shield, Clock, Target, Flag, Edit2, Check, X,
} from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────────────────────

function pnlClass(v: number) { return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-white/30' }
function fmt(v: number, d = 2) { return `${v >= 0 ? '+' : ''}${v.toFixed(d)}` }

async function safeResponseText(res: Response): Promise<string> {
  try { return await res.text() } catch { return `HTTP ${res.status}` }
}

async function readStream(res: Response, onChunk: (text: string) => void): Promise<void> {
  if (!res.body) throw new Error('Server returned no response body')
  const reader  = res.body.getReader()
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

function todayStr()     { return new Date().toISOString().slice(0, 10) }
function weekStartStr() { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10) }

// ── Warning Banner ─────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  danger:  { bg: 'bg-red-500/10',   border: 'border-red-500/30',   text: 'text-red-300',   icon: ShieldAlert,   pulse: true  },
  caution: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', icon: AlertTriangle, pulse: false },
  info:    { bg: 'bg-sky-500/10',   border: 'border-sky-500/25',   text: 'text-sky-300',   icon: Info,          pulse: false },
} as const

function WarningCard({ w, onDismiss }: { w: BehavioralWarning; onDismiss: () => void }) {
  const cfg  = SEVERITY_CONFIG[w.severity]
  const Icon = cfg.icon
  return (
    <div className={`${cfg.bg} border ${cfg.border} rounded-xl p-4 relative`}>
      {cfg.pulse && (
        <span className="absolute top-3 right-3 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
      )}
      <div className="flex items-start gap-3">
        <Icon size={16} className={`${cfg.text} mt-0.5 shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${cfg.text} mb-1`}>{w.title}</div>
          <p className="text-xs text-white/60 leading-relaxed">{w.detail}</p>
          {w.stat && <p className="text-xs text-white/35 mt-1.5 italic">{w.stat}</p>}
          {w.action && (
            <div className="mt-2 flex items-start gap-1.5">
              <Zap size={11} className="text-violet-400 mt-0.5 shrink-0" />
              <p className="text-xs text-violet-300/80">{w.action}</p>
            </div>
          )}
        </div>
        <button onClick={onDismiss} className="text-white/15 hover:text-white/40 transition-colors text-lg leading-none shrink-0">×</button>
      </div>
    </div>
  )
}

// ── Daily Guard ────────────────────────────────────────────────────────────────

function DailyGuard({ trades }: { trades: Trade[] }) {
  const risk = useMemo(() => computeRiskProfile(trades), [trades])

  const today     = todayStr()
  const todayPnl  = useMemo(() => trades.filter(t => t.entry_time.startsWith(today)).reduce((s, t) => s + t.pnl, 0), [trades, today])
  const avgDaily  = risk.avgDailyTrades
  const todayCount = risk.todayTradeCount
  const tradeRatio = avgDaily > 0 ? todayCount / avgDaily : 0

  const status =
    tradeRatio >= 2    ? { label: 'Overtrading',  cls: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/25'    } :
    tradeRatio >= 1.5  ? { label: 'Elevated',     cls: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/25'  } :
                         { label: 'Normal',        cls: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/25'}

  const barW = Math.min(tradeRatio * 50, 100)

  return (
    <div className={`${status.bg} border ${status.border} rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield size={13} className={status.cls} />
          <span className="text-xs font-semibold text-white/60 uppercase tracking-widest">Daily Guard</span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${status.bg} ${status.cls} border ${status.border}`}>
          {status.label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <div className="text-[10px] text-white/25 mb-0.5">Today's Trades</div>
          <div className={`text-xl font-bold ${tradeRatio >= 1.5 ? status.cls : 'text-white'}`}>{todayCount}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-white/25 mb-0.5">Daily Avg</div>
          <div className="text-xl font-bold text-white/60">{avgDaily.toFixed(0)}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-white/25 mb-0.5">Today P&L</div>
          <div className={`text-xl font-bold tabular-nums ${pnlClass(todayPnl)}`}>{fmt(todayPnl, 2)}</div>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-white/30">
          <span>Trade frequency</span>
          <span>{(tradeRatio * 100).toFixed(0)}% of avg</span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${barW}%`,
              background: tradeRatio >= 2 ? '#ef4444' : tradeRatio >= 1.5 ? '#f59e0b' : '#22c55e',
            }} />
        </div>
        <div className="flex justify-between text-[9px] text-white/20">
          <span>0</span><span>Normal</span><span>1.5×</span><span>2×</span>
        </div>
      </div>
    </div>
  )
}

// ── Risk Intelligence tab ──────────────────────────────────────────────────────

function RiskTab({ trades }: { trades: Trade[] }) {
  const risk   = useMemo(() => computeRiskProfile(trades), [trades])
  const maxPct = Math.max(risk.concentration.reduce((m, c) => c.tradePct > m ? c.tradePct : m, 0), 1)

  return (
    <div className="space-y-4">
      <DailyGuard trades={trades} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Today's P&L",        value: fmt(risk.dailyPnl)  + ' USDT', cls: pnlClass(risk.dailyPnl)  },
          { label: "Week's P&L",          value: fmt(risk.weeklyPnl) + ' USDT', cls: pnlClass(risk.weeklyPnl) },
          { label: 'Consecutive Losses',  value: String(risk.consecutiveLosses), cls: risk.consecutiveLosses >= 3 ? 'text-red-400' : 'text-white' },
          { label: "Today's Trades",      value: `${risk.todayTradeCount} / avg ${risk.avgDailyTrades.toFixed(0)}`, cls: risk.todayTradeCount > risk.avgDailyTrades * 1.5 ? 'text-amber-400' : 'text-white' },
        ].map(s => (
          <div key={s.label} className="bg-[#0f1117] border border-white/[0.06] rounded-xl px-4 py-3">
            <div className="text-[10px] text-white/30 uppercase tracking-wide mb-1">{s.label}</div>
            <div className={`text-lg font-bold tabular-nums ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
        <div className="text-xs text-white/30 uppercase tracking-widest font-medium mb-4">Symbol Concentration</div>
        <div className="space-y-2.5">
          {risk.concentration.map(c => (
            <div key={c.symbol} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-white/70">{c.symbol}</span>
                <div className="flex items-center gap-4 text-white/40">
                  <span>{c.trades} trades</span>
                  <span className={`font-semibold tabular-nums ${pnlClass(c.pnl)}`}>{fmt(c.pnl, 2)} USDT</span>
                  <span className="w-10 text-right">{c.tradePct.toFixed(0)}%</span>
                </div>
              </div>
              <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{
                    width: `${(c.tradePct / maxPct) * 100}%`,
                    background: c.tradePct >= 60 ? '#ef4444' : c.tradePct >= 40 ? '#f59e0b' : '#7c3aed',
                  }} />
              </div>
            </div>
          ))}
        </div>
        {risk.concentration[0]?.tradePct >= 60 && (
          <p className="text-xs text-red-400/70 mt-3">⚠ High concentration in {risk.concentration[0].symbol} — single-coin risk elevated</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
          <div className="text-[10px] text-white/30 uppercase tracking-wide mb-2">Worst Day Ever</div>
          <div className="text-xl font-bold text-red-400">{fmt(risk.worstDayInHistory)} USDT</div>
          <p className="text-xs text-white/30 mt-1">Maximum recorded daily loss</p>
        </div>
        <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
          <div className="text-[10px] text-white/30 uppercase tracking-wide mb-2">Avg Losing Day</div>
          <div className="text-xl font-bold text-amber-400">{fmt(-risk.avgDailyLoss)} USDT</div>
          <p className="text-xs text-white/30 mt-1">Average P&L on negative days</p>
        </div>
      </div>
    </div>
  )
}

// ── Session Intelligence tab ───────────────────────────────────────────────────

function SessionTab({ trades }: { trades: Trade[] }) {
  const session = useMemo(() => computeSessionProfile(trades), [trades])
  const active  = session.hourlyPnl.filter(h => h.trades > 0)
  const maxAbs  = Math.max(active.reduce((m, h) => Math.abs(h.pnl) > m ? Math.abs(h.pnl) : m, 0), 1)

  const trendConfig = {
    strong:  { label: 'Strong edge',  cls: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    average: { label: 'Average',       cls: 'text-amber-400',   bg: 'bg-amber-500/10'   },
    weak:    { label: 'Weak edge',     cls: 'text-red-400',     bg: 'bg-red-500/10'     },
    unknown: { label: 'No data yet',   cls: 'text-white/30',    bg: 'bg-white/[0.04]'   },
  }[session.currentHourTrend]

  return (
    <div className="space-y-4">
      <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
        <div className="text-xs text-white/30 uppercase tracking-widest font-medium mb-4">Today's Session</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Net P&L',  value: fmt(session.todayPnl)     + ' USDT', cls: pnlClass(session.todayPnl) },
            { label: 'Win Rate', value: `${session.todayWinRate.toFixed(0)}%`,                                 cls: 'text-white' },
            { label: 'Wins',     value: String(session.todayWins),                                              cls: 'text-emerald-400' },
            { label: 'Losses',   value: String(session.todayLosses),                                            cls: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-[10px] text-white/25 mb-1">{s.label}</div>
              <div className={`text-xl font-bold tabular-nums ${s.cls}`}>{s.value}</div>
            </div>
          ))}
        </div>
        <div className={`mt-4 flex items-center gap-2 px-3 py-2 rounded-lg ${trendConfig.bg}`}>
          <Clock size={12} className={trendConfig.cls} />
          <span className="text-xs text-white/50">Current hour edge:</span>
          <span className={`text-xs font-semibold ${trendConfig.cls}`}>{trendConfig.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {session.bestHour && (
          <div className="bg-emerald-500/[0.07] border border-emerald-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={13} className="text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">Best Hour</span>
            </div>
            <div className="text-2xl font-bold text-white">{session.bestHour.label}</div>
            <div className="text-xs text-white/40 mt-1">Avg {fmt(session.bestHour.avgPnl, 3)} USDT · {session.bestHour.winRate.toFixed(0)}% WR</div>
          </div>
        )}
        {session.worstHour && (
          <div className="bg-red-500/[0.07] border border-red-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown size={13} className="text-red-400" />
              <span className="text-xs font-semibold text-red-400">Worst Hour</span>
            </div>
            <div className="text-2xl font-bold text-white">{session.worstHour.label}</div>
            <div className="text-xs text-white/40 mt-1">Avg {fmt(session.worstHour.avgPnl, 3)} USDT · {session.worstHour.winRate.toFixed(0)}% WR</div>
          </div>
        )}
      </div>

      <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
        <div className="text-xs text-white/30 uppercase tracking-widest font-medium mb-3">Historical P&L by Hour (UTC)</div>
        <div className="flex flex-wrap gap-1.5">
          {active.map(h => {
            const intensity  = Math.abs(h.pnl) / maxAbs
            const bg         = h.pnl >= 0
              ? `rgba(52,211,153,${0.12 + intensity * 0.6})`
              : `rgba(248,113,113,${0.12 + intensity * 0.6})`
            const currentH   = new Date().getUTCHours()
            const isCurrent  = parseInt(h.label) === currentH
            return (
              <div key={h.label}
                title={`${h.label}: ${fmt(h.pnl, 2)} USDT (${h.trades} trades, ${h.trades ? (h.wins / h.trades * 100).toFixed(0) : 0}% WR)`}
                style={{ background: bg }}
                className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-default transition-transform hover:scale-105 ${isCurrent ? 'ring-1 ring-violet-500' : ''}`}>
                <span className="text-[9px] text-white/50 font-medium">{h.label.slice(0, 2)}h</span>
                <span className="text-[10px] text-white font-bold">{fmt(h.pnl, 0)}</span>
                <span className="text-[8px] text-white/40">{h.trades}t</span>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-white/20 mt-2">Hover for details · Ring = current UTC hour</p>
      </div>
    </div>
  )
}

// ── Discipline tab ─────────────────────────────────────────────────────────────

function DisciplineTab({ trades }: { trades: Trade[] }) {
  const weeks = useMemo(() => computeWeeklyDiscipline(trades), [trades])

  function scoreColor(s: number) { return s >= 75 ? '#22c55e' : s >= 50 ? '#f59e0b' : '#ef4444' }
  function scoreLabel(s: number) { return s >= 80 ? 'Excellent' : s >= 65 ? 'Good' : s >= 50 ? 'Fair' : s >= 35 ? 'Poor' : 'Critical' }

  return (
    <div className="space-y-4">
      <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
        <div className="text-xs text-white/30 uppercase tracking-widest font-medium mb-4">Weekly Discipline Score</div>
        {weeks.length === 0 ? (
          <p className="text-xs text-white/25">Not enough data yet</p>
        ) : (
          <div className="space-y-3">
            {weeks.map(w => (
              <div key={w.weekKey} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-white/70">{w.weekLabel}</span>
                    <span className="text-[10px] text-white/25 ml-2">{w.trades} trades</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold tabular-nums ${pnlClass(w.pnl)}`}>{fmt(w.pnl, 2)} USDT</span>
                    <span className="text-xs font-bold" style={{ color: scoreColor(w.score) }}>
                      {w.score}/100 · {scoreLabel(w.score)}
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${w.score}%`, background: scoreColor(w.score) }} />
                </div>
                {(w.revengeInstances > 0 || w.fomoInstances > 0 || w.overtradingDays > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {w.revengeInstances > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">{w.revengeInstances} revenge</span>}
                    {w.fomoInstances    > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400">{w.fomoInstances} FOMO</span>}
                    {w.overtradingDays  > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">{w.overtradingDays} overtrading day{w.overtradingDays > 1 ? 's' : ''}</span>}
                    {w.worstDay < -0.01 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.04] text-white/30">worst day {fmt(w.worstDay, 2)}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {weeks.length >= 2 && (
        <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
          <div className="text-xs text-white/30 uppercase tracking-widest font-medium mb-3">Discipline Trend</div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={[...weeks].reverse()} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="weekLabel" tick={{ fontSize: 9, fill: '#ffffff25' }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#ffffff25' }} tickLine={false} axisLine={false} width={28} />
              <ReferenceLine y={70} stroke="#ffffff10" strokeDasharray="3 3" />
              <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid #ffffff15', borderRadius: 8, fontSize: 11 }}
                formatter={(v) => [`${v}/100`, 'Discipline']} />
              <Line type="monotone" dataKey="score" stroke="#7c3aed" strokeWidth={2} dot={{ fill: '#7c3aed', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-white/20 mt-1">Dashed line = 70 (good threshold)</p>
        </div>
      )}
    </div>
  )
}

// ── Goals tab (new) ────────────────────────────────────────────────────────────

function GoalInput({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')

  const commit = () => {
    const n = parseFloat(draft)
    if (!isNaN(n) && n > 0) onSave(n)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/40">{label}</span>
        <input
          autoFocus
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          className="w-24 bg-white/[0.07] border border-white/[0.15] rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-500/50"
          placeholder="0"
        />
        <button onClick={commit} className="text-emerald-400 hover:text-emerald-300"><Check size={13} /></button>
        <button onClick={() => setEditing(false)} className="text-white/30 hover:text-white/60"><X size={13} /></button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/40">{label}</span>
      <span className="text-sm font-semibold text-white">{value} USDT</span>
      <button onClick={() => { setDraft(String(value)); setEditing(true) }}
        className="text-white/20 hover:text-white/50 transition-colors">
        <Edit2 size={11} />
      </button>
    </div>
  )
}

function GoalsTab({ trades }: { trades: Trade[] }) {
  const [dailyGoal,  setDailyGoal]  = useState(100)
  const [weeklyGoal, setWeeklyGoal] = useState(500)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const d = localStorage.getItem('tradiary_daily_goal')
    const w = localStorage.getItem('tradiary_weekly_goal')
    if (d) setDailyGoal(parseFloat(d))
    if (w) setWeeklyGoal(parseFloat(w))
  }, [])

  const saveDaily  = (v: number) => { setDailyGoal(v);  localStorage.setItem('tradiary_daily_goal',  String(v)) }
  const saveWeekly = (v: number) => { setWeeklyGoal(v); localStorage.setItem('tradiary_weekly_goal', String(v)) }

  const today     = todayStr()
  const weekStart = weekStartStr()

  const todayPnl  = useMemo(() => trades.filter(t => t.entry_time.startsWith(today)).reduce((s, t) => s + t.pnl, 0), [trades, today])
  const weeklyPnl = useMemo(() => trades.filter(t => t.entry_time >= weekStart).reduce((s, t) => s + t.pnl, 0),        [trades, weekStart])

  // Goal hit history
  const goalHistory = useMemo(() => {
    const byDay: Record<string, number> = {}
    trades.forEach(t => { const d = t.entry_time.slice(0, 10); byDay[d] = (byDay[d] ?? 0) + t.pnl })
    const days = Object.entries(byDay).filter(([d]) => d !== today)
    const hits  = days.filter(([, pnl]) => pnl >= dailyGoal).length
    return { total: days.length, hits }
  }, [trades, dailyGoal, today])

  function GoalBar({ current, goal, label }: { current: number; goal: number; label: string }) {
    const pct      = goal > 0 ? Math.min((current / goal) * 100, 100) : 0
    const exceeded = current >= goal
    const negative = current < 0
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/50">{label}</span>
          <span className={`text-sm font-bold tabular-nums ${exceeded ? 'text-emerald-400' : negative ? 'text-red-400' : 'text-white'}`}>
            {fmt(current, 2)} / {goal} USDT
          </span>
        </div>
        <div className="h-3 bg-white/[0.05] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.max(pct, current < 0 ? 0 : pct)}%`,
              background: exceeded ? '#22c55e' : negative ? '#ef4444' : '#7c3aed',
            }} />
        </div>
        <div className="flex justify-between text-[10px] text-white/25">
          <span>{pct >= 0 ? `${pct.toFixed(0)}%` : '0%'} of goal</span>
          {exceeded
            ? <span className="text-emerald-400 font-medium">🎯 Goal hit!</span>
            : <span>{fmt(goal - current, 2)} USDT to go</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Goal settings */}
      <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Flag size={13} className="text-violet-400" />
          <span className="text-xs text-white/30 uppercase tracking-widest font-medium">Goals</span>
          <span className="text-[10px] text-white/20 ml-auto">Saved locally</span>
        </div>
        <div className="space-y-4">
          <GoalInput label="Daily target"  value={dailyGoal}  onSave={saveDaily}  />
          <GoalInput label="Weekly target" value={weeklyGoal} onSave={saveWeekly} />
        </div>
      </div>

      {/* Progress */}
      <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4 space-y-5">
        <div className="text-xs text-white/30 uppercase tracking-widest font-medium">Progress</div>
        <GoalBar current={todayPnl}  goal={dailyGoal}  label="Today's P&L" />
        <GoalBar current={weeklyPnl} goal={weeklyGoal} label="This Week's P&L" />
      </div>

      {/* Historical hit rate */}
      {goalHistory.total > 0 && (
        <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4">
          <div className="text-xs text-white/30 uppercase tracking-widest font-medium mb-3">Goal Achievement History</div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-violet-400">{((goalHistory.hits / goalHistory.total) * 100).toFixed(0)}%</div>
              <div className="text-[10px] text-white/25 mt-0.5">Daily hit rate</div>
            </div>
            <div className="flex-1 space-y-1">
              <div className="text-xs text-white/40">{goalHistory.hits} out of {goalHistory.total} trading days hit the {dailyGoal} USDT daily goal</div>
              <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full"
                  style={{ width: `${(goalHistory.hits / goalHistory.total) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Trade Replay tab ───────────────────────────────────────────────────────────

function ReplayTab({ trades, stats }: { trades: Trade[]; stats: ExtendedDashboardStats }) {
  const [selected, setSelected] = useState<Trade | null>(null)
  const [analysis, setAnalysis] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [replayErr, setReplayErr] = useState<string | null>(null)
  const [quality,  setQuality]  = useState<TradeQualityScore | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const recent = useMemo(() =>
    trades.filter(t => t.pnl !== 0)
      .sort((a, b) => b.entry_time.localeCompare(a.entry_time))
      .slice(0, 40),
    [trades],
  )

  function gradeColor(g: string) {
    return { A: 'text-emerald-400', B: 'text-sky-400', C: 'text-amber-400', D: 'text-orange-400', F: 'text-red-400' }[g] ?? 'text-white'
  }
  function gradeBg(g: string) {
    return { A: 'bg-emerald-500/10', B: 'bg-sky-500/10', C: 'bg-amber-500/10', D: 'bg-orange-500/10', F: 'bg-red-500/10' }[g] ?? 'bg-white/5'
  }

  async function replay(trade: Trade) {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setSelected(trade)
    setAnalysis('')
    setReplayErr(null)
    setLoading(true)
    const qualityScore = scoreTradeQuality(trade, trades)
    setQuality(qualityScore)

    try {
      const context = {
        quality: qualityScore,
        winRate: stats.winRate,
        totalPnl: stats.totalPnl,
        maxDrawdown: stats.maxDrawdown,
        avgWin: stats.avgWin,
        avgLoss: stats.avgLoss,
        recentTrades: trades
          .filter(t => t.pnl !== 0 && t.id !== trade.id)
          .sort((a, b) => b.entry_time.localeCompare(a.entry_time))
          .slice(0, 8),
      }
      const res = await authFetch('/api/ai/trade-replay', {
        method: 'POST',
        body: JSON.stringify({ trade, context }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) {
        const msg = await safeResponseText(res)
        throw new Error(msg || `Replay failed (${res.status})`)
      }
      await readStream(res, setAnalysis)
    } catch (e) {
      if ((e as Error).name !== 'AbortError')
        setReplayErr(e instanceof Error ? e.message : 'Failed to load analysis')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Trade list */}
      <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-2">
          <BookOpen size={12} className="text-white/30" />
          <span className="text-xs text-white/30 uppercase tracking-widest font-medium">Recent Trades — click to replay</span>
        </div>
        <div className="overflow-y-auto max-h-[520px] divide-y divide-white/[0.03]">
          {recent.map(t => {
            const isActive = selected?.id === t.id
            const q        = isActive && quality ? quality : null
            return (
              <button key={t.id} onClick={() => replay(t)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-white/[0.03] ${isActive ? 'bg-violet-500/10' : ''}`}>
                <div className={`w-1 h-8 rounded-full shrink-0 ${t.pnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{t.symbol}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${t.direction === 'long' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                      {t.direction === 'long' ? 'BUY' : 'SELL'}
                    </span>
                    {q && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${gradeBg(q.grade)} ${gradeColor(q.grade)}`}>
                        {q.grade} · {q.score}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-white/25 mt-0.5">
                    {format(new Date(t.entry_time), 'MMM d, HH:mm')} UTC · {t.quantity} @ {t.entry_price.toFixed(2)}
                  </div>
                </div>
                <span className={`text-sm font-bold tabular-nums shrink-0 ${pnlClass(t.pnl)}`}>{fmt(t.pnl, 4)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Analysis panel */}
      <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-2">
          <RotateCcw size={12} className="text-violet-400" />
          <span className="text-xs text-white/30 uppercase tracking-widest font-medium">AI Trade Replay</span>
          {loading && <Loader2 size={11} className="animate-spin text-white/25 ml-auto" />}
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          {!selected && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-16">
              <RotateCcw size={28} className="text-white/10" />
              <p className="text-sm text-white/20">Select any trade to get an AI explanation of what happened and how to improve.</p>
            </div>
          )}

          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Symbol',    value: selected.symbol },
                  { label: 'Direction', value: selected.direction.toUpperCase() },
                  { label: 'P&L',       value: fmt(selected.pnl, 4) + ' USDT', cls: pnlClass(selected.pnl) },
                  { label: 'Price',     value: selected.entry_price.toFixed(4) },
                  { label: 'Size',      value: String(selected.quantity) },
                  { label: 'Date',      value: format(new Date(selected.entry_time), 'MMM d') },
                ].map(s => (
                  <div key={s.label} className="bg-[#080a0f] rounded-lg px-3 py-2">
                    <div className="text-[10px] text-white/25 mb-0.5">{s.label}</div>
                    <div className={`text-xs font-semibold ${(s as { cls?: string }).cls ?? 'text-white'}`}>{s.value}</div>
                  </div>
                ))}
              </div>

              {quality && (
                <div className={`border rounded-xl p-3 ${gradeBg(quality.grade)}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Target size={12} className={gradeColor(quality.grade)} />
                    <span className={`text-xs font-bold ${gradeColor(quality.grade)}`}>
                      Trade Quality: {quality.grade} · {quality.score}/100
                    </span>
                  </div>
                  <div className="space-y-1">
                    {quality.factors.map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]">
                        <span className={f.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}>{f.delta >= 0 ? '+' : ''}{f.delta}</span>
                        <span className="text-white/50">{f.label}:</span>
                        <span className="text-white/40">{f.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {replayErr && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {replayErr}
                </div>
              )}

              {(analysis || loading) && !replayErr && (
                <div className="space-y-2">
                  <div className="text-[10px] text-white/25 uppercase tracking-widest">AI Analysis</div>
                  {loading && !analysis && (
                    <div className="flex items-center gap-2 text-xs text-white/30">
                      <Loader2 size={12} className="animate-spin" /> Generating analysis…
                    </div>
                  )}
                  {analysis && (
                    <div className="space-y-2 text-sm leading-relaxed text-white/70">
                      {analysis.split('\n').filter(l => l.trim()).map((line, i) => {
                        const isBold  = line.startsWith('**')
                        const cleaned = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/^[-•]\s*/, '').trim()
                        return isBold
                          ? <p key={i} className="text-white font-semibold text-xs mt-3">{cleaned}</p>
                          : <p key={i} className="text-white/60 text-xs">{cleaned}</p>
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Copilot component ─────────────────────────────────────────────────────

type CopilotTab = 'risk' | 'session' | 'discipline' | 'goals' | 'replay'

const COPILOT_TABS: { key: CopilotTab; label: string; icon: React.ReactNode }[] = [
  { key: 'risk',        label: 'Risk',          icon: <Shield size={12} />    },
  { key: 'session',     label: 'Session',       icon: <Clock size={12} />     },
  { key: 'discipline',  label: 'Discipline',    icon: <Activity size={12} />  },
  { key: 'goals',       label: 'Goals',         icon: <Flag size={12} />      },
  { key: 'replay',      label: 'Trade Replay',  icon: <RotateCcw size={12} /> },
]

interface CopilotProps {
  trades: Trade[]
  stats: ExtendedDashboardStats
  symbolStats?: unknown
}

export function Copilot({ trades, stats }: CopilotProps) {
  const [tab,       setTab]       = useState<CopilotTab>('risk')
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const warnings       = useMemo(() => computeWarnings(trades), [trades])
  const activeWarnings = warnings.filter(w => !dismissed.has(w.id))
  const dismiss        = (id: string) => setDismissed(prev => new Set([...prev, id]))
  const hasTrades      = trades.length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <Brain size={15} className="text-violet-400" />
        </div>
        <div>
          <div className="text-sm font-semibold text-white">AI Trading Copilot</div>
          <div className="text-xs text-white/30">Real-time behavioral intelligence · {trades.length} fills analyzed</div>
        </div>
        {activeWarnings.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20">
            <AlertTriangle size={11} className="text-red-400" />
            <span className="text-xs text-red-400 font-semibold">{activeWarnings.length} active alert{activeWarnings.length > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {activeWarnings.length > 0 && (
        <div className="space-y-2">
          {activeWarnings.map(w => <WarningCard key={w.id} w={w} onDismiss={() => dismiss(w.id)} />)}
        </div>
      )}

      {activeWarnings.length === 0 && hasTrades && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/[0.07] border border-emerald-500/20 rounded-xl">
          <Zap size={13} className="text-emerald-400" />
          <span className="text-xs text-emerald-300/80">No behavioral warnings right now — your trading patterns look disciplined.</span>
        </div>
      )}

      {!hasTrades && (
        <div className="text-center py-12 text-white/20 text-sm">Sync fills from Delta Exchange to activate the copilot.</div>
      )}

      {hasTrades && (
        <>
          <div className="flex items-center gap-1 border-b border-white/[0.06] -mb-1 overflow-x-auto">
            {COPILOT_TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                  tab === t.key
                    ? 'border-violet-500 text-violet-300'
                    : 'border-transparent text-white/35 hover:text-white/60'
                }`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          <div className="pt-1">
            {tab === 'risk'       && <RiskTab       trades={trades} />}
            {tab === 'session'    && <SessionTab    trades={trades} />}
            {tab === 'discipline' && <DisciplineTab trades={trades} />}
            {tab === 'goals'      && <GoalsTab      trades={trades} />}
            {tab === 'replay'     && <ReplayTab     trades={trades} stats={stats} />}
          </div>
        </>
      )}
    </div>
  )
}
