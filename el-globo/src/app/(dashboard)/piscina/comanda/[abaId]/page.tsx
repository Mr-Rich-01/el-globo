import { prisma } from '@/lib/prisma'
import { semDecimais } from '@/lib/serializar'
import { getSession } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { disponibilidadeProduto, disponibilidadeFicha } from '@/lib/disponibilidade'
import { CanalVenda } from '@prisma/client'
import { ComandaAbaClient } from './ComandaAbaClient'

// A Piscina é servida pelo bar do restaurante: um produto sem linha de
// stock ativa na PISCINA vende do stock do RESTAURANTE (fallback em
// lib/stock.ts). A linha "efetiva" aqui replica essa resolução para a
// disponibilidade do POS bater certo com o que o backend vai descontar.
const CANAIS_PISCINA: CanalVenda[] = ['PISCINA', 'RESTAURANTE']

function linhaEfetiva<T extends { canal: CanalVenda }>(linhas: T[]): T | undefined {
  return linhas.find(l => l.canal === 'PISCINA') ?? linhas.find(l => l.canal === 'RESTAURANTE')
}

export default async function ComandaAbaPage({ params }: { params: Promise<{ abaId: string }> }) {
  const { abaId } = await params
  const session = await getSession()

  const [aba, produtos] = await Promise.all([
    prisma.aba.findUnique({
      where: { id: abaId },
      include: {
        pedidos: {
          // Por faturar (mesmo já entregues) — o total da aba inclui
          // consumo entregue-mas-por-pagar
          where: { vendaId: null, estado: { not: 'CANCELADO' } },
          include: {
            itens: {
              include: { produto: true, fichaTecnica: true },
            },
            user: { select: { nome: true } },
          },
          orderBy: { criadoEm: 'desc' },
        },
      },
    }),

    prisma.produto.findMany({
      where: {
        ativo: true,
        isIngrediente: false, // ingredientes de preparação nunca aparecem na comanda
        stockCanais: { some: { canal: { in: CANAIS_PISCINA }, ativo: true } },
      },
      include: {
        categoria: { include: { parent: { select: { id: true, nome: true } } } },
        stockCanais: { where: { canal: { in: CANAIS_PISCINA }, ativo: true } },
        // Stock da caixa-pai no mesmo canal — o auto-unboxing da venda
        // permite vender unidades enquanto houver caixas fechadas
        parent: {
          select: {
            stockCanais: {
              where: { canal: { in: CANAIS_PISCINA }, ativo: true },
              select: { canal: true, stockAtual: true },
            },
          },
        },
      },
      orderBy: [{ categoria: { nome: 'asc' } }, { nome: 'asc' }],
    }),
  ])

  // Só abas abertas podem receber consumo
  if (!aba || aba.estado !== 'ABERTA') notFound()

  // Achatar preço/stock do canal efetivo no formato que o client espera
  const produtosMapeados = produtos.map(p => {
    const sc = linhaEfetiva(p.stockCanais)!
    const stockPai = p.parent ? linhaEfetiva(p.parent.stockCanais.filter(l => l.canal === sc.canal)) : undefined
    const { stockCanais: _sc, parent: _p, ...resto } = p
    return {
      ...resto,
      precoVenda: Number(sc.precoVenda),
      stockAtual: Number(sc.stockAtual),
      stockMinimo: Number(sc.stockMinimo),
      disponivel: disponibilidadeProduto(
        Number(sc.stockAtual),
        stockPai ? Number(stockPai.stockAtual) : null,
        p.fatorConversao,
      ),
    }
  })

  const fichas = await prisma.fichaTecnica.findMany({
    where: { ativo: true },
    include: {
      ingredientes: {
        select: {
          produtoId: true,
          quantidade: true,
          produto: {
            select: {
              stockCanais: {
                where: { canal: { in: CANAIS_PISCINA } },
                select: { canal: true, ativo: true, stockAtual: true },
              },
            },
          },
        },
      },
    },
    orderBy: { nome: 'asc' },
  })

  const fichasMapeadas = fichas.map(f => {
    const disp = disponibilidadeFicha(f.ingredientes.map(i => {
      // Fallback por ingrediente, como no desconto: linha da PISCINA se
      // estiver ativa, senão a do RESTAURANTE
      const pis = i.produto.stockCanais.find(l => l.canal === 'PISCINA')
      const efetiva = pis?.ativo ? pis : i.produto.stockCanais.find(l => l.canal === 'RESTAURANTE')
      return {
        produtoId: i.produtoId,
        quantidade: Number(i.quantidade),
        stockAtual: Number(efetiva?.stockAtual ?? 0),
      }
    }))
    const { ingredientes: _ing, ...resto } = f
    return {
      ...resto,
      precoVenda: Number(f.precoVenda),
      // Infinity (ficha sem receita) não sobrevive à serialização RSC
      disponivel: Number.isFinite(disp) ? disp : null,
    }
  })

  return <ComandaAbaClient aba={semDecimais(aba) as any} produtos={produtosMapeados as any} fichas={fichasMapeadas as any} role={session?.role ?? ''} />
}
