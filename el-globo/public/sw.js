// Service worker leve do EL Globo (sem next-pwa — ver next.config.ts).
// Estratégia: só assets imutáveis são cacheados; páginas e /api vão SEMPRE
// à rede (ERP — dados têm de estar frescos). Sem app-shell offline para
// nunca servir HTML velho com sessão expirada.
const CACHE = 'elglobo-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Cache-first: assets com hash no nome (imutáveis) e ícones.
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE)
    cache.put(request, response.clone())
  }
  return response
}

// Stale-while-revalidate: fotos de produtos (mudam raramente; se mudarem,
// a versão nova chega no load seguinte).
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)
  return cached ?? network
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return // network-only, nunca cachear

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request))
    return
  }
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }
  // Páginas e restantes pedidos: não intercetar (rede normal).
})
