import { BarChart2, ExternalLink } from 'lucide-react'

export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-white/[0.06] bg-[#080a0f] mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-violet-600 flex items-center justify-center">
            <BarChart2 size={12} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-white/70 tracking-tight">TradeEdge</span>
        </div>

        <p className="text-xs text-white/25 text-center">
          &copy; {year} TradeEdge. All rights reserved.&nbsp;&nbsp;·&nbsp;&nbsp;
          AI-powered trading journal for Delta Exchange India.
        </p>

        <div className="flex items-center gap-4">
          <a href="https://india.delta.exchange" target="_blank" rel="noopener noreferrer"
            className="text-white/25 hover:text-white/50 transition-colors flex items-center gap-1 text-xs">
            <ExternalLink size={11} /> Delta Exchange
          </a>
        </div>
      </div>
    </footer>
  )
}
