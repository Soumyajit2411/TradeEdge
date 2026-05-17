import { Trade } from '@/types'

export type BiasType = 'revenge_trading' | 'fomo' | 'hesitation' | 'emotional_exit' | 'inconsistent_execution'

export interface BiasInstance {
  tradeId: string
  symbol: string
  reason: string
  severity: 1 | 2 | 3
  entryTime: string
}

export interface BiasSummary {
  type: BiasType
  label: string
  color: string
  description: string
  instances: BiasInstance[]
  score: number // 0–100 (higher = more severe)
  severity: 'none' | 'low' | 'medium' | 'high'
}

export interface SymbolBiasReport {
  symbol: string
  totalTrades: number
  biases: BiasSummary[]
  healthScore: number // 0–100 (higher = healthier)
}

export interface GlobalBiasReport {
  biases: BiasSummary[]
  symbolReports: SymbolBiasReport[]
  overallHealthScore: number
}

const BIAS_META: Record<BiasType, { label: string; description: string; color: string }> = {
  revenge_trading: {
    label: 'Revenge Trading',
    description: 'Re-entering too quickly after a loss, often with larger size to recover losses immediately',
    color: 'red',
  },
  fomo: {
    label: 'FOMO',
    description: 'Rapid clusters of entries on the same coin suggesting excitement or fear of missing a move',
    color: 'orange',
  },
  hesitation: {
    label: 'Hesitation',
    description: 'Winners closed far below your typical average win — cutting profits too early out of fear',
    color: 'yellow',
  },
  emotional_exit: {
    label: 'Emotional Exits',
    description: 'Closed a losing position then immediately re-entered same direction at profit — premature exit',
    color: 'purple',
  },
  inconsistent_execution: {
    label: 'Inconsistent Execution',
    description: 'Highly variable position sizes on the same instrument — no consistent risk framework',
    color: 'blue',
  },
}

export function groupBySymbol(trades: Trade[]): Map<string, Trade[]> {
  const map = new Map<string, Trade[]>()
  for (const t of trades) {
    if (!map.has(t.symbol)) map.set(t.symbol, [])
    map.get(t.symbol)!.push(t)
  }
  return map
}

function byTime(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => a.entry_time.localeCompare(b.entry_time))
}

function minsBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60000
}

function scoreFromCount(n: number): number {
  if (n === 0) return 0
  if (n <= 2) return 20 + n * 5
  if (n <= 5) return 40 + (n - 2) * 6
  if (n <= 10) return 58 + (n - 5) * 4
  return Math.min(96, 78 + (n - 10) * 1.5)
}

function toSeverity(score: number): 'none' | 'low' | 'medium' | 'high' {
  if (score === 0) return 'none'
  if (score < 30) return 'low'
  if (score < 60) return 'medium'
  return 'high'
}

function detectRevengeTrades(trades: Trade[]): BiasInstance[] {
  const instances: BiasInstance[] = []
  for (const [symbol, ts] of groupBySymbol(trades)) {
    const sorted = byTime(ts)
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      if (prev.pnl >= 0) continue
      const mins = minsBetween(prev.exit_time, curr.entry_time)
      if (mins >= 0 && mins <= 30) {
        const sizeRatio = prev.quantity > 0 ? curr.quantity / prev.quantity : 1
        const severity: 1 | 2 | 3 = mins < 5 ? 3 : mins < 15 ? 2 : 1
        instances.push({
          tradeId: curr.id,
          symbol,
          reason: `Re-entered ${mins.toFixed(0)}m after a ${prev.pnl.toFixed(2)} USDT loss${sizeRatio > 1.3 ? `, ${sizeRatio.toFixed(1)}× larger size` : ''}`,
          severity,
          entryTime: curr.entry_time,
        })
      }
    }
  }
  return instances
}

function detectFOMO(trades: Trade[]): BiasInstance[] {
  const instances: BiasInstance[] = []
  for (const [symbol, ts] of groupBySymbol(trades)) {
    const sorted = byTime(ts)
    let i = 2
    while (i < sorted.length) {
      const span = minsBetween(sorted[i - 2].entry_time, sorted[i].entry_time)
      if (span >= 0 && span <= 45) {
        const severity: 1 | 2 | 3 = span < 10 ? 3 : span < 25 ? 2 : 1
        instances.push({
          tradeId: sorted[i].id,
          symbol,
          reason: `3 fills on ${symbol} within ${span.toFixed(0)}m — overtrading cluster`,
          severity,
          entryTime: sorted[i].entry_time,
        })
        i += 3
      } else {
        i++
      }
    }
  }
  return instances
}

