'use client'
import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import { HourStats, DayStats } from '@/types'

const tickStyle = { fill: 'rgba(255,255,255,0.2)', fontSize: 11 }

const tooltipStyle = {
  contentStyle: { background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 },
}

function barColor(pnl: number) {
  return pnl >= 0 ? '#34d399' : '#f87171'
}

interface Props {
  hourStats: HourStats[]
  dayStats: DayStats[]
}

export function TimeAnalysis({ hourStats, dayStats }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const activeHours = hourStats.filter(h => h.trades > 0)

  if (!mounted) return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {[0, 1].map(i => (
        <div key={i} className="bg-[#0f1117] border border-white/[0.07] rounded-xl p-4">
          <div className="text-xs text-white/40 uppercase tracking-widest font-medium mb-4">Loading…</div>
          <div className="h-40 bg-white/[0.02] rounded animate-pulse" />
        </div>
      ))}
    </div>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Hour of day */}
      <div className="bg-[#0f1117] border border-white/[0.07] rounded-xl p-4">
        <div className="text-xs text-white/40 uppercase tracking-widest font-medium mb-4">
          P&L by hour (UTC) — {activeHours.length} active hours
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourStats} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ ...tickStyle, fontSize: 9 }} axisLine={false} tickLine={false}
                interval={2} tickFormatter={v => v.slice(0, 2)} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} width={36}
                tickFormatter={v => `${Number(v) >= 0 ? '' : ''}${Number(v).toFixed(0)}`} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
              <Tooltip
                {...tooltipStyle}
                formatter={(v, _name, props) => {
                  const n = Number(v)
                  const h = props?.payload as HourStats
                  return [`${n >= 0 ? '+' : ''}${n.toFixed(4)} USDT (${h?.trades ?? 0} fills)`, 'PnL']
                }}
              />
              <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                {hourStats.map((h, i) => (
                  <Cell key={i} fill={barColor(h.pnl)} fillOpacity={h.trades > 0 ? 0.8 : 0.15} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Day of week */}
      <div className="bg-[#0f1117] border border-white/[0.07] rounded-xl p-4">
        <div className="text-xs text-white/40 uppercase tracking-widest font-medium mb-4">P&L by day of week (UTC)</div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dayStats} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} width={44}
                tickFormatter={v => `${Number(v).toFixed(0)}`} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
              <Tooltip
                {...tooltipStyle}
                formatter={(v, _name, props) => {
                  const n = Number(v)
                  const d = props?.payload as DayStats
                  return [`${n >= 0 ? '+' : ''}${n.toFixed(4)} USDT (${d?.trades ?? 0} fills)`, 'PnL']
                }}
              />
              <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                {dayStats.map((d, i) => (
                  <Cell key={i} fill={barColor(d.pnl)} fillOpacity={d.trades > 0 ? 0.8 : 0.15} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
