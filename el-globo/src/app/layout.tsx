import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'EL Globo — Sistema de Gestão',
  description: 'Sistema de Gestão Integrado para Restaurante, Bottlestore e Piscina',
  manifest: '/manifest.json',
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt" className={inter.variable}>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
