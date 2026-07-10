// Alerta de stock mínimo pelo EQUIVALENTE TOTAL da família caixa/unidade.
// Módulo puro (sem imports server-only) — usado na listagem de produtos
// (client) e no dashboard (server).
//
// Para uma linha StockCanal, o equivalente é expresso na unidade do próprio
// produto:
// - Produto "unidade" (tem pai caixa): unidades soltas + caixas × fator.
// - Produto "caixa" (tem filho unidade): caixas + unidades ÷ fator.
// Assim, 2 caixas cheias de 24 nunca disparam o alerta da garrafa só porque
// há 0 unidades soltas.

export interface EquivalenteOpts {
  stockAtual: number
  // Se o produto for a UNIDADE: stock da caixa (pai) no mesmo canal + fator
  stockPai?: number | null
  fatorProprio?: number | null
  // Se o produto for a CAIXA: stock da unidade (filho) no mesmo canal + fator
  stockFilho?: number | null
  fatorFilho?: number | null
}

export function stockEquivalente(o: EquivalenteOpts): number {
  let eq = o.stockAtual
  if (o.fatorProprio && o.stockPai != null) eq += o.stockPai * o.fatorProprio
  if (o.fatorFilho && o.stockFilho != null) eq += o.stockFilho / o.fatorFilho
  return eq
}

export function stockAbaixoMinimo(o: EquivalenteOpts & { stockMinimo: number }): boolean {
  return stockEquivalente(o) <= o.stockMinimo
}
