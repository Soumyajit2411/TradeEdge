import type { BiasType } from './bias-analysis'

export const BIAS_COLORS: Record<BiasType, { bg: string; border: string; text: string; dot: string; bar: string }> = {
  revenge_trading:        { bg: 'bg-red-500/10',    border: 'border-red-500/25',    text: 'text-red-400',    dot: 'bg-red-500',    bar: 'bg-red-500'    },
  fomo:                   { bg: 'bg-orange-500/10', border: 'border-orange-500/25', text: 'text-orange-400', dot: 'bg-orange-400', bar: 'bg-orange-500' },
  hesitation:             { bg: 'bg-yellow-500/10', border: 'border-yellow-500/25', text: 'text-yellow-400', dot: 'bg-yellow-400', bar: 'bg-yellow-500' },
  emotional_exit:         { bg: 'bg-violet-500/10', border: 'border-violet-500/25', text: 'text-violet-400', dot: 'bg-violet-500', bar: 'bg-violet-500' },
  inconsistent_execution: { bg: 'bg-sky-500/10',    border: 'border-sky-500/25',    text: 'text-sky-400',    dot: 'bg-sky-400',   bar: 'bg-sky-500'    },
} as const

export const SEVERITY_LABEL: Record<'none' | 'low' | 'medium' | 'high', string> = {
  none: 'Clean', low: 'Mild', medium: 'Notable', high: 'Severe',
}
