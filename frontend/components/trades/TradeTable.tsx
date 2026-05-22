'use client'
import { Trade } from '@/types'
import { format } from 'date-fns'

export function TradeTable({ trades }: { trades: Trade[] }) {
  if (!trades.length) {
    return (
      <div className="bg-[#0f1117] border border-white/[0.07] rounded-xl p-12 text-center">
        <div className="text-white/20 text-sm">
          No fills yet. Sync from Delta Exchange or add a trade manually.
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#0f1117] border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="text-xs text-white/40 uppercase tracking-widest font-medium px-4 py-3 border-b border-white/[0.07]">
        Fill log — {trades.length} fills
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-white/30 text-xs border-b border-white/[0.05]">
              {['Symbol', 'Side', 'Fill Price', 'Qty', 'Realized P&L', 'Details', 'Date'].map(
                (h) => (
                  <th key={h} className="px-4 py-2 text-left font-medium">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr
                key={t.id}
                className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
              >
                <td className="px-4 py-3 font-semibold text-white">{t.symbol}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${t.direction === 'long' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}
                  >
                    {t.direction === 'long' ? 'BUY' : 'SELL'}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/70 tabular-nums">{t.entry_price.toFixed(2)}</td>
                <td className="px-4 py-3 text-white/50 tabular-nums">{t.quantity}</td>
                <td
                  className={`px-4 py-3 font-semibold tabular-nums ${t.pnl > 0 ? 'text-emerald-400' : t.pnl < 0 ? 'text-red-400' : 'text-white/30'}`}
                >
                  {t.pnl === 0 ? (
                    <span className="text-white/20">—</span>
                  ) : (
                    <>
                      {t.pnl > 0 ? '+' : ''}
                      {t.pnl.toFixed(4)}
                    </>
                  )}
                </td>
                <td className="px-4 py-3 text-white/30 text-xs">{t.notes}</td>
                <td className="px-4 py-3 text-white/30 text-xs whitespace-nowrap">
                  {format(new Date(t.entry_time), 'MMM d, HH:mm')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
