'use client'
import { ExtendedDashboardStats } from '@/types'
import { fmtSigned as fmt } from '@/lib/fmt'
import { TrendingUp, TrendingDown, Target, Zap, Shield, Activity, DollarSign, Award } from 'lucide-react'

function StatCard({
  label, value, sub, valueColor, icon: Icon, iconColor, danger,
}: {
  label: string
  value: string
  sub?: string
  valueColor?: string
  icon: React.ElementType
  iconColor: string
  danger?: boolean
}) {
  return (
    <div className={`bg-[#0f1117] border rounded-xl p-4 ${danger ? 'border-red-500/20' : 'border-white/[0.07]'}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-white/40 uppercase tracking-widest font-medium">{label}</span>
        <Icon size={14} className={iconColor} />
      </div>
      <div className={`text-xl font-bold tabular-nums ${valueColor ?? 'text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-white/30 mt-1">{sub}</div>}
    </div>
  )
}

export function StatsCards({ stats }: { stats: ExtendedDashboardStats }) {
  const pf = isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard
        label="Total P&L"
        value={`${fmt(stats.totalPnl, 2)} USDT`}
        sub={`${stats.closedTrades} closed · ${stats.totalTrades} fills`}
        valueColor={stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
        icon={stats.totalPnl >= 0 ? TrendingUp : TrendingDown}
        iconColor={stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
      />
      <StatCard
        label="Win Rate"
        value={`${stats.winRate.toFixed(1)}%`}
        sub={`PF ${pf} · R:R ${stats.avgWinLossRatio.toFixed(2)}x`}
        valueColor={stats.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}
        icon={Target}
        iconColor="text-violet-400"
      />
      <StatCard
        label="Avg Win / Loss"
        value={`+${stats.avgWin.toFixed(2)}`}
        sub={`Avg loss −${stats.avgLoss.toFixed(2)}`}
        valueColor="text-emerald-400"
        icon={Award}
        iconColor="text-emerald-400"
      />
      <StatCard
        label="Max Drawdown"
        value={`${stats.maxDrawdown.toFixed(1)}%`}
        sub={`Worst day ${stats.worstDay.toFixed(2)}`}
        valueColor={stats.maxDrawdown < -10 ? 'text-red-400' : stats.maxDrawdown < -5 ? 'text-amber-400' : 'text-white/70'}
        icon={Shield}
        iconColor="text-amber-400"
        danger={stats.maxDrawdown < -10}
      />
      <StatCard
        label="Sharpe Ratio"
        value={stats.sharpeRatio.toFixed(2)}
        sub={`Best day +${stats.bestDay.toFixed(2)}`}
        valueColor={stats.sharpeRatio > 1 ? 'text-emerald-400' : stats.sharpeRatio > 0 ? 'text-amber-400' : 'text-red-400'}
        icon={Activity}
        iconColor="text-sky-400"
      />
      <StatCard
        label="Commission"
        value={`${stats.totalCommission.toFixed(2)} USDT`}
        sub={`${stats.totalPnl !== 0 ? Math.abs((stats.totalCommission / (stats.totalPnl + stats.totalCommission)) * 100).toFixed(1) : 0}% of gross`}
        valueColor="text-white/60"
        icon={DollarSign}
        iconColor="text-white/30"
      />
    </div>
  )
}

export function BiasAlert({ biases }: { biases: string[] }) {
  if (!biases.length) return null
  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Zap size={14} className="text-amber-400" />
        <span className="text-xs text-amber-400 font-semibold uppercase tracking-widest">Pattern detected</span>
      </div>
      <ul className="space-y-1">
        {biases.map((b, i) => (
          <li key={i} className="text-sm text-amber-200/80">• {b}</li>
        ))}
      </ul>
    </div>
  )
}

export function StreakBadge({ streak }: { stats: ExtendedDashboardStats; streak: ExtendedDashboardStats['streak'] }) {
  if (streak.currentType === 'none') return null
  const isWin = streak.currentType === 'win'
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
      isWin ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
    }`}>
      {isWin ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {streak.currentStreak} {isWin ? 'win' : 'loss'} streak · Max W{streak.maxWinStreak} / L{streak.maxLossStreak}
    </div>
  )
}
