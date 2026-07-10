import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { notifyKDSClients } from '@/lib/kds-events'
import { calcularEstadoAgregado } from '@/lib/preparo'
import { z } from 'zod'

const EstadoSchema = z.object({
  estado: z.enum(['PENDENTE', 'EM_PREPARACAO', 'PRONTO', 'ENTREGUE', 'CANCELADO']),
  // Quando presente, o estado aplica-se apenas aos itens dessa secção
  // (KDS marca a COZINHA, BDS marca o BAR) e o estado do pedido passa a
  // ser o agregado: PRONTO só quando Cozinha E Bar terminaram.
  destino: z.enum(['COZINHA', 'BAR']).optional(),
})

const INCLUDE_PEDIDO = {
  itens: { include: { produto: true, fichaTecnica: true } },
  mesa: true, aba: true,
  garcom: { select: { id: true, nome: true } },
  user: { select: { nome: true } },
} as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const parsed = EstadoSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ erro: 'Estado inválido' }, { status: 400 })

  const { estado: novoEstado, destino } = parsed.data

  try {
    // ── Atualização por secção (Cozinha ou Bar) ──────────────────
    if (destino && (novoEstado === 'PENDENTE' || novoEstado === 'EM_PREPARACAO' || novoEstado === 'PRONTO')) {
      const pedido = await prisma.$transaction(async (tx) => {
        await tx.itemPedido.updateMany({
          where: {
            pedidoId: id,
            destino,
            // "Iniciar" não regride itens já prontos; "Pronto" fecha
            // todos os itens ativos da secção.
            estadoKDS: novoEstado === 'EM_PREPARACAO'
              ? { in: ['PENDENTE'] }
              : { notIn: ['ENTREGUE', 'CANCELADO'] },
          },
          data: { estadoKDS: novoEstado },
        })

        const itens = await tx.itemPedido.findMany({
          where: { pedidoId: id },
          select: { estadoKDS: true },
        })
        const agregado = calcularEstadoAgregado(itens)

        return tx.pedido.update({
          where: { id },
          data: {
            estado: agregado,
            prontoEm: agregado === 'PRONTO' ? new Date() : null,
          },
          include: INCLUDE_PEDIDO,
        })
      })

      notifyKDSClients({ tipo: 'ATUALIZAR_PEDIDO', pedido })
      // A secção terminou os seus itens → alertar o garçom do pedido
      // (o toast diz se foi a Cozinha ou o Bar que terminou).
      if (novoEstado === 'PRONTO') {
        notifyKDSClients({ tipo: 'PEDIDO_PRONTO', pedido, origemPreparo: destino })
      }

      return NextResponse.json({ ok: true, pedido })
    }

    // ── Atualização global do pedido (ENTREGUE, CANCELADO, legado) ──
    const pedido = await prisma.pedido.update({
      where: { id },
      data: {
        estado: novoEstado,
        ...(novoEstado === 'PRONTO' ? {
          prontoEm: new Date(),
          itens: { updateMany: { where: { estadoKDS: { notIn: ['ENTREGUE', 'CANCELADO'] } }, data: { estadoKDS: 'PRONTO' } } },
        } : {}),
        ...(novoEstado === 'ENTREGUE' ? {
          entregueEm: new Date(),
          itens: { updateMany: { where: {}, data: { estadoKDS: 'ENTREGUE' } } },
        } : {}),
      },
      include: INCLUDE_PEDIDO,
    })

    // Notificar em tempo real via SSE: o KDS/BDS atualiza o cartão e,
    // quando fica PRONTO, os ecrãs dos empregados recebem o alerta.
    notifyKDSClients({ tipo: 'ATUALIZAR_PEDIDO', pedido })
    if (novoEstado === 'PRONTO') {
      notifyKDSClients({ tipo: 'PEDIDO_PRONTO', pedido })
    }

    // Se entregue, liberar mesa se todos os pedidos estiverem entregues
    if (novoEstado === 'ENTREGUE' && pedido.mesaId) {
      const pendentes = await prisma.pedido.count({
        where: {
          mesaId: pedido.mesaId,
          estado: { notIn: ['ENTREGUE', 'CANCELADO'] },
        },
      })
      if (pendentes === 0) {
        await prisma.mesa.update({
          where: { id: pedido.mesaId },
          data: { estado: 'LIVRE' },
        })
      }
    }

    return NextResponse.json({ ok: true, pedido })
  } catch {
    return NextResponse.json({ erro: 'Pedido não encontrado' }, { status: 404 })
  }
}
