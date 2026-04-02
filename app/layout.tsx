import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Reagent — Talent Poaching',
  description: 'Autonomous candidate discovery engine powered by Google Dorking + AI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ backgroundColor: '#F9FAFB', color: '#111827' }} className="antialiased">{children}</body>
    </html>
  )
}
