// Disponibilidade de venda no POS — módulo puro (sem imports server-only),
// usado nas pages para pré-calcular o que cada cartão pode vender.
//
// Produto simples: o backend faz auto-unboxing de caixas na venda
// (descontarStockCanal), por isso a disponibilidade é o EQUIVALENTE
// unidades soltas + caixas do pai × fator — bloquear só por stockAtual
// bloquearia falsamente garrafas quando há caixas fechadas.
//
// Ficha técnica: limitada pelo ingrediente mais escasso —
// min(floor(stockIngrediente / quantidadeReceita)). O backend desconta
// ingredientes com permitirNegativo, portanto este bloqueio é só de UI.

import { stockEquivalente } from './stock-alerta'

export function disponibilidadeProduto(
  stockAtual: number,
  stockPai?: number | null,
  fatorProprio?: number | null
): number {
  return Math.floor(stockEquivalente({ stockAtual, stockPai, fatorProprio }))
}

export interface IngredienteDisponibilidade {
  produtoId: string
  quantidade: number // quantidade da receita por dose
  stockAtual: number // stock do ingrediente no canal
}

// Lista vazia → Infinity (ficha sem receita nunca bloqueia). Nas pages,
// serializar como `Number.isFinite(d) ? d : null` — Infinity não
// sobrevive à serialização RSC.
export function disponibilidadeFicha(ingredientes: IngredienteDisponibilidade[]): number {
  let min = Number.POSITIVE_INFINITY
  for (const ing of ingredientes) {
    if (ing.quantidade <= 0) continue
    min = Math.min(min, Math.floor(ing.stockAtual / ing.quantidade))
  }
  return min
}
