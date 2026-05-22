'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BarChart2, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { getCredentialsStatus, checkBackendHealth } from '@/lib/user-service'
import { SYSTEM_MESSAGES } from '@/constants/system'
import { Footer } from '@/components/layout/Footer'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    // Health check — only proceed if backend is reachable and healthy.
    try {
      const healthy = await checkBackendHealth()
      if (!healthy) throw new Error('unhealthy')
    } catch {
      setError(SYSTEM_MESSAGES.serversTemporarilyDown)
      setLoading(false)
      return
    }

    try {
      const hasCredentials = await getCredentialsStatus()
      router.replace(hasCredentials ? '/dashboard' : '/onboarding')
    } catch {
      router.replace('/onboarding')
    }
  }

  return (
    <div className="min-h-screen bg-[#080a0f] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex items-center gap-2.5 justify-center mb-8">
            <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center">
              <BarChart2 size={16} className="text-white" />
            </div>
            <span className="font-bold text-base tracking-tight">TradeEdge</span>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8">
            <h1 className="text-xl font-bold mb-1">Welcome back</h1>
            <p className="text-sm text-white/40 mb-6">Sign in to your account</p>

            {error && (
              <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-5">
                <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs text-white/40 mb-1.5 font-medium">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5 font-medium">Password</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
                  >
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
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
                    <Loader2 size={15} className="animate-spin" /> Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-white/30 mt-5">
            Don&apos;t have an account?&nbsp;
            <Link
              href="/signup"
              className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
            >
              Sign up
            </Link>
          </p>
          <p className="text-center mt-3">
            <Link href="/" className="text-xs text-white/20 hover:text-white/40 transition-colors">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  )
}
