'use client'

import { useRouter } from 'next/navigation'
import { CheckoutPanel, LinhaConta } from '@/components/CheckoutPanel'

export function CheckoutMesaClient({
  mesaId,
  mesaNumero,
  linhas,
  operador,
}: {
  mesaId: string
  mesaNumero: number
  linhas: LinhaConta[]
  operador?: string
}) {
  const router = useRouter()

  if (linhas.length === 0) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🍽️</div>
        <p style={{ fontSize: '15px', marginBottom: '16px' }}>A Mesa {mesaNumero} não tem consumos por faturar.</p>
        <button onClick={() => router.push('/restaurante/mesas')} className="btn btn-secondary">
          ← Voltar às Mesas
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '560px', margin: '0 auto' }}>
      <button onClick={() => router.back()} className="btn btn-ghost btn-sm" style={{ marginBottom: '12px' }}>
        ← Voltar à Comanda
      </button>
      <CheckoutPanel
        tipo="MESA"
        alvoId={mesaId}
        titulo={`Mesa ${mesaNumero}`}
        canalLabel={`Restaurante — Mesa ${mesaNumero}`}
        linhas={linhas}
        operador={operador}
        onCancelar={() => router.back()}
        onSucesso={() => { router.push('/restaurante/mesas'); router.refresh() }}
      />
    </div>
  )
}
