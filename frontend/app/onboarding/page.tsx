'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart2,
  Key,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'
import { authFetchJson } from '@/lib/api'
import { getCredentialsStatus } from '@/lib/user-service'
import { Footer } from '@/components/layout/Footer'

const STEPS = [
  'Log in to Delta Exchange India at india.delta.exchange',
  'Go to Profile → API Keys',
  'Click "Create API Key"',
  'Set permissions to Read Only (no Trading, no Withdrawal)',
  'Copy the API Key and API Secret shown — you only see the secret once',
]

export default function OnboardingPage() {
  const router = useRouter()
  const redirectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [showSec, setShowSec] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(
    () => () => {
      if (redirectRef.current) clearTimeout(redirectRef.current)
    },
    []
  )

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        if (!alive) return
        const hasCredentials = await getCredentialsStatus()
        if (hasCredentials) {
          router.replace('/dashboard')
        }
      } catch {
        // Ignore status-check failures; user can still submit credentials.
      }
    })()
    return () => {
      alive = false
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await authFetchJson('/api/users/credentials', {
        method: 'POST',
        body: JSON.stringify({ api_key: apiKey.trim(), api_secret: apiSecret.trim() }),
      })
      setSuccess(true)
      redirectRef.current = setTimeout(() => router.replace('/dashboard'), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials')
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = () => router.replace('/dashboard')

  if (success) {
    return (
      <div className="min-h-screen bg-[#080a0f] flex flex-col items-center justify-center px-4">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5">
          <CheckCircle size={26} className="text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">Connected!</h2>
        <p className="text-sm text-white/40">Redirecting to your dashboard…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#080a0f] flex flex-col">
      <div className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <BarChart2 size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">TradeEdge</span>
          </div>

          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/20 rounded-full px-3 py-1 text-xs text-violet-300 mb-4">
              <span>Step 2 of 2</span>
              <ChevronRight size={10} />
              <span>Connect Exchange</span>
            </div>
            <h1 className="text-2xl font-bold mb-2">Connect Delta Exchange India</h1>
            <p className="text-sm text-white/40 leading-relaxed max-w-xl">
              Add a <strong className="text-white/70">read-only</strong> API key so TradeEdge can
              analyze your fills. We can never place orders, access funds, or make withdrawals on
              your behalf.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Instructions */}
            <div className="bg-white/[0.02] border border-white/[0.07] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck size={16} className="text-emerald-400" />
                <h3 className="text-sm font-semibold">How to get your read-only API key</h3>
              </div>
              <ol className="space-y-3">
                {STEPS.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-[10px] font-bold text-white/50 shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-xs text-white/50 leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
              <a
                href="https://india.delta.exchange"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                Open Delta Exchange India <ExternalLink size={11} />
              </a>

              <div className="mt-4 bg-amber-500/5 border border-amber-500/15 rounded-xl p-3">
                <p className="text-xs text-amber-400/80 leading-relaxed">
                  <strong>Important:</strong> Only enable &quot;Read&quot; permission. Never enable
                  Trading or Withdrawal.
                </p>
              </div>
            </div>

            {/* Form */}
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Key size={15} className="text-violet-400" />
                <h3 className="text-sm font-semibold">Enter your credentials</h3>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                  <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-white/40 mb-1.5 font-medium">API Key</label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      required
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 pr-10 text-sm text-white font-mono placeholder-white/20 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all"
                      placeholder="Paste your API key"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50"
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1.5 font-medium">
                    API Secret
                  </label>
                  <div className="relative">
                    <input
                      type={showSec ? 'text' : 'password'}
                      required
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 pr-10 text-sm text-white font-mono placeholder-white/20 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all"
                      placeholder="Paste your API secret"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSec(!showSec)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50"
                    >
                      {showSec ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Verifying &amp; connecting…
                    </>
                  ) : (
                    <>
                      Verify &amp; connect <ChevronRight size={14} />
                    </>
                  )}
                </button>
              </form>

              <button
                onClick={handleSkip}
                className="w-full mt-3 text-xs text-white/25 hover:text-white/45 transition-colors py-2"
              >
                Skip for now — I&apos;ll add this later
              </button>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}
