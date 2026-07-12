// Linhas StockCanal abaixo do mínimo, avaliando o EQUIVALENTE TOTAL da
// família caixa/unidade (caixas × fator + unidades) — um armazém cheio
// de caixas não dispara alerta só porque há 0 unidades soltas.
// Server-only (usa Prisma); partilhado entre o card do dashboard e a
// tab "Stock Baixo" dos relatórios.

import { prisma } from '@/lib/prisma'
import { CanalVenda } from '@prisma/client'
import { stockEquivalente, stockAbaixoMinimo } from '@/lib/stock-alerta'

export interface LinhaStockBaixo {
  produtoId: string
  produto: string
  canal: CanalVenda
  stockAtual: number
  stockEquivalente: number
  stockMinimo: number
  diferenca: number // stockMinimo − equivalente (>0 = défice)
}

export async function linhasStockBaixo(canais?: CanalVenda[]): Promise<LinhaStockBaixo[]> {
  const linhas = await prisma.stockCanal.findMany({
    where: {
      ativo: true,
      produto: { ativo: true },
      ...(canais ? { canal: { in: canais } } : {}),
    },
    select: {
      produtoId: true,
      canal: true,
      stockAtual: true,
      stockMinimo: true,
      produto: {
        select: {
          nome: true,
          parentProductId: true,
          fatorConversao: true,
          filhos: { where: { ativo: true }, select: { id: true, fatorConversao: true } },
        },
      },
    },
  })

  const porProdutoCanal = new Map(linhas.map(l => [`${l.produtoId}:${l.canal}`, Number(l.stockAtual)]))

  return linhas
    .map(l => {
      const pai = l.produto.parentProductId
      const filho = l.produto.filhos.find(f => f.fatorConversao)
      const opts = {
        stockAtual: Number(l.stockAtual),
        stockMinimo: Number(l.stockMinimo),
        stockPai: pai != null ? porProdutoCanal.get(`${pai}:${l.canal}`) ?? null : null,
        fatorProprio: l.produto.fatorConversao,
        stockFilho: filho ? porProdutoCanal.get(`${filho.id}:${l.canal}`) ?? null : null,
        fatorFilho: filho?.fatorConversao ?? null,
      }
      const equivalente = stockEquivalente(opts)
      return {
        abaixo: stockAbaixoMinimo(opts),
        linha: {
          produtoId: l.produtoId,
          produto: l.produto.nome,
          canal: l.canal,
          stockAtual: Number(l.stockAtual),
          stockEquivalente: equivalente,
          stockMinimo: Number(l.stockMinimo),
          diferenca: Number(l.stockMinimo) - equivalente,
        },
      }
    })
    .filter(r => r.abaixo)
    .map(r => r.linha)
    // Mais crítico primeiro: rácio equivalente/mínimo asc (esgotados no topo)
    .sort((a, b) =>
      a.stockEquivalente / Math.max(a.stockMinimo, 1) - b.stockEquivalente / Math.max(b.stockMinimo, 1)
    )
}
