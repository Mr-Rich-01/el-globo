import { prisma } from '@/lib/prisma'
import { semDecimais } from '@/lib/serializar'
import { getSession } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { disponibilidadeProduto, disponibilidadeFicha } from '@/lib/disponibilidade'
import { ComandaClient } from './ComandaClient'

export default async function ComandaPage({ params }: { params: Promise<{ mesaId: string }> }) {
  const { mesaId } = await params
  const session = await getSession()

  const [mesa, produtos] = await Promise.all([
    prisma.mesa.findUnique({
      where: { id: mesaId },
      include: {
        pedidos: {
          // Por faturar (mesmo já entregues) — o Total da Mesa tem de
          // incluir consumo entregue-mas-por-pagar
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
        stockCanais: { some: { canal: 'RESTAURANTE', ativo: true } },
      },
      include: {
        categoria: { include: { parent: { select: { id: true, nome: true } } } },
        stockCanais: { where: { canal: 'RESTAURANTE', ativo: true } },
        // Stock da caixa-pai no mesmo canal — o auto-unboxing da venda
        // permite vender unidades enquanto houver caixas fechadas
        parent: {
          select: {
            stockCanais: { where: { canal: 'RESTAURANTE', ativo: true }, select: { stockAtual: true } },
          },
        },
      },
      orderBy: [{ categoria: { nome: 'asc' } }, { nome: 'asc' }],
    }),
  ])

  // Achatar preço/stock do canal RESTAURANTE no formato que o ComandaClient espera
  const produtosMapeados = produtos.map(p => {
    const sc = p.stockCanais[0]
    const stockPai = p.parent?.stockCanais[0]
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

  if (!mesa) notFound()

  const fichas = await prisma.fichaTecnica.findMany({
    where: { ativo: true },
    include: {
      ingredientes: {
        select: {
          produtoId: true,
          quantidade: true,
          produto: {
            select: {
              stockCanais: { where: { canal: 'RESTAURANTE' }, select: { stockAtual: true } },
            },
          },
        },
      },
    },
    orderBy: { nome: 'asc' },
  })

  const fichasMapeadas = fichas.map(f => {
    const disp = disponibilidadeFicha(f.ingredientes.map(i => ({
      produtoId: i.produtoId,
      quantidade: Number(i.quantidade),
      stockAtual: Number(i.produto.stockCanais[0]?.stockAtual ?? 0),
    })))
    const { ingredientes: _ing, ...resto } = f
    return {
      ...resto,
      precoVenda: Number(f.precoVenda),
      // Infinity (ficha sem receita) não sobrevive à serialização RSC
      disponivel: Number.isFinite(disp) ? disp : null,
    }
  })

  return <ComandaClient mesa={semDecimais(mesa) as any} produtos={produtosMapeados as any} fichas={fichasMapeadas as any} role={session?.role ?? ''} />
}
