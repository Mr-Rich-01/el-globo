'use client'

import { DadosRecibo, gerarTextoRecibo } from '@/lib/recibo'
import { suportaWebUSB, imprimirViaWebUSB } from '@/lib/printer'

// Imprime o recibo com fallback em cadeia:
//   1. WebUSB — impressora USB local emparelhada (silencioso, sem popup)
//   2. ESC/POS via servidor — impressora de rede TCP:9100 (silencioso;
//      também abre a gaveta)
//   3. window.print() — o CSS @media print formata o rolo e a gaveta
//      abre via definição do driver ("open drawer on print")
// Nenhuma venda falha por causa da impressora.
export async function imprimirReciboFisico(
  dados: DadosRecibo,
  abrirGaveta: boolean
): Promise<'webusb' | 'escpos' | 'browser'> {
  if (suportaWebUSB()) {
    const ok = await imprimirViaWebUSB(dados, abrirGaveta)
    if (ok) return 'webusb'
  }

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
