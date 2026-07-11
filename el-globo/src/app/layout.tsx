import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { RegistarSW } from '@/components/RegistarSW'
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
  icons: {
    icon: '/icons/favicon-32.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'EL Globo',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0f1e',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt" className={inter.variable}>
      <body className={inter.className}>
        <RegistarSW />
        {children}
      </body>
    </html>
  )
}