function detectHesitation(trades: Trade[]): BiasInstance[] {
  const instances: BiasInstance[] = []
  for (const [symbol, ts] of groupBySymbol(trades)) {
    const wins = ts.filter(t => t.pnl > 0 && t.pnl_percent > 0)
    if (wins.length < 4) continue
    const avgWinPct = wins.reduce((s, t) => s + t.pnl_percent, 0) / wins.length
    const threshold = avgWinPct * 0.25
    for (const t of wins) {
      if (t.pnl_percent < threshold) {
        const severity: 1 | 2 | 3 = t.pnl_percent < threshold / 2 ? 3 : 2
        instances.push({
          tradeId: t.id,
          symbol,
          reason: `Took ${t.pnl_percent.toFixed(2)}% vs avg win ${avgWinPct.toFixed(2)}% — exited too early`,
          severity,
          entryTime: t.entry_time,
        })
      }
    }
  }
  return instances
}

function detectEmotionalExits(trades: Trade[]): BiasInstance[] {
  const instances: BiasInstance[] = []
  for (const [symbol, ts] of groupBySymbol(trades)) {
    const sorted = byTime(ts)
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      if (prev.pnl >= 0) continue
      const mins = minsBetween(prev.exit_time, curr.entry_time)
      if (mins >= 0 && mins <= 30 && prev.direction === curr.direction && curr.pnl > 0) {
        const severity: 1 | 2 | 3 = mins < 5 ? 3 : mins < 15 ? 2 : 1
        instances.push({
          tradeId: prev.id,
          symbol,
          reason: `Exited ${prev.direction} at ${prev.pnl.toFixed(2)} USDT loss, re-entered same direction ${mins.toFixed(0)}m later at profit — premature exit`,
          severity,
          entryTime: prev.entry_time,
        })
      }
    }
  }
  return instances
}

function detectInconsistentExecution(trades: Trade[]): BiasInstance[] {
  const instances: BiasInstance[] = []
  for (const [symbol, ts] of groupBySymbol(trades)) {
    if (ts.length < 5) continue
    const quantities = ts.map(t => t.quantity)
    const mean = quantities.reduce((s, q) => s + q, 0) / quantities.length
    if (mean === 0) continue
    const variance = quantities.reduce((s, q) => s + Math.pow(q - mean, 2), 0) / quantities.length
    const cv = Math.sqrt(variance) / mean
    if (cv < 0.5) continue
    const outliers = ts
      .filter(t => t.quantity > mean * 1.8 || t.quantity < mean * 0.4)
      .slice(0, 4)
    for (const t of outliers) {
      const ratio = t.quantity / mean
      const severity: 1 | 2 | 3 = cv > 1.0 ? 3 : cv > 0.75 ? 2 : 1
      instances.push({
        tradeId: t.id,
        symbol,
        reason: `Size ${ratio.toFixed(1)}× avg (CV ${cv.toFixed(2)}) — inconsistent risk per trade`,
        severity,
        entryTime: t.entry_time,
      })
    }
  }
  return instances
}

function makeSummary(type: BiasType, instances: BiasInstance[]): BiasSummary {
  const meta = BIAS_META[type]
  const score = scoreFromCount(instances.length)
  return {
    type,
    label: meta.label,
    color: meta.color,
    description: meta.description,
    instances,
    score,
    severity: toSeverity(score),
  }
}

export function analyzeAllBiases(trades: Trade[]): GlobalBiasReport {
  const closed = trades.filter(t => t.pnl !== 0)

  const revenge = detectRevengeTrades(closed)
  const fomo = detectFOMO(trades)
  const hesitation = detectHesitation(closed)
  const emotional = detectEmotionalExits(closed)
  const inconsistent = detectInconsistentExecution(trades)

  const biases: BiasSummary[] = [
    makeSummary('revenge_trading', revenge),
    makeSummary('fomo', fomo),
    makeSummary('hesitation', hesitation),
    makeSummary('emotional_exit', emotional),
    makeSummary('inconsistent_execution', inconsistent),
  ]

  const overallHealthScore = Math.max(
    0,
    Math.round(100 - biases.reduce((s, b) => s + b.score, 0) / biases.length),
  )

  const symbols = [...new Set(trades.map(t => t.symbol))]
  const symbolReports: SymbolBiasReport[] = symbols
    .map(symbol => {
      const symbolBiases: BiasSummary[] = [
        makeSummary('revenge_trading', revenge.filter(i => i.symbol === symbol)),
        makeSummary('fomo', fomo.filter(i => i.symbol === symbol)),
        makeSummary('hesitation', hesitation.filter(i => i.symbol === symbol)),
        makeSummary('emotional_exit', emotional.filter(i => i.symbol === symbol)),
        makeSummary('inconsistent_execution', inconsistent.filter(i => i.symbol === symbol)),
      ]
      const healthScore = Math.max(
        0,
        Math.round(100 - symbolBiases.reduce((s, b) => s + b.score, 0) / symbolBiases.length),
      )
      return {
        symbol,
        totalTrades: trades.filter(t => t.symbol === symbol).length,
        biases: symbolBiases,
        healthScore,
      }
    })
    .sort((a, b) => a.healthScore - b.healthScore)

  return { biases, symbolReports, overallHealthScore }
}
