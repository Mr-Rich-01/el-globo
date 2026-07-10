'use client'

import { DadosRecibo, gerarTextoRecibo } from '@/lib/recibo'

// Imprime o recibo: primeiro tenta ESC/POS direto na impressora de rede
// (que também abre a gaveta); se desativado ou offline, cai para
// window.print() — o CSS @media print formata o rolo e a gaveta abre
// via definição do driver ("open drawer on print").
export async function imprimirReciboFisico(
  dados: DadosRecibo,
  abrirGaveta: boolean
): Promise<'escpos' | 'browser'> {
  try {
    const res = await fetch('/api/imprimir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: gerarTextoRecibo(dados), abrirGaveta }),
    })
    const j = await res.json()
    if (j.ok) return 'escpos'
  } catch { /* segue para fallback */ }

  window.print()
  return 'browser'
}
