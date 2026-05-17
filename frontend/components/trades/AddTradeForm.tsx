'use client'
import { useState } from 'react'
import { Trade, TradeDirection, TradeEmotion, TradeSetup } from '@/types'

type TradeInsert = Omit<Trade, 'id' | 'user_id' | 'created_at' | 'pnl' | 'pnl_percent'>
import { calcPnl } from '@/lib/stats'
import { X } from 'lucide-react'

interface Props {
  onAdd: (trade: TradeInsert) => void
  onClose: () => void
}

const defaultForm: TradeInsert = {
  symbol: '',
  direction: 'long',
  entry_price: 0,
  exit_price: 0,
  quantity: 1,
  entry_time: new Date().toISOString().slice(0, 16),
  exit_time: new Date().toISOString().slice(0, 16),
  setup: 'breakout',
  emotion: 'confident',
  notes: '',
  tags: [],
}

export function AddTradeForm({ onAdd, onClose }: Props) {
  const [form, setForm] = useState(defaultForm)

  const preview = calcPnl(form.direction, form.entry_price, form.exit_price, form.quantity)

  function set(k: keyof TradeInsert, v: string | number) {
    setForm((prev: TradeInsert) => ({ ...prev, [k]: v }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.symbol || !form.entry_price || !form.exit_price) return
    onAdd({ ...form, ...preview })
    onClose()
  }

  const inputCls = "w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50 transition-colors"
  const labelCls = "block text-xs text-white/40 uppercase tracking-widest mb-1.5"

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1117] border border-white/10 rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <h2 className="text-sm font-semibold text-white">Add trade</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Symbol</label>
              <input className={inputCls} placeholder="AAPL" value={form.symbol}
                onChange={e => set('symbol', e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className={labelCls}>Direction</label>
              <select className={inputCls} value={form.direction}
                onChange={e => set('direction', e.target.value as TradeDirection)}>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Entry $</label>
              <input type="number" step="0.01" className={inputCls} placeholder="0.00"
                onChange={e => set('entry_price', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelCls}>Exit $</label>
              <input type="number" step="0.01" className={inputCls} placeholder="0.00"
                onChange={e => set('exit_price', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelCls}>Qty</label>
              <input type="number" className={inputCls} placeholder="1"
                onChange={e => set('quantity', parseFloat(e.target.value) || 1)} />
            </div>
          </div>

          {form.entry_price > 0 && form.exit_price > 0 && (
            <div className={`text-center py-2 rounded-lg text-sm font-semibold tabular-nums ${preview.pnl >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {preview.pnl >= 0 ? '+' : ''}${preview.pnl.toFixed(2)} ({preview.pnl_percent.toFixed(2)}%)
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Entry time</label>
              <input type="datetime-local" className={inputCls} value={form.entry_time}
                onChange={e => set('entry_time', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Exit time</label>
              <input type="datetime-local" className={inputCls} value={form.exit_time}
                onChange={e => set('exit_time', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Setup</label>
              <select className={inputCls} value={form.setup}
                onChange={e => set('setup', e.target.value as TradeSetup)}>
                {['breakout','pullback','reversal','momentum','news','scalp','other'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Emotion</label>
              <select className={inputCls} value={form.emotion}
                onChange={e => set('emotion', e.target.value as TradeEmotion)}>
                {['confident','patient','uncertain','fomo','revenge','greedy'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea className={`${inputCls} resize-none`} rows={2} placeholder="What was your thesis? What went wrong?"
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          <button type="submit"
            className="w-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
            Save trade
          </button>
        </form>
      </div>
    </div>
  )
}
