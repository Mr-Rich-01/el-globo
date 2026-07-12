// Vocabulário partilhado do ledger de stock (MovimentacaoStock.tipo é String
// livre no schema — este mapa é a única fonte de verdade para API e UI).

export const MOTIVOS = {
  VENDA:         { label: 'Venda',         tipos: ['SAIDA_VENDA'] },
  COMPRA:        { label: 'Compra',        tipos: ['ENTRADA_COMPRA'] },
  QUEBRA:        { label: 'Quebra',        tipos: ['SAIDA_QUEBRA'] },
  ESTORNO:       { label: 'Estorno',       tipos: ['ENTRADA_ESTORNO'] },
  AJUSTE:        { label: 'Ajuste',        tipos: ['ENTRADA_AJUSTE', 'SAIDA_AJUSTE'] },
  DESMANCHE:     { label: 'Desmanche',     tipos: ['SAIDA_DESMANCHE', 'ENTRADA_DESMANCHE'] },
  TRANSFERENCIA: { label: 'Transferência', tipos: ['SAIDA_TRANSFERENCIA', 'ENTRADA_TRANSFERENCIA'] },
} as const

export type MotivoKey = keyof typeof MOTIVOS

export function isMotivoKey(valor: string): valor is MotivoKey {
  return valor in MOTIVOS
}

export const isEntrada = (tipo: string) => tipo.startsWith('ENTRADA')

// Tipos futuros/desconhecidos caem no fallback (tipo cru) em vez de crashar
export function motivoDoTipo(tipo: string): string {
  for (const m of Object.values(MOTIVOS)) {
    if ((m.tipos as readonly string[]).includes(tipo)) return m.label
  }
  return tipo
}
