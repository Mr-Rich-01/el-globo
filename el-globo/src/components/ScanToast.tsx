'use client'

import { useCallback, useRef, useState } from 'react'

// Toast breve para feedback do leitor de código de barras:
// verde ao adicionar, vermelho quando o produto está esgotado / não existe.

export interface ScanMsg { tipo: 'ok' | 'erro'; texto: string }

// Hook que gere a mensagem e o auto-desaparecimento.
export function useScanToast(duracaoMs = 3000) {
  const [msg, setMsg] = useState<ScanMsg | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notificar = useCallback((tipo: ScanMsg['tipo'], texto: string) => {
    setMsg({ tipo, texto })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), duracaoMs)
  }, [duracaoMs])

  return { msg, notificar }
}

export function ScanToast({ msg }: { msg: ScanMsg | null }) {
  if (!msg) return null
  const erro = msg.tipo === 'erro'
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 300, display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 20px', borderRadius: '10px', fontSize: '15px', fontWeight: 700,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        background: erro ? 'var(--color-danger)' : 'var(--color-success)',
        color: '#fff',
      }}
    >
      <span style={{ fontSize: '20px' }}>{erro ? '⛔' : '✓'}</span>
      <span>{msg.texto}</span>
    </div>
  )
}
