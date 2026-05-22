export type TradeDirection = 'long' | 'short'
export type TradeEmotion = 'confident' | 'fomo' | 'revenge' | 'uncertain' | 'patient' | 'greedy'
export type TradeSetup =
  | 'breakout'
  | 'pullback'
  | 'reversal'
  | 'momentum'
  | 'news'
  | 'scalp'
  | 'other'

export interface Trade {
  id: string
  user_id: string
  symbol: string
  direction: TradeDirection
  entry_price: number
  exit_price: number
  quantity: number
  entry_time: string
  exit_time: string
  pnl: number
  pnl_percent: number
  setup: TradeSetup
  emotion: TradeEmotion
  notes: string
  tags: string[]
  created_at: string
  commission?: number
}

export interface DashboardStats {
  totalTrades: number
  closedTrades: number
  winRate: number
  totalPnl: number
  avgWin: number
  avgLoss: number
  bestTrade: number
  worstTrade: number
  profitFactor: number
}

export interface ExtendedDashboardStats extends DashboardStats {
  maxDrawdown: number
  sharpeRatio: number
  totalCommission: number
  avgWinLossRatio: number
  bestDay: number
  worstDay: number
  streak: StreakInfo
}

export interface SymbolStats {
  symbol: string
  totalTrades: number
  closedTrades: number
  winTrades: number
  lossTrades: number
  winRate: number
  totalPnl: number
  avgPnl: number
  bestTrade: number
  worstTrade: number
  profitFactor: number
  grossWin: number
  grossLoss: number
  totalCommission: number
  avgWinLossRatio: number
}

export interface DrawdownPoint {
  date: string
  equity: number
  drawdown: number
}

export interface HourStats {
  hour: number
  label: string
  pnl: number
  trades: number
  wins: number
}

export interface DayStats {
  day: number
  label: string
  pnl: number
  trades: number
  wins: number
}

export interface StreakInfo {
  currentStreak: number
  currentType: 'win' | 'loss' | 'none'
  maxWinStreak: number
  maxLossStreak: number
}

export interface LiveTicker {
  symbol: string
  mark_price: number
  spot_price: number
  open: number
  close: number
  change_24h: number
  volume_24h: number
  turnover_24h: number
  contract_type?: string
  underlying_asset_symbol?: string
  quote_asset_symbol?: string
}
