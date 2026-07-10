'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Liga-se ao stream SSE e alerta o empregado de mesa quando a cozinha
// marca um pedido como PRONTO. Também refresca os dados do ecrã atual
// (mapa de mesas / comanda) quando há alterações de pedidos.

interface Alerta {
  id: string
  texto: string
}

// apenasGarconId: nos tablets dos garçons, cada um só recebe o alerta
// dos pedidos que ele próprio lançou.
export function ProntoAlert({ apenasGarconId }: { apenasGarconId?: string } = {}) {
  const router = useRouter()
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const es = new EventSource('/api/kds/stream')

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)

        if (data.tipo === 'PEDIDO_PRONTO') {
          const p = data.pedido
          const meu = !apenasGarconId || p.garconId === apenasGarconId
          if (meu) {
            const origem = p.mesa
              ? `Mesa ${p.mesa.numero}`
              : p.aba
                ? `Aba ${p.aba.identificador}`
                : (p.identificadorCliente ?? 'Balcão')
            // origemPreparo diz que secção terminou (Cozinha ou Bar);
            // sem ela é o pedido inteiro que ficou pronto.
            const detalhe = data.origemPreparo === 'BAR'
              ? '🍹 bebidas prontas no bar!'
              : data.origemPreparo === 'COZINHA'
                ? '🍽️ comida pronta na cozinha!'
                : 'pedido pronto para entregar!'
            const alerta: Alerta = { id: p.id + Date.now(), texto: `${origem} — ${detalhe}` }
            setAlertas(prev => [...prev, alerta])
            // Toast desaparece sozinho após 8s
            setTimeout(() => setAlertas(prev => prev.filter(a => a.id !== alerta.id)), 8000)
          }
        }

        // Qualquer alteração de pedidos → refrescar dados do servidor
        // (com debounce para não martelar o router em rajadas)
        if (['NOVO_PEDIDO', 'ATUALIZAR_PEDIDO', 'PEDIDO_PRONTO', 'REMOVER_PEDIDO'].includes(data.tipo)) {
          if (refreshTimer.current) clearTimeout(refreshTimer.current)
          refreshTimer.current = setTimeout(() => router.refresh(), 800)
        }
      } catch { /* ignore */ }
    }

    return () => {
      es.close()
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [router, apenasGarconId])

  if (alertas.length === 0) return null

  return (
    <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 200, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {alertas.map(a => (
        <div key={a.id} className="toast-pronto" style={{ position: 'static' }}>
          <span style={{ fontSize: '22px' }}>🔔</span>
          <span>{a.texto}</span>
        </div>
      ))}
    </div>
  )
}
