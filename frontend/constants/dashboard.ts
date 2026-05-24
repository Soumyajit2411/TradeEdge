export type DashboardTab = 'overview' | 'coins' | 'ai' | 'copilot' | 'news'

export const DASHBOARD_TABS: { key: DashboardTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'coins', label: 'Coins' },
  { key: 'ai', label: 'AI Insights' },
  { key: 'copilot', label: 'Copilot' },
  { key: 'news', label: 'Market News' },
]

export const FILL_POLL_INTERVAL_MS = 30_000
export const TICKER_POLL_INTERVAL_MS = 30_000

export const DASHBOARD_MESSAGES = {
  onboardingIncompleteTitle: 'Onboarding incomplete',
  onboardingIncompleteBody:
    'Personal trading data stays empty until you connect your Delta Exchange read-only API key.',
  completeOnboardingCta: 'Complete onboarding',
  deltaErrorTitle: 'Delta Exchange error',
  loadingFills: 'Loading fills from Delta Exchange India…',
  streamDisconnected: 'Realtime channel disconnected. Falling back to snapshot data.',
} as const
