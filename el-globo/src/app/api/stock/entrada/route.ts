import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, resolveCanal, CanalNaoAutorizadoError } from '@/lib/auth'
import { registarEntradaStock } from '@/lib/stock'
import { z } from 'zod'

// Entrada MANUAL de stock (receção de compra / reposição rápida) —
// soma à quantidade existente e fica no ledger como ENTRADA_COMPRA.
// GERENTE só regista entradas nos seus canais.

const EntradaSchema = z.object({
  produtoId: z.string().min(1),
  quantidade: z.number().positive(),
  canal: z.enum(['RESTAURANTE', 'BOTTLESTORE', 'PISCINA']).optional(),
  precoCusto: z.number().min(0).optional(),
  notas: z.string().max(500).optional(),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || !['ADMIN', 'GERENTE', 'GESTOR_STOCK'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = EntradaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })
    }

    const { produtoId, quantidade, precoCusto, notas } = parsed.data
    // Nunca confiar no canal do body para não-admins
    const canal = resolveCanal(session, parsed.data.canal)

    const produto = await prisma.produto.findUnique({ where: { id: produtoId } })
    if (!produto) {
      return NextResponse.json({ erro: 'Produto não encontrado' }, { status: 404 })
    }

    const { stockDepois } = await prisma.$transaction(async (tx) =>
      registarEntradaStock(tx, {
        produtoId,
        canal,
        quantidade,
        precoCusto: precoCusto ?? null,
        notas: notas || null,
        userId: session.sub,
      })
    )

    return NextResponse.json({
      ok: true,
      mensagem: `Entrada de ${quantidade} × ${produto.nome} registada — novo stock: ${stockDepois}`,
      stockDepois,
    })
  } catch (error: unknown) {
    const status = error instanceof CanalNaoAutorizadoError ? 403 : 400
    const mensagem = error instanceof Error ? error.message : 'Erro ao registar entrada'
    console.error('Erro ao registar entrada de stock:', error)
    return NextResponse.json({ erro: mensagem }, { status })
  }
}
