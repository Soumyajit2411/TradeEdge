import {
  Trade, DashboardStats, ExtendedDashboardStats,
  SymbolStats, DrawdownPoint, HourStats, DayStats, StreakInfo,
} from '@/types'
import { groupBySymbol } from './bias-analysis'

function calcStats(trades: Trade[]): DashboardStats {
  const closed = trades.filter(t => t.pnl !== 0)
  if (!trades.length) return {
    totalTrades: 0, closedTrades: 0, winRate: 0, totalPnl: 0,
    avgWin: 0, avgLoss: 0, bestTrade: 0, worstTrade: 0, profitFactor: 0,
  }

  const wins = closed.filter(t => t.pnl > 0)
  const losses = closed.filter(t => t.pnl < 0)
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    totalPnl,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    bestTrade:  closed.length ? closed.reduce((m, t) => t.pnl > m ? t.pnl : m, -Infinity) : 0,
    worstTrade: closed.length ? closed.reduce((m, t) => t.pnl < m ? t.pnl : m,  Infinity) : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
  }
}

export function calcPnl(direction: 'long' | 'short', entry: number, exit: number, qty: number) {
  const raw = direction === 'long' ? (exit - entry) * qty : (entry - exit) * qty
  const pct = direction === 'long' ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100
  return { pnl: parseFloat(raw.toFixed(2)), pnl_percent: parseFloat(pct.toFixed(2)) }
}

