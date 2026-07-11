import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, canaisPermitidos } from '@/lib/auth'
import { z } from 'zod'

// Criação de mesas do restaurante — apenas ADMIN/GERENTE com acesso ao
// canal RESTAURANTE. Se o número pertencer a uma mesa desativada (soft
// delete), a mesa é reativada em vez de criada (numero é @unique).

const MesaCreateSchema = z.object({
  numero: z.number().int().positive(),
  nome: z.string().trim().max(60).nullable().optional(),
  zona: z.string().trim().max(60).nullable().optional(),
  lugares: z.number().int().min(1).max(50).default(4),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || !['ADMIN', 'GERENTE'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  if (!canaisPermitidos(session).includes('RESTAURANTE')) {
    return NextResponse.json({ erro: 'Sem acesso ao canal RESTAURANTE' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const parsed = MesaCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })
    }

    const { numero, nome, zona, lugares } = parsed.data

    const existente = await prisma.mesa.findUnique({ where: { numero } })
    if (existente?.ativo) {
      return NextResponse.json({ erro: `A mesa nº ${numero} já existe` }, { status: 409 })
    }

    if (existente) {
      // Reativar mesa soft-deleted com o mesmo número
      const mesa = await prisma.mesa.update({
        where: { id: existente.id },
        data: { ativo: true, estado: 'LIVRE', nome: nome ?? null, zona: zona ?? null, lugares },
      })
      return NextResponse.json({ ok: true, mesa, reativada: true }, { status: 200 })
    }

    const mesa = await prisma.mesa.create({
      data: { numero, nome: nome ?? null, zona: zona ?? null, lugares },
    })
    return NextResponse.json({ ok: true, mesa }, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar mesa:', error)
    return NextResponse.json({ erro: 'Erro ao criar mesa' }, { status: 500 })
  }
}
