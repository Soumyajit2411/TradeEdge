import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TradeEdge — AI Trading Journal',
  description:
    'The AI-powered journal that learns from your behavioral patterns and helps you trade with discipline.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className="bg-[#080a0f] text-white antialiased"
        style={{ fontFamily: 'system-ui, sans-serif' }}
      >
        {children}
      </body>
    </html>
  )
}
