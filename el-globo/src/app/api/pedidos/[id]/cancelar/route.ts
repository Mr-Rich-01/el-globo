import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { notifyKDSClients } from '@/lib/kds-events'
import { estornarStockPedido } from '@/lib/stock'

// Cancela um pedido não faturado (estorno): repõe todo o stock consumido,
// marca pedido e itens como CANCELADO, liberta a mesa se não resta nada
// por preparar nem por faturar, e remove o cartão do KDS/BDS via SSE.
// Só ADMIN/GERENTE — é uma correção de erro/mudança de ideias do cliente,
// não uma operação do dia-a-dia do empregado.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'GERENTE'].includes(session.role)) {
    return NextResponse.json({ erro: 'Sem permissão para cancelar pedidos' }, { status: 403 })
  }

  const { id } = await params

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { itens: true },
  })
  if (!pedido) return NextResponse.json({ erro: 'Pedido não encontrado' }, { status: 404 })
  if (pedido.vendaId) {
    return NextResponse.json({ erro: 'Pedido já faturado — não pode ser cancelado' }, { status: 409 })
  }
  if (pedido.estado === 'CANCELADO') {
    return NextResponse.json({ erro: 'Pedido já cancelado' }, { status: 409 })
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Update condicional anti-race: se entretanto o pedido foi faturado
      // (checkout simultâneo) ou cancelado noutra janela, não estorna nada.
      const r = await tx.pedido.updateMany({
        where: { id, vendaId: null, estado: { not: 'CANCELADO' } },
        data: { estado: 'CANCELADO' },
      })
      if (r.count === 0) throw new Error('O pedido já foi faturado ou cancelado')

      await tx.itemPedido.updateMany({
        where: { pedidoId: id },
        data: { estadoKDS: 'CANCELADO' },
      })

      await estornarStockPedido(tx, pedido, session.sub)

      // Libertar a mesa quando não resta nada por preparar nem por faturar
      // (mesma regra da entrega em /api/pedidos/[id]/estado).
      if (pedido.mesaId) {
        const pendentes = await tx.pedido.count({
          where: {
            mesaId: pedido.mesaId,
            OR: [
              { estado: { notIn: ['ENTREGUE', 'CANCELADO'] } },
              { vendaId: null, estado: { not: 'CANCELADO' } },
            ],
          },
        })
        if (pendentes === 0) {
          await tx.mesa.update({
            where: { id: pedido.mesaId },
            data: { estado: 'LIVRE' },
          })
        }
      }
    })
  } catch (error: unknown) {
    const mensagem = error instanceof Error ? error.message : 'Erro ao cancelar pedido'
    return NextResponse.json({ erro: mensagem }, { status: 409 })
  }

  // O KDS/BDS remove o cartão em tempo real
  notifyKDSClients({ tipo: 'REMOVER_PEDIDO', pedidoId: id })

  return NextResponse.json({ ok: true })
}
