'use client'
import { useEffect, useMemo, useState } from 'react'
import { authFetchJson, friendlyApiError } from '@/lib/api'
import { IMPACT_THRESHOLDS, NEWS_LIMIT } from '@/constants/news'
import { AlertCircle, ExternalLink, Loader2, Sparkles, Newspaper } from 'lucide-react'

interface ImpactedCoin {
  asset: string
  symbol: string
}

interface NewsItem {
  title: string
  url: string
  source: string
  published_at: string | null
  impact_score: number
  impact_reason: string
  market_tags: string[]
  impacted_coins: ImpactedCoin[]
}

interface NewsResponse {
  as_of: string
  count: number
  items: NewsItem[]
  powered_by?: string
}

function impactClass(score: number): string {
  if (score >= IMPACT_THRESHOLDS.high) return 'text-red-300 bg-red-500/10 border-red-500/30'
  if (score >= IMPACT_THRESHOLDS.medium) return 'text-amber-300 bg-amber-500/10 border-amber-500/30'
  return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
}

function impactLabel(score: number): string {
  if (score >= IMPACT_THRESHOLDS.high) return 'High Impact'
  if (score >= IMPACT_THRESHOLDS.medium) return 'Medium Impact'
  return 'Low Impact'
}

function RelativeTime({ iso }: { iso: string | null }) {
  if (!iso) return null
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    const hours = Math.floor(diff / 3_600_000)
    const label =
      mins < 60 ? `${mins}m ago` : hours < 24 ? `${hours}h ago` : new Date(iso).toLocaleDateString()
    return <span className="text-[11px] text-white/25">· {label}</span>
  } catch {
    return null
  }
}

function NewsCard({ item }: { item: NewsItem }) {
  const hasUrl = Boolean(item.url)
  const Wrapper = hasUrl ? 'a' : 'div'
  const linkProps = hasUrl ? { href: item.url, target: '_blank', rel: 'noopener noreferrer' } : {}

  return (
    <Wrapper
      {...linkProps}
      className={`block bg-[#0f1117] border border-white/[0.06] rounded-xl p-4 transition-colors ${
        hasUrl ? 'hover:border-white/[0.15] cursor-pointer' : ''
      }`}
    >
      {/* Title + impact badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <h3 className="text-sm font-medium text-white/90 leading-relaxed">{item.title}</h3>
          {hasUrl && <ExternalLink size={12} className="text-white/20 mt-1 shrink-0" />}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${impactClass(item.impact_score)}`}
          >
            {impactLabel(item.impact_score)}
          </span>
          <span
            className={`text-[10px] tabular-nums ${impactClass(item.impact_score).split(' ')[0]}`}
          >
            {item.impact_score}/100
          </span>
        </div>
      </div>

      {/* Impact reason */}
      {item.impact_reason && (
        <p className="text-xs text-white/45 mt-2 leading-relaxed">{item.impact_reason}</p>
      )}

      {/* Impacted coins */}
      {item.impacted_coins?.length > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
          {item.impacted_coins.map((coin) => (
            <span
              key={coin.asset}
              className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-300 font-medium"
            >
              {coin.asset}
            </span>
          ))}
        </div>
      )}

      {/* Footer: source · time · tags */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-white/35">{item.source}</span>
        <RelativeTime iso={item.published_at} />
        {item.market_tags.map((tag) => (
          <span
            key={tag}
            className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/40 uppercase tracking-wide"
          >
            {tag}
          </span>
        ))}
      </div>
    </Wrapper>
  )
}

export function MarketNews() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [asOf, setAsOf] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const payload = await authFetchJson<NewsResponse>('/api/news/tomorrow-impact')
        if (!alive) return
        setItems(Array.isArray(payload.items) ? payload.items : [])
        setAsOf(payload.as_of ?? null)
      } catch (e) {
        if (alive) setError(friendlyApiError(e, 'Failed to load news'))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const topItems = useMemo(() => items.slice(0, NEWS_LIMIT), [items])

  if (loading) {
    return (
      <div className="h-56 flex flex-col items-center justify-center gap-3 text-white/30 text-sm">
        <Loader2 size={18} className="animate-spin text-violet-400" />
        <span>Fetching AI market intelligence…</span>
        <span className="text-xs text-white/20">Gemini is searching live news for your coins</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Newspaper size={15} className="text-violet-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-white">Market Intelligence</div>
            <div className="text-xs text-white/35">
              AI-curated headlines ranked by impact on your Delta Exchange India positions.
              {asOf && ` Updated ${new Date(asOf).toLocaleTimeString()}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 bg-violet-500/10 border border-violet-500/20 rounded-full px-2.5 py-1">
          <Sparkles size={10} className="text-violet-400" />
          <span className="text-[10px] text-violet-300 font-medium">Gemini</span>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-red-300 font-medium">News fetch failed</p>
            <p className="text-xs text-red-300/70 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* News cards */}
      <div className="space-y-3">
        {topItems.map((item, idx) => (
          <NewsCard key={`${item.url || item.title}-${idx}`} item={item} />
        ))}
      </div>

      {/* Empty state */}
      {topItems.length === 0 && !error && (
        <div className="text-center py-12 text-white/25 text-sm">
          No market-moving news found right now.
        </div>
      )}
    </div>
  )
}
