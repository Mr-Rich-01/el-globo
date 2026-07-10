import { prisma } from '@/lib/prisma'
import { semDecimais } from '@/lib/serializar'
import { notFound } from 'next/navigation'
import { ComandaClient } from './ComandaClient'

export default async function ComandaPage({ params }: { params: Promise<{ mesaId: string }> }) {
  const { mesaId } = await params

  const [mesa, produtos] = await Promise.all([
    prisma.mesa.findUnique({
      where: { id: mesaId },
      include: {
        pedidos: {
          where: { estado: { notIn: ['ENTREGUE', 'CANCELADO'] } },
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
        categoria: true,
        stockCanais: { where: { canal: 'RESTAURANTE', ativo: true } },
      },
      orderBy: [{ categoria: { nome: 'asc' } }, { nome: 'asc' }],
    }),
  ])

  // Achatar preço/stock do canal RESTAURANTE no formato que o ComandaClient espera
  const produtosMapeados = produtos.map(p => {
    const sc = p.stockCanais[0]
    const { stockCanais: _sc, ...resto } = p
    return {
      ...resto,
      precoVenda: Number(sc.precoVenda),
      stockAtual: Number(sc.stockAtual),
      stockMinimo: Number(sc.stockMinimo),
    }
  })

  if (!mesa) notFound()

  const fichas = await prisma.fichaTecnica.findMany({
    where: { ativo: true },
    orderBy: { nome: 'asc' },
  })

  const fichasMapeadas = fichas.map(f => ({
    ...f,
    precoVenda: Number(f.precoVenda)
  }))

  return <ComandaClient mesa={semDecimais(mesa) as any} produtos={produtosMapeados as any} fichas={fichasMapeadas as any} />
}
