'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BarChart2, Eye, EyeOff, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Footer } from '@/components/layout/Footer'

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    setError(null)

    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${location.origin}/onboarding` },
    })

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    // If email confirmation is disabled in Supabase, session is created immediately.
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session) {
      router.replace('/onboarding')
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#080a0f] flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-sm text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={24} className="text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold mb-2">Check your email</h1>
            <p className="text-sm text-white/40 leading-relaxed">
              We sent a confirmation link to <span className="text-white/70">{email}</span>. Click
              it to activate your account and connect your Delta Exchange keys.
            </p>
            <p className="mt-5">
              <Link href="/login" className="text-sm text-violet-400 hover:text-violet-300">
                Back to log in
              </Link>
            </p>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#080a0f] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5 justify-center mb-8">
            <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center">
              <BarChart2 size={16} className="text-white" />
            </div>
            <span className="font-bold text-base tracking-tight">TradeEdge</span>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8">
            <h1 className="text-xl font-bold mb-1">Create an account</h1>
            <p className="text-sm text-white/40 mb-6">Start your free trading journal</p>

            {error && (
              <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-5">
                <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            <form onSubmit={handleSignup} className="space-y-4">
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
                <label className="block text-xs text-white/40 mb-1.5 font-medium">
                  Password <span className="text-white/20 font-normal">(min 8 chars)</span>
                </label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
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
                    <Loader2 size={15} className="animate-spin" /> Creating account…
                  </>
                ) : (
                  'Create account'
                )}
              </button>
            </form>

            <p className="text-[11px] text-white/20 text-center mt-4 leading-relaxed">
              By signing up you agree to our Terms of Service. We only request read-only access to
              your Delta Exchange data.
            </p>
          </div>

          <p className="text-center text-sm text-white/30 mt-5">
            Already have an account?&nbsp;
            <Link
              href="/login"
              className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
            >
              Log in
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
