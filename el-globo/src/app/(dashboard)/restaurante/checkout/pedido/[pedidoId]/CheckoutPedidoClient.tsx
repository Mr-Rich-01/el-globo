'use client'

import { useRouter } from 'next/navigation'
import { CheckoutPanel, LinhaConta } from '@/components/CheckoutPanel'

export function CheckoutPedidoClient({
  pedidoId,
  identificador,
  garcom,
  linhas,
  operador,
}: {
  pedidoId: string
  identificador: string
  garcom?: string
  linhas: LinhaConta[]
  operador?: string
}) {
  const router = useRouter()

  if (linhas.length === 0) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🧍</div>
        <p style={{ fontSize: '15px', marginBottom: '16px' }}>
          O pedido "{identificador}" já foi faturado ou não tem consumos.
        </p>
        <button onClick={() => router.push('/restaurante/mesas')} className="btn btn-secondary">
          ← Voltar às Mesas
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '560px', margin: '0 auto' }}>
      <button onClick={() => router.back()} className="btn btn-ghost btn-sm" style={{ marginBottom: '12px' }}>
        ← Voltar
      </button>
      {garcom && (
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
          Lançado por: {garcom}
        </p>
      )}
      <CheckoutPanel
        tipo="PEDIDO"
        alvoId={pedidoId}
        titulo={identificador}
        canalLabel={`Restaurante — ${identificador}`}
        linhas={linhas}
        operador={operador}
        onCancelar={() => router.back()}
        onSucesso={() => { router.push('/restaurante/mesas'); router.refresh() }}
      />
    </div>
  )
}
