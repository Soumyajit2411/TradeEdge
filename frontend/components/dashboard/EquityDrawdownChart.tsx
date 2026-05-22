'use client'
import { useState, useEffect } from 'react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { format } from 'date-fns'
import { DrawdownPoint } from '@/types'

interface Props {
  data: DrawdownPoint[]
}

const tickStyle = { fill: 'rgba(255,255,255,0.2)', fontSize: 11 }

function dateLabel(v: string) {
  try {
    return format(new Date(v), 'MMM d')
  } catch {
    return v
  }
}

export function EquityDrawdownChart({ data }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!data.length) return null
  if (!mounted)
    return (
      <div className="bg-[#0f1117] border border-white/[0.07] rounded-xl p-4">
        <div className="text-xs text-white/40 uppercase tracking-widest font-medium mb-4">
          Equity curve & drawdown
        </div>
        <div className="h-44 bg-white/[0.02] rounded animate-pulse" />
        <div className="h-24 bg-white/[0.02] rounded animate-pulse mt-1" />
      </div>
    )

  const isPositive = data[data.length - 1].equity >= 0
  const equityColor = isPositive ? '#34d399' : '#f87171'

  return (
    <div className="bg-[#0f1117] border border-white/[0.07] rounded-xl p-4 space-y-1">
      <div className="text-xs text-white/40 uppercase tracking-widest font-medium mb-4">
        Equity curve & drawdown
      </div>

      {/* Equity */}
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={equityColor} stopOpacity={0.2} />
                <stop offset="95%" stopColor={equityColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={dateLabel}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(0)}`}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
            <Tooltip
              contentStyle={{
                background: '#1a1d27',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => format(new Date(v as string), 'MMM d, yyyy')}
              formatter={(v) => {
                const n = Number(v)
                return [`${n >= 0 ? '+' : ''}${n.toFixed(4)} USDT`, 'Equity']
              }}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke={equityColor}
              strokeWidth={2}
              fill="url(#eqGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Drawdown */}
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 4, left: 4, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tickFormatter={dateLabel}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
            <Tooltip
              contentStyle={{
                background: '#1a1d27',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => format(new Date(v as string), 'MMM d, yyyy')}
              formatter={(v) => [`${Number(v).toFixed(2)}%`, 'Drawdown']}
            />
            <Bar dataKey="drawdown" fill="#f87171" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
