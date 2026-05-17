/** Format a number with an explicit '+' prefix when non-negative. */
export function fmtSigned(v: number, d = 2): string {
  return (v >= 0 ? '+' : '') + v.toFixed(d)
}
