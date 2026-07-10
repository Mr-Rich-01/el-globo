import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Standalone output para Docker multi-stage (reduz imagem final)
  output: 'standalone',

  // Compressão e otimizações para VPS com recursos limitados
  compress: true,

  // Logging de erros em produção
  logging: {
    fetches: { fullUrl: process.env.NODE_ENV === 'development' },
  },

  // Headers de segurança
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // SSE — desativar buffering no Nginx
      {
        source: '/api/kds/stream',
        headers: [
          { key: 'X-Accel-Buffering', value: 'no' },
          { key: 'Cache-Control', value: 'no-cache, no-transform' },
        ],
      },
    ]
  },

  // PWA: manifesto e service worker (leve — sem next-pwa para reduzir bundle)
  async rewrites() {
    return []
  },
}

export default nextConfig

