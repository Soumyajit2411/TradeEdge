'use client'
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { LiveTicker, Trade } from '@/types'
import { authFetch, authFetchJson, fetchJson, friendlyApiError, backendUrl } from '@/lib/api'
import { createClient } from '@/lib/supabase'
import {
  calcExtendedStats, calcDrawdown, calcSymbolStats,
  calcHourStats, calcDayStats, detectBiases,
} from '@/lib/stats'
import { analyzeAllBiases } from '@/lib/bias-analysis'
import type { GlobalBiasReport } from '@/lib/bias-analysis'
import {
  DASHBOARD_MESSAGES,
  DASHBOARD_TABS,
  DashboardTab,
  FILL_POLL_INTERVAL_MS,
  TICKER_POLL_INTERVAL_MS,
} from '@/constants/dashboard'
import { getCredentialsStatus } from '@/lib/user-service'
import { StatsCards, BiasAlert, StreakBadge } from '@/components/dashboard/StatsCards'
import { EquityDrawdownChart } from '@/components/dashboard/EquityDrawdownChart'
import { TimeAnalysis } from '@/components/dashboard/TimeAnalysis'
import { CoinGrid } from '@/components/dashboard/CoinGrid'
import { AiInsights } from '@/components/dashboard/AiInsights'
import { Copilot } from '@/components/dashboard/Copilot'
import { MarketNews } from '@/components/dashboard/MarketNews'
import { TradeTable } from '@/components/trades/TradeTable'
import { Footer } from '@/components/layout/Footer'
import { BarChart2, AlertCircle, LogOut, Settings, ChevronDown, User } from 'lucide-react'

