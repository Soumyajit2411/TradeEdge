'use client'
import Link from 'next/link'
import {
  BarChart2, Brain, Shield, Clock, TrendingUp, Zap, Activity,
  ArrowRight, CheckCircle, ChevronRight, Sparkles, Rocket, Star,
} from 'lucide-react'
import { Footer } from '@/components/layout/Footer'

const FEATURES = [
  {
    icon: Brain,
    title: 'Behavioral Bias Detection',
    desc: 'Automatically identifies revenge trading, FOMO, hesitation, emotional exits, and inconsistent position sizing — in real time.',
    color: 'from-violet-500/20 to-violet-500/5',
    border: 'border-violet-500/20',
  },
  {
    icon: Zap,
    title: 'AI Trade Copilot',
    desc: 'Active warnings before you make costly mistakes. Detects overtrading windows, drawdown spikes, and size escalation in the moment.',
    color: 'from-amber-500/20 to-amber-500/5',
    border: 'border-amber-500/20',
  },
  {
    icon: Activity,
    title: 'Trade Replay & Coaching',
    desc: 'Replay any completed trade with AI coaching on decision quality, context awareness, and one key takeaway for next time.',
    color: 'from-blue-500/20 to-blue-500/5',
    border: 'border-blue-500/20',
  },
  {
    icon: Clock,
    title: 'Session Intelligence',
    desc: 'Know exactly which hours you trade best — and which to avoid. Backed by your own historical fill data, not generic advice.',
    color: 'from-emerald-500/20 to-emerald-500/5',
    border: 'border-emerald-500/20',
  },
  {
    icon: Shield,
    title: 'Live Risk Monitoring',
    desc: 'Consecutive loss alerts, concentration risk flags, and session drawdown warnings so you never blow up an account silently.',
    color: 'from-red-500/20 to-red-500/5',
    border: 'border-red-500/20',
  },
  {
    icon: TrendingUp,
    title: 'Automated AI Reports',
    desc: 'Daily morning market digest + instant loss analysis emails with specific, actionable AI coaching every time you take a hit.',
    color: 'from-pink-500/20 to-pink-500/5',
    border: 'border-pink-500/20',
  },
]

const STEPS = [
  {
    step: '01',
    title: 'Create your account',
    desc: 'Sign up in seconds with your email. No credit card required.',
  },
  {
    step: '02',
    title: 'Connect Delta Exchange',
    desc: 'Add a read-only API key from Delta Exchange India. We never touch your funds — view-only access only.',
  },
  {
    step: '03',
    title: 'Get insights instantly',
    desc: 'Your last 365 days of fills are analyzed automatically. Behavioral biases, best hours, and risk warnings — live.',
  },
]

