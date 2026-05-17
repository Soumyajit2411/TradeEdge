'use client'
import { useEffect, useMemo, useState } from 'react'
import { authFetchJson, friendlyApiError } from '@/lib/api'
import { IMPACT_THRESHOLDS, NEWS_LIMIT } from '@/constants/news'
import { AlertCircle, Newspaper, Loader2 } from 'lucide-react'

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
}

function impactClass(score: number): string {
  if (score >= IMPACT_THRESHOLDS.high) return 'text-red-300 bg-red-500/10 border-red-500/30'
  if (score >= IMPACT_THRESHOLDS.medium) return 'text-amber-300 bg-amber-500/10 border-amber-500/30'
  return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
}

export function MarketNews() {
  const [items,   setItems]   = useState<NewsItem[]>([])
  const [asOf,    setAsOf]    = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

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
    return () => { alive = false }
  }, [])

  const topItems = useMemo(() => items.slice(0, NEWS_LIMIT), [items])

  if (loading) {
    return (
      <div className="h-56 flex items-center justify-center text-white/30 text-sm gap-2">
        <Loader2 size={14} className="animate-spin" />
        Loading market news…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#0f1117] border border-white/[0.06] rounded-xl p-4 flex items-start gap-2.5">
        <Newspaper size={15} className="text-violet-400 mt-0.5 shrink-0" />
        <div>
          <div className="text-sm font-semibold text-white">Tomorrow Impact News</div>
          <div className="text-xs text-white/35">
            Headlines ranked by estimated impact on the next trading session.
            {asOf && ` As of ${new Date(asOf).toLocaleString()}`}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-red-300 font-medium">News fetch failed</p>
            <p className="text-xs text-red-300/70 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {topItems.map((item, idx) => (
          <a
            key={`${item.url}-${idx}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-[#0f1117] border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.15] transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-medium text-white/90 leading-relaxed">{item.title}</h3>
              <span className={`text-[11px] px-2 py-1 rounded-full border shrink-0 ${impactClass(item.impact_score)}`}>
                Impact {item.impact_score}
              </span>
            </div>

            <p className="text-xs text-white/45 mt-2">{item.impact_reason}</p>

            {item.impacted_coins?.length > 0 && (
              <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                {item.impacted_coins.map(coin => (
                  <span
                    key={coin.asset}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-300 font-medium"
                  >
                    {coin.asset}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-white/35">{item.source}</span>
              {item.published_at && (
                <span className="text-[11px] text-white/25">
                  · {new Date(item.published_at).toLocaleString()}
                </span>
              )}
              {item.market_tags.map(tag => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/40 uppercase">
                  {tag}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>

      {topItems.length === 0 && !error && (
        <div className="text-center py-12 text-white/25 text-sm">
          No high-impact news items found right now.
        </div>
      )}
    </div>
  )
}
