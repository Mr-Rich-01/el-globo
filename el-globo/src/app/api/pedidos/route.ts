import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, resolveCanal, canaisPermitidos, CanalNaoAutorizadoError } from '@/lib/auth'
import { notifyKDSClients } from '@/lib/kds-events'
import { descontarProdutoComReceita, descontarIngredientesReceita } from '@/lib/stock'
import { destinoDoTipoCategoria, destinoDeFicha } from '@/lib/preparo'
import { z } from 'zod'
import { CanalVenda, DestinoPreparo, EstadoPedido } from '@prisma/client'

const PedidoSchema = z.object({
  canal: z.enum(['RESTAURANTE', 'BOTTLESTORE', 'PISCINA']),
  mesaId: z.string().optional(),
  abaId: z.string().optional(),
  // Pedido volante (sem mesa/aba): referência livre, ex "Balcão — João"
  identificadorCliente: z.string().trim().max(80).optional(),
  itens: z.array(z.object({
    tipo: z.enum(['produto', 'ficha']),
    id: z.string(),
    quantidade: z.number().positive(),
    notas: z.string().nullable().optional(),
  })).min(1),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  try {
    const body = await request.json()
    const parsed = PedidoSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })

    const { mesaId, abaId, identificadorCliente, itens } = parsed.data

    // Todo o pedido precisa de um destino: mesa, aba, ou identificador
    // de cliente volante (balcão / de pé).
    if (!mesaId && !abaId && !identificadorCliente) {
      return NextResponse.json(
        { erro: 'Indique a mesa, a aba ou o identificador do cliente (pedido volante)' },
        { status: 400 }
      )
    }

    // Canal validado contra a sessão — um operador da loja não consegue
    // criar pedidos no restaurante mesmo forjando o body.
    const canalVal = resolveCanal(session, parsed.data.canal)
    const referencia = `pedido-${canalVal}-${mesaId ?? abaId ?? 'balcao'}`

    const pedido = await prisma.$transaction(async (tx) => {
      const itensComPreco = await Promise.all(itens.map(async item => {
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
            canal: canalVal,
            quantidade: item.quantidade,
            userId: session.sub,
            referencia,
          })
          const destino: DestinoPreparo = destinoDoTipoCategoria(categoria.tipo)
          return { produtoId: item.id, quantidade: item.quantidade, precoUnitario: precoVenda, custoUnitario: precoCusto, notas: item.notas ?? null, destino }
        }

        // Ficha Técnica: desconta cada ingrediente da receita
        const ficha = await tx.fichaTecnica.findUniqueOrThrow({
          where: { id: item.id },
          include: {
            produto: { select: { categoria: { select: { tipo: true } } } },
            ingredientes: { include: { produto: { select: { categoria: { select: { tipo: true } } } } } },
          },
        })

        const custoFicha = await descontarIngredientesReceita(tx, {
          ingredientes: ficha.ingredientes,
          canal: canalVal,
          multiplicador: item.quantidade,
          userId: session.sub,
          referencia: `${referencia}:ficha-${ficha.nome}`,
        })

        return { fichaTecnicaId: item.id, quantidade: item.quantidade, precoUnitario: Number(ficha.precoVenda), custoUnitario: custoFicha, notas: item.notas ?? null, destino: destinoDeFicha(ficha) }
      }))

      return tx.pedido.create({
        data: {
          canal: canalVal,
          mesaId: mesaId ?? null,
          abaId: abaId ?? null,
          garconId: session.sub, // garçom responsável = quem lançou
          identificadorCliente: (!mesaId && !abaId) ? (identificadorCliente || 'Balcão') : null,
          userId: session.sub,
          estado: 'PENDENTE',
          itens: { create: itensComPreco },
        },
        include: {
          itens: { include: { produto: true, fichaTecnica: true } },
          mesa: true, aba: true,
          garcom: { select: { id: true, nome: true } },
          user: { select: { nome: true } },
        },
      })
    })

    // Notificar o KDS em tempo real — o cartão aparece na cozinha
    // sem que o cozinheiro precise de atualizar o ecrã.
    notifyKDSClients({ tipo: 'NOVO_PEDIDO', pedido })

    return NextResponse.json({ ok: true, pedido }, { status: 201 })
  } catch (error: unknown) {
    const status = error instanceof CanalNaoAutorizadoError ? 403 : 400
    const mensagem = error instanceof Error ? error.message : 'Erro ao criar pedido'
    console.error('Erro ao criar pedido:', error)
    return NextResponse.json({ erro: mensagem }, { status })
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const canal = searchParams.get('canal')
  const estado = searchParams.get('estado')
  // Suporta lista de estados: ?estados=PENDENTE,EM_PREPARACAO,PRONTO (KDS)
  const estados = searchParams.get('estados')?.split(',').filter(Boolean) as EstadoPedido[] | undefined

  // ?volantes=true → só pedidos sem mesa nem aba (clientes de pé/balcão)
  const apenasVolantes = searchParams.get('volantes') === 'true'

  // ?destino=COZINHA|BAR → só pedidos com itens dessa secção (KDS/BDS)
  const destinoParam = searchParams.get('destino')
  const destino = destinoParam && ['COZINHA', 'BAR'].includes(destinoParam)
    ? (destinoParam as DestinoPreparo)
    : undefined

  const permitidos = canaisPermitidos(session)
  if (canal && !permitidos.includes(canal as CanalVenda)) {
    return NextResponse.json({ erro: `Sem acesso ao canal ${canal}` }, { status: 403 })
  }

  const pedidos = await prisma.pedido.findMany({
    where: {
      canal: canal ? (canal as CanalVenda) : { in: permitidos },
      estado: estados?.length ? { in: estados } : estado ? (estado as EstadoPedido) : undefined,
      ...(apenasVolantes ? { mesaId: null, abaId: null } : {}),
      ...(destino ? { itens: { some: { destino } } } : {}),
    },
    include: {
      itens: { include: { produto: true, fichaTecnica: true } },
      mesa: true,
      aba: true,
      garcom: { select: { id: true, nome: true } },
      user: { select: { nome: true } },
    },
    orderBy: { criadoEm: 'asc' },
  })

  return NextResponse.json(pedidos)
}
