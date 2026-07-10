import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { z } from 'zod'

const AbaSchema = z.object({
  identificador: z.string().min(1).max(50),
  nomeCliente: z.string().optional().nullable(),
  telefone: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const body = await request.json()
  const parsed = AbaSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 })

  // Verificar se já existe aba aberta com o mesmo identificador
  const existente = await prisma.aba.findFirst({
    where: { identificador: parsed.data.identificador, estado: 'ABERTA' },
  })

  if (existente) {
    return NextResponse.json({ erro: `Já existe uma aba aberta com o identificador "${parsed.data.identificador}"` }, { status: 409 })
  }

  const aba = await prisma.aba.create({ data: parsed.data })
  return NextResponse.json({ ok: true, aba }, { status: 201 })
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const estado = searchParams.get('estado') ?? 'ABERTA'

  const abas = await prisma.aba.findMany({
    where: { estado: estado as 'ABERTA' | 'FECHADA' },
    include: { pedidos: { include: { itens: { include: { produto: true } } } }, venda: true },
    orderBy: { abertaEm: 'asc' },
  })

  return NextResponse.json(abas)
}