const PROBLEMS = [
  'You revenge-trade after losses but only realize it in hindsight',
  'You have no idea which hours actually make you money',
  'You can\'t tell if a losing streak is variance or a pattern',
  'You journal trades manually but never act on the insights',
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#080a0f] flex flex-col">
      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className="border-b border-white/[0.06] sticky top-0 z-30 bg-[#080a0f]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <BarChart2 size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">TradeEdge</span>
            <span className="hidden sm:block text-xs text-white/20 ml-0.5">Delta Exchange</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/markets"
              className="text-sm text-white/50 hover:text-white/80 transition-colors px-3 py-1.5">
              Live markets
            </Link>
            <a href="#pricing"
              className="text-sm text-white/50 hover:text-white/80 transition-colors px-3 py-1.5">
              Pricing
            </a>
            <Link href="/login"
              className="text-sm text-white/50 hover:text-white/80 transition-colors px-3 py-1.5">
              Log in
            </Link>
            <Link href="/signup"
              className="text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg transition-colors">
              Get started free
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ────────────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-6 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-4 py-1.5 mb-8">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-xs text-violet-300 font-medium">Live with Delta Exchange India</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-6 leading-[1.08]">
            Your trades tell a story.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-blue-400">
              Most traders never read it.
            </span>
          </h1>

          <p className="text-lg text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
            TradeEdge connects to your Delta Exchange India account, analyzes every fill for behavioral
            patterns, and gives you real-time AI coaching to trade with discipline — not emotion.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/markets"
              className="inline-flex items-center justify-center gap-2 text-white/60 hover:text-white/85 font-medium px-7 py-3.5 rounded-xl border border-white/10 hover:border-white/20 transition-all text-sm">
              View live market feed <ChevronRight size={14} />
            </Link>
            <Link href="/signup"
              className="inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-medium px-7 py-3.5 rounded-xl transition-colors text-sm">
              Start for free <ArrowRight size={15} />
            </Link>
            <a href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 text-white/50 hover:text-white/80 font-medium px-7 py-3.5 rounded-xl border border-white/10 hover:border-white/20 transition-all text-sm">
              See how it works <ChevronRight size={14} />
            </a>
          </div>
        </section>

        {/* ── Dashboard Preview ───────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-6 pb-20">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
            <div className="bg-white/[0.04] border-b border-white/[0.06] px-5 py-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/40" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/40" />
              <div className="w-3 h-3 rounded-full bg-green-500/40" />
              <div className="mx-auto bg-white/[0.05] rounded-md px-20 py-1 text-xs text-white/20">
                tradeedge.app/dashboard
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 p-5">
              {[
                { label: 'Total PnL', val: '+2,847 USDT', clr: 'text-emerald-400' },
                { label: 'Win Rate', val: '62.4%', clr: 'text-white' },
                { label: 'Profit Factor', val: '1.84×', clr: 'text-white' },
                { label: 'Max Drawdown', val: '−8.3%', clr: 'text-red-400' },
              ].map(s => (
                <div key={s.label} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
                  <p className="text-xs text-white/30 mb-1">{s.label}</p>
                  <p className={`text-lg font-semibold ${s.clr}`}>{s.val}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 px-5 pb-5">
              <div className="col-span-2 bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 h-36 flex flex-col justify-between">
                <p className="text-xs text-white/25 uppercase tracking-widest">Equity curve</p>
                <div className="flex items-end gap-1 h-20">
                  {[30, 45, 35, 60, 50, 70, 65, 80, 75, 90, 85, 95].map((h, i) => (
                    <div key={i} className="flex-1 rounded-sm bg-violet-500/30"
                      style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 h-36 flex flex-col gap-2">
                <p className="text-xs text-white/25 uppercase tracking-widest">Bias alerts</p>
                <div className="space-y-1.5 mt-1">
                  {[
                    { label: 'Revenge trading', score: 72, clr: 'bg-red-500' },
                    { label: 'FOMO entries', score: 45, clr: 'bg-amber-500' },
                    { label: 'Hesitation', score: 22, clr: 'bg-emerald-500' },
                  ].map(b => (
                    <div key={b.label} className="flex items-center gap-2">
                      <span className="text-[10px] text-white/40 w-20 truncate">{b.label}</span>
                      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div className={`h-full ${b.clr} rounded-full`} style={{ width: `${b.score}%` }} />
                      </div>
                      <span className="text-[10px] text-white/30 w-6 text-right">{b.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Problem ─────────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-6 py-16 border-t border-white/[0.05]">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Every loss has a pattern. Most traders never see it.
            </h2>
            <p className="text-white/40 text-base">
              You&apos;re already keeping mental notes. TradeEdge makes them quantitative.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
            {PROBLEMS.map(p => (
              <div key={p} className="flex items-start gap-3 bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-3.5">
                <div className="w-4 h-4 rounded-full border border-red-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500/50" />
                </div>
                <p className="text-sm text-white/55 leading-relaxed">{p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ────────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-6 py-16 border-t border-white/[0.05]">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Everything you need to trade better</h2>
            <p className="text-white/40">Six tools built specifically for Delta Exchange India futures traders.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <div key={f.title}
                className={`bg-gradient-to-br ${f.color} border ${f.border} rounded-2xl p-6 hover:scale-[1.01] transition-transform`}>
                <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center mb-4">
                  <f.icon size={18} className="text-white/70" />
                </div>
                <h3 className="font-semibold text-sm mb-2">{f.title}</h3>
                <p className="text-xs text-white/45 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ────────────────────────────────────────────────────── */}
        <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-16 border-t border-white/[0.05]">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Up and running in 3 minutes</h2>
            <p className="text-white/40">No code. No manual entry. Just connect and get insights.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {STEPS.map((s, i) => (
              <div key={s.step} className="relative">
                {i < STEPS.length - 1 && (
                  <div className="hidden sm:block absolute top-5 left-full w-full h-px bg-white/[0.06] z-0" />
                )}
                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mb-4">
                    <span className="text-xs font-bold text-violet-400">{s.step}</span>
                  </div>
                  <h3 className="font-semibold text-sm mb-2">{s.title}</h3>
                  <p className="text-xs text-white/40 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Trust ───────────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-6 py-12 border-t border-white/[0.05]">
          <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto text-center">
            {[
              { label: 'Read-only API access', desc: 'We never touch your funds, orders, or positions' },
              { label: 'Your data, your privacy', desc: 'Credentials stored securely, never shared' },
              { label: 'No manual entry needed', desc: '365 days of fills synced automatically' },
            ].map(t => (
              <div key={t.label}>
                <CheckCircle size={20} className="text-emerald-400 mx-auto mb-2" />
                <h4 className="text-sm font-medium mb-1">{t.label}</h4>
                <p className="text-xs text-white/35">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pricing ─────────────────────────────────────────────────────────── */}
        <section id="pricing" className="max-w-7xl mx-auto px-6 py-16 border-t border-white/[0.05]">
          <div className="text-center mb-4">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-5">
              <Sparkles size={12} className="text-emerald-400" />
              <span className="text-xs text-emerald-300 font-medium">Launch offer — completely free while we&apos;re in beta</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Simple, transparent pricing</h2>
            <p className="text-white/40 text-sm">No hidden fees. No credit card. Cancel whenever.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-5 max-w-5xl mx-auto mt-10">

            {/* Free / Early Access */}
            <div className="relative bg-gradient-to-br from-violet-600/25 to-violet-600/5 border-2 border-violet-500/40 rounded-2xl p-6 flex flex-col">
              {/* Launch badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-wide uppercase flex items-center gap-1">
                <Rocket size={9} /> Current plan — free
              </div>

              <div className="mt-3 mb-5">
                <p className="text-xs text-white/40 uppercase tracking-widest font-medium mb-1">Early Access</p>
                <div className="flex items-end gap-1.5 mb-2">
                  <span className="text-4xl font-bold">₹0</span>
                  <span className="text-white/35 text-sm mb-1">/ month</span>
                </div>
                <p className="text-xs text-white/40 leading-relaxed">
                  Full access to every feature — free while we&apos;re in beta. No card needed.
                </p>
              </div>

              <ul className="space-y-2.5 flex-1 mb-6">
                {[
                  'All 6 behavioral bias detectors',
                  'AI Trade Copilot (live warnings)',
                  'Trade Replay + AI coaching',
                  'Session & risk intelligence',
                  'Daily market digest emails',
                  'Instant loss analysis alerts',
                  '365-day fill history',
                  'Unlimited Delta API syncs',
                ].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-xs text-white/65">
                    <CheckCircle size={13} className="text-violet-400 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link href="/signup"
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
                Get started free <ArrowRight size={14} />
              </Link>
            </div>

            {/* Pro (coming soon) */}
            <div className="bg-white/[0.025] border border-white/[0.08] rounded-2xl p-6 flex flex-col opacity-70">
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs text-white/40 uppercase tracking-widest font-medium">Pro</p>
                  <span className="text-[10px] bg-white/[0.06] border border-white/[0.1] text-white/40 px-2 py-0.5 rounded-full">Coming soon</span>
                </div>
                <div className="flex items-end gap-1.5 mb-2">
                  <span className="text-4xl font-bold text-white/50">₹999</span>
                  <span className="text-white/25 text-sm mb-1">/ month</span>
                </div>
                <p className="text-xs text-white/30 leading-relaxed">
                  For serious traders who want multi-account support and advanced analytics.
                </p>
              </div>

              <ul className="space-y-2.5 flex-1 mb-6">
                {[
                  'Everything in Early Access',
                  'Multi-account support',
                  'Custom alert thresholds',
                  'Portfolio-level bias analytics',
                  'Priority email support',
                  'Early access to new features',
                ].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-xs text-white/40">
                    <CheckCircle size={13} className="text-white/20 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <button disabled
                className="w-full flex items-center justify-center gap-2 bg-white/[0.05] border border-white/[0.08] text-white/30 font-medium py-3 rounded-xl text-sm cursor-not-allowed">
                Notify me
              </button>
            </div>

            {/* Team (coming soon) */}
            <div className="bg-white/[0.025] border border-white/[0.08] rounded-2xl p-6 flex flex-col opacity-70">
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs text-white/40 uppercase tracking-widest font-medium">Team</p>
                  <span className="text-[10px] bg-white/[0.06] border border-white/[0.1] text-white/40 px-2 py-0.5 rounded-full">Coming soon</span>
                </div>
                <div className="flex items-end gap-1.5 mb-2">
                  <span className="text-4xl font-bold text-white/50">₹2,999</span>
                  <span className="text-white/25 text-sm mb-1">/ month</span>
                </div>
                <p className="text-xs text-white/30 leading-relaxed">
                  For prop firms and trading teams who want group analytics and coaching.
                </p>
              </div>

              <ul className="space-y-2.5 flex-1 mb-6">
                {[
                  'Everything in Pro',
                  'Up to 10 trader seats',
                  'Team-level bias comparison',
                  'Manager dashboard',
                  'Custom branding',
                  'Dedicated support',
                ].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-xs text-white/40">
                    <Star size={12} className="text-white/20 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <button disabled
                className="w-full flex items-center justify-center gap-2 bg-white/[0.05] border border-white/[0.08] text-white/30 font-medium py-3 rounded-xl text-sm cursor-not-allowed">
                Contact us
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-white/20 mt-6">
            Prices in INR. Early Access plan remains free until we publicly announce Pro launch.
            You&apos;ll get 30 days notice before any billing begins.
          </p>
        </section>

        {/* ── Final CTA ───────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-6 py-16 border-t border-white/[0.05]">
          <div className="bg-gradient-to-br from-violet-600/20 to-blue-600/10 border border-violet-500/20 rounded-2xl px-8 py-12 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Stop guessing. Start improving.
            </h2>
            <p className="text-white/45 mb-8 text-sm leading-relaxed">
              Join traders who use behavioral data — not gut feel — to improve their edge.
              Connect your Delta Exchange account in 3 minutes.
            </p>
            <Link href="/signup"
              className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-medium px-8 py-3.5 rounded-xl transition-colors text-sm">
              Create free account <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
