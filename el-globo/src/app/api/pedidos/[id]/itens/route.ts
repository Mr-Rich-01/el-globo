import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, podeAcederCanal, CanalNaoAutorizadoError } from '@/lib/auth'
import { notifyKDSClients } from '@/lib/kds-events'
import { descontarProdutoComReceita, descontarIngredientesReceita } from '@/lib/stock'
import { destinoDoTipoCategoria, destinoDeFicha, calcularEstadoAgregado } from '@/lib/preparo'
import { z } from 'zod'

// Acrescenta itens a um pedido existente ainda não faturado — usado no
// tablet para "retomar" um pedido volante (ou de mesa) e lançar mais
// consumo sem criar um pedido novo. Desconta stock e reacorda o KDS.

const ItensSchema = z.object({
  itens: z.array(z.object({
    tipo: z.enum(['produto', 'ficha']),
    id: z.string(),
    quantidade: z.number().positive(),
    notas: z.string().nullable().optional(),
  })).min(1),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  try {
    const body = await request.json()
    const parsed = ItensSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })

    const pedidoExistente = await prisma.pedido.findUnique({ where: { id } })
    if (!pedidoExistente) return NextResponse.json({ erro: 'Pedido não encontrado' }, { status: 404 })
    if (pedidoExistente.vendaId) return NextResponse.json({ erro: 'Pedido já faturado' }, { status: 400 })
    if (pedidoExistente.estado === 'CANCELADO') return NextResponse.json({ erro: 'Pedido cancelado' }, { status: 400 })
    if (!podeAcederCanal(session, pedidoExistente.canal)) {
      return NextResponse.json({ erro: `Sem acesso ao canal ${pedidoExistente.canal}` }, { status: 403 })
    }

    const referencia = `pedido-${pedidoExistente.canal}-extra-${id}`

    const pedido = await prisma.$transaction(async (tx) => {
      for (const item of parsed.data.itens) {
        if (item.tipo === 'produto') {
          // Comida → Cozinha (KDS); bebidas/tabaco/snack → Bar (BDS)
          const { categoria, isIngrediente, nome } = await tx.produto.findUniqueOrThrow({
            where: { id: item.id },
            select: { nome: true, isIngrediente: true, categoria: { select: { tipo: true } } },
          })
          // Ingredientes de preparação nunca são vendidos diretamente
          if (isIngrediente) {
            throw new Error(`${nome} é um ingrediente de preparação e não pode ser vendido diretamente`)
          }
          // Desconta o produto e, se tiver receita associada, os ingredientes
          const { precoVenda, precoCusto } = await descontarProdutoComReceita(tx, {
            produtoId: item.id,
            canal: pedidoExistente.canal,
            quantidade: item.quantidade,
            userId: session.sub,
            referencia,
          })
          await tx.itemPedido.create({
            data: { pedidoId: id, produtoId: item.id, quantidade: item.quantidade, precoUnitario: precoVenda, custoUnitario: precoCusto, notas: item.notas ?? null, destino: destinoDoTipoCategoria(categoria.tipo) },
          })
        } else {
          const ficha = await tx.fichaTecnica.findUniqueOrThrow({
            where: { id: item.id },
            include: {
              produto: { select: { categoria: { select: { tipo: true } } } },
              ingredientes: { include: { produto: { select: { categoria: { select: { tipo: true } } } } } },
            },
          })
          const custoFicha = await descontarIngredientesReceita(tx, {
            ingredientes: ficha.ingredientes,
            canal: pedidoExistente.canal,
            multiplicador: item.quantidade,
            userId: session.sub,
            referencia: `${referencia}:ficha-${ficha.nome}`,
          })
          await tx.itemPedido.create({
            data: { pedidoId: id, fichaTecnicaId: item.id, quantidade: item.quantidade, precoUnitario: Number(ficha.precoVenda), custoUnitario: custoFicha, notas: item.notas ?? null, destino: destinoDeFicha(ficha) },
          })
        }
      }

      // Itens novos → recalcular o estado agregado: a secção que já tinha
      // terminado mantém-se pronta, a que recebeu itens volta a trabalhar.
      const itensAtuais = await tx.itemPedido.findMany({
        where: { pedidoId: id },
        select: { estadoKDS: true },
      })
      const estadoAgregado = calcularEstadoAgregado(itensAtuais)

      return tx.pedido.update({
        where: { id },
        data: { estado: estadoAgregado, prontoEm: null },
        include: {
          itens: { include: { produto: true, fichaTecnica: true } },
          mesa: true, aba: true,
          garcom: { select: { id: true, nome: true } },
          user: { select: { nome: true } },
        },
      })
    })

    notifyKDSClients({ tipo: 'ATUALIZAR_PEDIDO', pedido })

    return NextResponse.json({ ok: true, pedido })
  } catch (error: unknown) {
    const status = error instanceof CanalNaoAutorizadoError ? 403 : 400
    const mensagem = error instanceof Error ? error.message : 'Erro ao acrescentar itens'
    console.error('Erro ao acrescentar itens:', error)
    return NextResponse.json({ erro: mensagem }, { status })
  }
}