export default function Dashboard() {
  const router   = useRouter()
  const supabase = createClient()

  const [trades,      setTrades]      = useState<Trade[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [tab,         setTab]         = useState<DashboardTab>('overview')
  const [liveTickers, setLiveTickers] = useState<LiveTicker[]>([])
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError,   setLiveError]   = useState<string | null>(null)
  const [userEmail,    setUserEmail]    = useState<string | null>(null)
  const [profileOpen,  setProfileOpen]  = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const [credentialsChecked, setCredentialsChecked] = useState(false)
  const [hasCredentials, setHasCredentials] = useState(false)

  const firstFillsLoadRef = useRef(true)
  const knownFillIdsRef   = useRef<Set<string> | null>(null)

  // Load user email for the header
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (data.user) setUserEmail(data.user.email ?? null)
    })()
  }, [])

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Check whether the user completed onboarding (saved Delta API credentials).
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        if (!alive) return
        const has = await getCredentialsStatus()
        setHasCredentials(has)
      } catch {
        if (alive) setHasCredentials(false)
      } finally {
        if (alive) setCredentialsChecked(true)
      }
    })()
    return () => { alive = false }
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const notifyLoss = useCallback((trade: Trade, allTrades: Trade[]) => {
    const recentSymbolLosses = allTrades
      .filter(t => t.symbol === trade.symbol && t.pnl < 0)
      .sort((a, b) => b.entry_time.localeCompare(a.entry_time))
      .slice(0, 5)

    authFetch('/api/notify/trade-loss', {
      method: 'POST',
      body: JSON.stringify({ trade, context: { recentSymbolLosses } }),
    }).catch(() => {})
  }, [])

  const fetchFills = useCallback(async () => {
    if (!hasCredentials) {
      setTrades([])
      setLoading(false)
      setError(null)
      return
    }

    if (firstFillsLoadRef.current) setLoading(true)
    setError(null)
    try {
      const data = await authFetchJson<Trade[]>('/api/delta/fills')

      if (knownFillIdsRef.current !== null) {
        const newLosses = data.filter(t => t.pnl < 0 && !knownFillIdsRef.current!.has(t.id))
        newLosses.forEach(t => notifyLoss(t, data))
      }
      knownFillIdsRef.current = new Set(data.map(t => t.id))
      setTrades(data)
    } catch (e) {
      setError(friendlyApiError(e, 'Failed to load fills'))
    } finally {
      setLoading(false)
      firstFillsLoadRef.current = false
    }
  }, [notifyLoss, hasCredentials])

  useEffect(() => {
    if (!credentialsChecked || !hasCredentials) {
      setLoading(false)
      return
    }
    fetchFills()
    const id = window.setInterval(fetchFills, FILL_POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [fetchFills, credentialsChecked, hasCredentials])

  const fetchLiveTickers = useCallback(async () => {
    setLiveLoading(true)
    setLiveError(null)
    try {
      const data = await fetchJson<LiveTicker[]>('/api/delta/tickers')
      setLiveTickers(data)
    } catch (e) {
      setLiveError(friendlyApiError(e, 'Failed to load live prices'))
    } finally {
      setLiveLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLiveTickers()
    const id = window.setInterval(fetchLiveTickers, TICKER_POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [fetchLiveTickers])

  useEffect(() => {
    const stream = new EventSource(backendUrl('/api/delta/tickers/stream'))
    stream.onmessage = (event) => {
      try {
        const rows = JSON.parse(event.data) as LiveTicker[]
        if (Array.isArray(rows)) {
          setLiveTickers(rows)
          setLiveLoading(false)
          setLiveError(null)
        }
      } catch { /* ignore malformed frames */ }
    }
    stream.onerror = () => {
      setLiveError(DASHBOARD_MESSAGES.streamDisconnected)
    }
    return () => stream.close()
  }, [])

  const stats        = useMemo(() => calcExtendedStats(trades), [trades])
  const drawdownData = useMemo(() => calcDrawdown(trades), [trades])
  const symbolStats  = useMemo(() => calcSymbolStats(trades), [trades])
  const hourStats    = useMemo(() => calcHourStats(trades), [trades])
  const dayStats     = useMemo(() => calcDayStats(trades), [trades])
  const biases       = useMemo(() => detectBiases(trades), [trades])
  const biasReport   = useMemo<GlobalBiasReport>(() => analyzeAllBiases(trades), [trades])

  return (
    <div className="min-h-screen bg-[#080a0f] text-white flex flex-col">
      <header className="border-b border-white/[0.07] px-6 py-4 sticky top-0 z-20 bg-[#080a0f]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <BarChart2 size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">TradeEdge</span>
            <span className="text-xs text-white/20 ml-0.5">Delta Exchange</span>
          </div>

          <nav className="flex items-center gap-1">
            {DASHBOARD_TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.key
                    ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                    : 'text-white/40 hover:text-white/70'
                }`}>
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {/* Profile avatar + dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(o => !o)}
                className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-xl hover:bg-white/[0.06] transition-colors group"
              >
                {/* Avatar circle with initial */}
                <div className="w-7 h-7 rounded-full bg-violet-600/30 border border-violet-500/40 flex items-center justify-center text-[11px] font-bold text-violet-300 uppercase select-none">
                  {userEmail ? userEmail[0] : <User size={12} />}
                </div>
                <ChevronDown size={12} className={`text-white/30 transition-transform group-hover:text-white/50 ${profileOpen ? 'rotate-180' : ''}`} />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-[#0f1117] border border-white/[0.1] rounded-xl shadow-xl shadow-black/40 z-50 overflow-hidden">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-white/[0.07]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-violet-600/30 border border-violet-500/40 flex items-center justify-center text-xs font-bold text-violet-300 uppercase shrink-0">
                        {userEmail ? userEmail[0] : '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white/80 truncate">{userEmail ?? 'Trader'}</p>
                        <p className="text-[10px] text-white/30 mt-0.5">Delta Exchange India</p>
                      </div>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div className="py-1">
                    <button
                      onClick={() => { setProfileOpen(false); router.push('/onboarding') }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-white/55 hover:text-white hover:bg-white/[0.05] transition-colors text-left"
                    >
                      <Settings size={13} />
                      API Key Settings
                    </button>
                    <div className="border-t border-white/[0.06] my-1" />
                    <button
                      onClick={() => { setProfileOpen(false); handleSignOut() }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/[0.06] transition-colors text-left"
                    >
                      <LogOut size={13} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-6 w-full">
        {credentialsChecked && !hasCredentials && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-amber-300 font-medium">{DASHBOARD_MESSAGES.onboardingIncompleteTitle}</p>
              <p className="text-xs text-amber-300/70 mt-0.5">
                {DASHBOARD_MESSAGES.onboardingIncompleteBody}
              </p>
            </div>
            <button
              onClick={() => router.push('/onboarding')}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-xs text-amber-200 hover:bg-amber-500/25 transition-colors shrink-0"
            >
              {DASHBOARD_MESSAGES.completeOnboardingCta}
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
            <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-red-300 font-medium">{DASHBOARD_MESSAGES.deltaErrorTitle}</p>
              <p className="text-xs text-red-300/70 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {!credentialsChecked || loading ? (
          <div className="flex items-center justify-center h-64 text-white/25 text-sm">
            {DASHBOARD_MESSAGES.loadingFills}
          </div>
        ) : (
          <>
            {tab === 'overview' && (
              <div className="space-y-4">
                {biases.length > 0 && <BiasAlert biases={biases} />}
                <div className="flex items-center justify-between">
                  <div />
                  <StreakBadge stats={stats} streak={stats.streak} />
                </div>
                <StatsCards stats={stats} />
                <EquityDrawdownChart data={drawdownData} />
                <TimeAnalysis hourStats={hourStats} dayStats={dayStats} />
                <div>
                  <div className="text-xs text-white/25 uppercase tracking-widest font-medium mb-2">Recent fills</div>
                  <TradeTable trades={[...trades].sort((a, b) => b.entry_time.localeCompare(a.entry_time)).slice(0, 50)} />
                </div>
              </div>
            )}

            {tab === 'coins' && (
              <div className="space-y-4">
                <CoinGrid
                  symbolStats={symbolStats}
                  trades={trades}
                  liveTickers={liveTickers}
                  liveLoading={liveLoading}
                  liveError={liveError}
                  biasReport={biasReport}
                />
              </div>
            )}

            {tab === 'ai' && (
              <AiInsights
                stats={stats}
                symbolStats={symbolStats}
                hourStats={hourStats}
                trades={trades}
                biasReport={biasReport}
              />
            )}

            {tab === 'copilot' && (
              <Copilot
                trades={trades}
                stats={stats}
                symbolStats={symbolStats}
              />
            )}

            {tab === 'news' && (
              <MarketNews />
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}
