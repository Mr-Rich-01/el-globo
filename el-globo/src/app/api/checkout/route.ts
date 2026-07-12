import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, podeAcederCanal } from '@/lib/auth'
import { notifyKDSClients } from '@/lib/kds-events'
import { z } from 'zod'

// Fecho de conta (mesa do restaurante ou aba da piscina).
// O stock foi descontado quando cada pedido foi criado — aqui NÃO se
// mexe no stock; apenas se consolida a venda, regista a divisão de
// conta e se liberta a mesa / fecha a aba. Tudo numa transação.

const DivisaoSchema = z.object({
  tipo: z.enum(['IGUAL', 'POR_ITEM']),
  partes: z.number().int().min(2).max(50),
  detalhe: z.array(z.object({
    parte: z.number().int().positive(),
    valor: z.number().nonnegative(),
    itens: z.array(z.string()).optional(),
  })).optional(),
})

const CheckoutSchema = z.object({
  // MESA = conta de mesa; ABA = conta de piscina; PEDIDO = pedido volante
  // individual (cliente de pé/balcão, id = pedidoId)
  tipo: z.enum(['MESA', 'ABA', 'PEDIDO']),
  id: z.string().min(1),
  metodoPagamento: z.enum(['DINHEIRO', 'CARTAO', 'MOBILE_MONEY', 'MISTO', 'CREDITO']),
  valorRecebido: z.number().optional(),
  desconto: z.number().min(0).default(0),
  divisao: DivisaoSchema.optional(),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  try {
    const body = await request.json()
    const parsed = CheckoutSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })

    const { tipo, id, metodoPagamento, valorRecebido, desconto, divisao } = parsed.data

    // Canal do fecho: mesa → RESTAURANTE; aba → PISCINA; pedido volante →
    // o canal do próprio pedido (carregado antes da validação de acesso).
    let canalCheckout: 'RESTAURANTE' | 'PISCINA'
    if (tipo === 'PEDIDO') {
      const pedidoVolante = await prisma.pedido.findUnique({ where: { id }, select: { canal: true, mesaId: true, abaId: true } })
      if (!pedidoVolante) return NextResponse.json({ erro: 'Pedido não encontrado' }, { status: 404 })
      if (pedidoVolante.mesaId || pedidoVolante.abaId) {
        return NextResponse.json({ erro: 'Este pedido pertence a uma mesa/aba — feche a conta correspondente' }, { status: 400 })
      }
      canalCheckout = pedidoVolante.canal === 'PISCINA' ? 'PISCINA' : 'RESTAURANTE'
    } else {
      canalCheckout = tipo === 'MESA' ? 'RESTAURANTE' : 'PISCINA'
    }
    if (!podeAcederCanal(session, canalCheckout)) {
      return NextResponse.json({ erro: `Sem acesso ao canal ${canalCheckout}` }, { status: 403 })
    }

    const resultado = await prisma.$transaction(async (tx) => {
      // Pedidos por faturar do alvo. vendaId null é a guarda contra dupla
      // faturação — um pedido ENTREGUE (servido) pode ainda não estar pago,
      // mas um pedido já ligado a uma venda nunca volta a ser cobrado.
      const wherePedidos = {
        ...(tipo === 'MESA' ? { mesaId: id } : tipo === 'ABA' ? { abaId: id } : { id }),
        estado: { notIn: ['CANCELADO' as const] },
        vendaId: null,
      }
      const pedidosPorFaturar = await tx.pedido.findMany({
        where: wherePedidos,
        include: { itens: { include: { produto: true, fichaTecnica: true } } },
      })

      if (pedidosPorFaturar.length === 0) {
        throw new Error(
          tipo === 'MESA' ? 'Mesa sem pedidos por faturar'
          : tipo === 'ABA' ? 'Aba sem consumos por faturar'
          : 'Pedido já faturado ou cancelado'
        )
      }

      // Snapshot dos itens para a venda (preço já foi fixado no pedido)
      const itensVenda = pedidosPorFaturar.flatMap(p =>
        p.itens.map(i => ({
          produtoId: i.produtoId,
          nomeProduto: i.produto?.nome ?? i.fichaTecnica?.nome ?? 'Item',
          quantidade: i.quantidade,
          precoUnitario: Number(i.precoUnitario),
          // Custo capturado quando o stock foi descontado (margem real)
          custoUnitario: i.custoUnitario != null ? Number(i.custoUnitario) : null,
          subtotal: Number(i.precoUnitario) * i.quantidade,
        }))
      )

      const subtotal = itensVenda.reduce((acc, i) => acc + i.subtotal, 0)
      const total = Math.max(0, subtotal - desconto)
      const troco = valorRecebido ? Math.max(0, valorRecebido - total) : 0

      // Divisão de conta: se IGUAL sem detalhe, o servidor calcula as
      // partes (a última absorve o resto do arredondamento).
      let divisaoDetalhe = divisao?.detalhe
      if (divisao && divisao.tipo === 'IGUAL' && !divisaoDetalhe) {
        const valorParte = Math.floor((total / divisao.partes) * 100) / 100
        divisaoDetalhe = Array.from({ length: divisao.partes }, (_, i) => ({
          parte: i + 1,
          valor: i === divisao.partes - 1
            ? Math.round((total - valorParte * (divisao.partes - 1)) * 100) / 100
            : valorParte,
        }))
      }

      const venda = await tx.venda.create({
        data: {
          canal: canalCheckout,
          mesaId: tipo === 'MESA' ? id : null,
          abaId: tipo === 'ABA' ? id : null,
          identificadorCliente: tipo === 'PEDIDO'
            ? pedidosPorFaturar[0].identificadorCliente ?? 'Balcão'
            : null,
          userId: session.sub,
          subtotal,
          desconto,
          total,
          metodoPagamento,
          valorRecebido: valorRecebido ?? null,
          troco: troco > 0 ? troco : null,
          divisaoTipo: divisao?.tipo ?? null,
          divisaoPartes: divisao?.partes ?? null,
          divisaoDetalhe: divisaoDetalhe ?? undefined,
          estado: 'PAGA',
          itens: { create: itensVenda },
        },
        include: { itens: true, mesa: true, aba: true },
      })

      const agora = new Date()
      if (tipo === 'PEDIDO') {
        // Venda ao balcão / volante: o pagamento acontece ANTES da entrega.
        // Liga-se apenas à venda (anti-dupla-faturação); o estado de
        // preparação fica intacto — o cartão permanece no KDS/BDS até
        // alguém carregar em "Entregar".
        await tx.pedido.updateMany({
          where: { id: { in: pedidosPorFaturar.map(p => p.id) } },
          data: { vendaId: venda.id },
        })
      } else {
        // Mesa/aba: o cliente consumiu e vai embora — marcar entregue,
        // ligar à venda e libertar mesa / fechar aba
        await tx.pedido.updateMany({
          where: { id: { in: pedidosPorFaturar.map(p => p.id) } },
          data: { estado: 'ENTREGUE', entregueEm: agora, vendaId: venda.id },
        })
        await tx.itemPedido.updateMany({
          where: { pedidoId: { in: pedidosPorFaturar.map(p => p.id) } },
          data: { estadoKDS: 'ENTREGUE' },
        })

        if (tipo === 'MESA') {
          await tx.mesa.update({ where: { id }, data: { estado: 'LIVRE' } })
        } else {
          await tx.aba.update({ where: { id }, data: { estado: 'FECHADA', fechadaEm: agora } })
        }
      }

      return { venda, pedidosFechados: pedidosPorFaturar.map(p => p.id) }
    })

    // Atualizar os cartões no KDS/BDS
    if (tipo === 'PEDIDO') {
      // Pedido de balcão pago mas ainda em preparação: atualizar o cartão
      // (badge "Pago"); se já tinha sido entregue, remover como antes.
      const pedidoAtualizado = await prisma.pedido.findUnique({
        where: { id },
        include: {
          itens: { include: { produto: true, fichaTecnica: true } },
          mesa: true, aba: true,
          garcom: { select: { id: true, nome: true } },
          user: { select: { nome: true } },
        },
      })
      if (pedidoAtualizado && pedidoAtualizado.estado !== 'ENTREGUE') {
        notifyKDSClients({ tipo: 'ATUALIZAR_PEDIDO', pedido: pedidoAtualizado })
      } else {
        notifyKDSClients({ tipo: 'REMOVER_PEDIDO', pedidoId: id })
      }
    } else {
      resultado.pedidosFechados.forEach(pedidoId =>
        notifyKDSClients({ tipo: 'REMOVER_PEDIDO', pedidoId })
      )
    }

    return NextResponse.json({ ok: true, venda: resultado.venda }, { status: 201 })
  } catch (error: unknown) {
    const mensagem = error instanceof Error ? error.message : 'Erro ao fechar conta'
    console.error('Erro no checkout:', error)
    return NextResponse.json({ erro: mensagem }, { status: 400 })
  }
}