export function groupByDate(trades: Trade[]) {
  const map: Record<string, number> = {}
  trades.forEach(t => {
    const date = t.entry_time.slice(0, 10)
    map[date] = (map[date] || 0) + t.pnl
  })
  return Object.entries(map)
    .map(([date, pnl]) => ({ date, pnl: parseFloat(pnl.toFixed(2)) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function detectBiases(trades: Trade[]) {
  const biases: string[] = []
  const revengeCount = trades.filter(t => t.emotion === 'revenge').length
  const fomoCount = trades.filter(t => t.emotion === 'fomo').length
  if (revengeCount >= 2) biases.push(`Revenge trading detected in ${revengeCount} trades`)
  if (fomoCount >= 2) biases.push(`FOMO entries spotted in ${fomoCount} trades`)
  return biases
}

// ----- Extended analytics -----

export function calcDailyPnlMap(trades: Trade[]): { date: string; pnl: number }[] {
  const map: Record<string, number> = {}
  trades.forEach(t => {
    const d = t.entry_time.slice(0, 10)
    map[d] = (map[d] ?? 0) + t.pnl
  })
  return Object.entries(map)
    .map(([date, pnl]) => ({ date, pnl: parseFloat(pnl.toFixed(4)) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function calcDrawdown(trades: Trade[]): DrawdownPoint[] {
  const daily = calcDailyPnlMap(trades)
  let cumulative = 0
  let peak = 0
  return daily.map(d => {
    cumulative += d.pnl
    if (cumulative > peak) peak = cumulative
    const drawdown = peak > 0 ? ((cumulative - peak) / peak) * 100 : 0
    return { date: d.date, equity: parseFloat(cumulative.toFixed(2)), drawdown: parseFloat(drawdown.toFixed(2)) }
  })
}

function calcMaxDrawdown(trades: Trade[]): number {
  const pts = calcDrawdown(trades)
  if (!pts.length) return 0
  return pts.reduce((m, p) => p.drawdown < m ? p.drawdown : m, Infinity)
}

function calcSharpeRatio(trades: Trade[]): number {
  const daily = calcDailyPnlMap(trades)
  if (daily.length < 2) return 0
  const pnls = daily.map(d => d.pnl)
  const mean = pnls.reduce((s, p) => s + p, 0) / pnls.length
  const variance = pnls.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / pnls.length
  const stdDev = Math.sqrt(variance)
  if (stdDev === 0) return 0
  return parseFloat((mean / stdDev * Math.sqrt(365)).toFixed(2))
}

export function calcStreaks(trades: Trade[]): StreakInfo {
  const sorted = [...trades]
    .filter(t => t.pnl !== 0)
    .sort((a, b) => a.entry_time.localeCompare(b.entry_time))
  if (!sorted.length) return { currentStreak: 0, currentType: 'none', maxWinStreak: 0, maxLossStreak: 0 }

  let maxWin = 0, maxLoss = 0, cur = 1
  let curType: 'win' | 'loss' = sorted[0].pnl > 0 ? 'win' : 'loss'

  for (let i = 1; i < sorted.length; i++) {
    const t: 'win' | 'loss' = sorted[i].pnl > 0 ? 'win' : 'loss'
    if (t === curType) {
      cur++
    } else {
      if (curType === 'win') maxWin = Math.max(maxWin, cur)
      else maxLoss = Math.max(maxLoss, cur)
      cur = 1
      curType = t
    }
  }
  if (curType === 'win') maxWin = Math.max(maxWin, cur)
  else maxLoss = Math.max(maxLoss, cur)

  const last = sorted[sorted.length - 1]
  return { currentStreak: cur, currentType: last.pnl > 0 ? 'win' : 'loss', maxWinStreak: maxWin, maxLossStreak: maxLoss }
}

export function calcHourStats(trades: Trade[]): HourStats[] {
  const hours: HourStats[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h, label: `${String(h).padStart(2, '0')}:00`, pnl: 0, trades: 0, wins: 0,
  }))
  trades.forEach(t => {
    const h = new Date(t.entry_time).getUTCHours()
    hours[h].trades++
    hours[h].pnl = parseFloat((hours[h].pnl + t.pnl).toFixed(4))
    if (t.pnl > 0) hours[h].wins++
  })
  return hours
}

export function calcDayStats(trades: Trade[]): DayStats[] {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const days: DayStats[] = labels.map((label, day) => ({ day, label, pnl: 0, trades: 0, wins: 0 }))
  trades.forEach(t => {
    const d = new Date(t.entry_time).getUTCDay()
    days[d].trades++
    days[d].pnl = parseFloat((days[d].pnl + t.pnl).toFixed(4))
    if (t.pnl > 0) days[d].wins++
  })
  return days
}

export function calcSymbolStats(trades: Trade[]): SymbolStats[] {
  const bySymbol = groupBySymbol(trades)

  return Array.from(bySymbol.entries()).map(([symbol, ts]) => {
    const closed = ts.filter(t => t.pnl !== 0)
    const wins = closed.filter(t => t.pnl > 0)
    const losses = closed.filter(t => t.pnl < 0)
    const grossWin = wins.reduce((s, t) => s + t.pnl, 0)
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
    const avgWin = wins.length ? grossWin / wins.length : 0
    const avgLoss = losses.length ? grossLoss / losses.length : 0
    const totalPnl = ts.reduce((s, t) => s + t.pnl, 0)
    const totalCommission = ts.reduce((s, t) => s + (t.commission ?? 0), 0)

    return {
      symbol,
      totalTrades: ts.length,
      closedTrades: closed.length,
      winTrades: wins.length,
      lossTrades: losses.length,
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      totalPnl: parseFloat(totalPnl.toFixed(4)),
      avgPnl: closed.length ? parseFloat((totalPnl / closed.length).toFixed(4)) : 0,
      bestTrade:  closed.length ? closed.reduce((m, t) => t.pnl > m ? t.pnl : m, -Infinity) : 0,
      worstTrade: closed.length ? closed.reduce((m, t) => t.pnl < m ? t.pnl : m,  Infinity) : 0,
      profitFactor: grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? Infinity : 0,
      grossWin: parseFloat(grossWin.toFixed(4)),
      grossLoss: parseFloat(grossLoss.toFixed(4)),
      totalCommission: parseFloat(totalCommission.toFixed(4)),
      avgWinLossRatio: avgLoss > 0 ? parseFloat((avgWin / avgLoss).toFixed(2)) : 0,
    }
  }).sort((a, b) => b.totalPnl - a.totalPnl)
}

export function calcExtendedStats(trades: Trade[]): ExtendedDashboardStats {
  const base = calcStats(trades)
  const daily = calcDailyPnlMap(trades)
  const sortedDaily = [...daily].sort((a, b) => b.pnl - a.pnl)
  const totalCommission = trades.reduce((s, t) => s + (t.commission ?? 0), 0)
  const closed = trades.filter(t => t.pnl !== 0)
  const wins = closed.filter(t => t.pnl > 0)
  const losses = closed.filter(t => t.pnl < 0)
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0)) / losses.length : 0

  return {
    ...base,
    maxDrawdown: calcMaxDrawdown(trades),
    sharpeRatio: calcSharpeRatio(trades),
    totalCommission: parseFloat(totalCommission.toFixed(4)),
    avgWinLossRatio: avgLoss > 0 ? parseFloat((avgWin / avgLoss).toFixed(2)) : 0,
    bestDay: sortedDaily[0]?.pnl ?? 0,
    worstDay: sortedDaily[sortedDaily.length - 1]?.pnl ?? 0,
    streak: calcStreaks(trades),
  }
}
