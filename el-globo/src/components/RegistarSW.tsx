'use client'

import { useEffect } from 'react'

// Regista o service worker (public/sw.js) apenas em produção —
// em dev o SW atrapalharia o HMR e mascararia alterações a assets.
export function RegistarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sem SW a app continua 100% funcional — falha silenciosa.
    })
  }, [])

  return null
}
