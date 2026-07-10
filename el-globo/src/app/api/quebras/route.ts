import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, canaisPermitidos, resolveCanal, CanalNaoAutorizadoError } from '@/lib/auth'
import { registarQuebraStock } from '@/lib/stock'
import { z } from 'zod'
import { CanalVenda } from '@prisma/client'

// Registo de quebras de stock (derrame, partido, validade, oferta…).
// Restrito a ADMIN/GERENTE; cada gestor só regista e vê quebras dos seus
// canais. O desconto de stock e a MovimentacaoStock SAIDA_QUEBRA são
// feitos em lib/stock.ts (registarQuebraStock), numa transação.

const QuebraSchema = z.object({
  produtoId: z.string().min(1),
  canal: z.enum(['RESTAURANTE', 'BOTTLESTORE', 'PISCINA']).optional(),
  quantidade: z.number().positive(),
  motivo: z.string().trim().min(1).max(120),
  notas: z.string().trim().max(500).optional().nullable(),
})

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'GERENTE'].includes(session.role)) {
    return NextResponse.json({ erro: 'Sem permissão para ver quebras' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const canal = searchParams.get('canal')

  const permitidos = canaisPermitidos(session)
  if (canal && !permitidos.includes(canal as CanalVenda)) {
    return NextResponse.json({ erro: `Sem acesso ao canal ${canal}` }, { status: 403 })
  }

  const quebras = await prisma.quebra.findMany({
    where: canal
      ? { canal: canal as CanalVenda }
      : {
          // Quebras antigas sem canal só aparecem ao ADMIN global
          OR: [
            { canal: { in: permitidos } },
            ...(session.role === 'ADMIN' ? [{ canal: null }] : []),
          ],
        },
    include: {
      produto: { select: { nome: true, sku: true, unidadeMedida: true } },
      user: { select: { nome: true } },
    },
    orderBy: { criadoEm: 'desc' },
    take: 100,
  })

  const mapped = quebras.map(q => ({
    id: q.id,
    produto: q.produto.nome,
    sku: q.produto.sku,
    unidadeMedida: q.produto.unidadeMedida,
    canal: q.canal,
    quantidade: Number(q.quantidade),
    motivo: q.motivo,
    notas: q.notas,
    user: q.user.nome,
    criadoEm: q.criadoEm.toISOString(),
  }))

  return NextResponse.json(mapped)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'GERENTE'].includes(session.role)) {
    return NextResponse.json({ erro: 'Sem permissão para registar quebras' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const parsed = QuebraSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })
    }

    // Canal validado contra a sessão — o gestor fica preso aos seus canais
    const canal = resolveCanal(session, parsed.data.canal)

    const quebra = await prisma.$transaction(tx =>
      registarQuebraStock(tx, {
        produtoId: parsed.data.produtoId,
        canal,
        quantidade: parsed.data.quantidade,
        motivo: parsed.data.motivo,
        notas: parsed.data.notas ?? null,
        userId: session.sub,
      })
    )

    return NextResponse.json({ ok: true, quebra }, { status: 201 })
  } catch (error: unknown) {
    const status = error instanceof CanalNaoAutorizadoError ? 403 : 400
    const mensagem = error instanceof Error ? error.message : 'Erro ao registar quebra'
    console.error('Erro ao registar quebra:', error)
    return NextResponse.json({ erro: mensagem }, { status })
  }
}
