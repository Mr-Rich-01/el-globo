import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, resolveCanal, canaisPermitidos, CanalNaoAutorizadoError } from '@/lib/auth'
import { descontarProdutoComReceita } from '@/lib/stock'
import { z } from 'zod'
import { CanalVenda } from '@prisma/client'

// Venda DIRETA (POS Bottlestore / balcão): desconta stock no ato.
// Contas de mesa/aba fecham via /api/checkout — o stock dessas já foi
// descontado quando os pedidos foram criados.

const DivisaoSchema = z.object({
  tipo: z.enum(['IGUAL', 'POR_ITEM']),
  partes: z.number().int().min(2).max(50),
  detalhe: z.array(z.object({
    parte: z.number().int().positive(),
    valor: z.number().nonnegative(),
    itens: z.array(z.string()).optional(),
  })),
})

const VendaSchema = z.object({
  canal: z.enum(['RESTAURANTE', 'BOTTLESTORE', 'PISCINA']),
  metodoPagamento: z.enum(['DINHEIRO', 'CARTAO', 'MOBILE_MONEY', 'MISTO', 'CREDITO']),
  valorRecebido: z.number().optional(),
  desconto: z.number().default(0),
  divisao: DivisaoSchema.optional(),
  itens: z.array(z.object({
    produtoId: z.string(),
    quantidade: z.number().int().positive(),
    precoUnitario: z.number().optional(), // override — apenas ADMIN/GERENTE
  })).min(1),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  try {
    const body = await request.json()
    const parsed = VendaSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 })

    const { metodoPagamento, valorRecebido, desconto, divisao, itens } = parsed.data
    // O canal efetivo é derivado da sessão — o que o cliente envia só é
    // aceite se estiver dentro dos canais permitidos ao utilizador.
    const canal = resolveCanal(session, parsed.data.canal)
    const podeAlterarPreco = ['ADMIN', 'GERENTE'].includes(session.role)

    const venda = await prisma.$transaction(async (tx) => {
      const itensComPreco = await Promise.all(itens.map(async item => {
        const produto = await tx.produto.findUniqueOrThrow({ where: { id: item.produtoId } })

        // Ingredientes de preparação nunca são vendidos diretamente
        if (produto.isIngrediente) {
          throw new Error(`${produto.nome} é um ingrediente de preparação e não pode ser vendido diretamente`)
        }

        // Desconto de stock por canal, com anti-race e auto-unboxing;
        // se o produto tiver receita associada, deduz também os ingredientes
        const { precoVenda: precoCanal, precoCusto } = await descontarProdutoComReceita(tx, {
          produtoId: item.produtoId,
          canal: canal as CanalVenda,
          quantidade: item.quantidade,
          userId: session.sub,
          referencia: `venda-${canal}`,
        })

        // Override de preço só para quem tem permissão de gestão
        const preco = podeAlterarPreco && item.precoUnitario != null
          ? item.precoUnitario
          : precoCanal

        return {
          produtoId: item.produtoId,
          nomeProduto: produto.nome,
          quantidade: item.quantidade,
          precoUnitario: preco,
          custoUnitario: precoCusto,
          subtotal: preco * item.quantidade,
        }
      }))

      const subtotal = itensComPreco.reduce((acc, i) => acc + i.subtotal, 0)
      const total = subtotal - (desconto ?? 0)
      const troco = valorRecebido ? Math.max(0, valorRecebido - total) : 0

      return tx.venda.create({
        data: {
          canal: canal as CanalVenda,
          userId: session.sub,
          subtotal,
          desconto: desconto ?? 0,
          total,
          metodoPagamento,
          valorRecebido: valorRecebido ?? null,
          troco: troco > 0 ? troco : null,
          divisaoTipo: divisao?.tipo ?? null,
          divisaoPartes: divisao?.partes ?? null,
          divisaoDetalhe: divisao?.detalhe ?? undefined,
          estado: 'PAGA',
          itens: { create: itensComPreco },
        },
        include: { itens: true },
      })
    })

    return NextResponse.json({ ok: true, venda }, { status: 201 })
  } catch (error: unknown) {
    const status = error instanceof CanalNaoAutorizadoError ? 403 : 400
    const mensagem = error instanceof Error ? error.message : 'Erro ao criar venda'
    console.error('Erro ao criar venda:', error)
    return NextResponse.json({ erro: mensagem }, { status })
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const canal = searchParams.get('canal')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '50')

  // Cada utilizador só vê vendas dos seus canais; canal explícito é validado
  const permitidos = canaisPermitidos(session)
  if (canal && !permitidos.includes(canal as CanalVenda)) {
    return NextResponse.json({ erro: `Sem acesso ao canal ${canal}` }, { status: 403 })
  }

  const vendas = await prisma.venda.findMany({
    where: { canal: canal ? (canal as CanalVenda) : { in: permitidos } },
    include: {
      itens: true,
      user: { select: { nome: true } },
    },
    orderBy: { criadoEm: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })

  return NextResponse.json(vendas)
}
