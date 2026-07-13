import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { z } from 'zod'

const FichaTecnicaSchema = z.object({
  nome: z.string().min(1),
  descricao: z.string().optional().nullable(),
  produtoId: z.string().optional().nullable(),
  precoVenda: z.number().min(0),
  ativo: z.boolean().default(true),
  ingredientes: z.array(z.object({
    produtoId: z.string().min(1),
    quantidade: z.number().min(0.0001),
    unidade: z.enum(['UNIDADE', 'LITRO', 'MILILITRO', 'KG', 'GRAMA', 'PORCAO'])
  })).min(1)
})

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const ativo = searchParams.get('ativo')

  const where: Record<string, unknown> = {}
  if (ativo !== null) where.ativo = ativo === 'true'

  const fichas = await prisma.fichaTecnica.findMany({
    where,
    include: {
      produto: true,
      ingredientes: {
        include: { produto: true }
      }
    },
    orderBy: { nome: 'asc' },
  })

  return NextResponse.json(fichas)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || !['ADMIN', 'GERENTE', 'GESTOR_STOCK'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = FichaTecnicaSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })

    // Um produto final só pode ter UMA receita ativa — a dedução automática
    // de ingredientes na venda usa a ficha associada e tem de ser inequívoca.
    if (parsed.data.produtoId && parsed.data.ativo) {
      const fichaExistente = await prisma.fichaTecnica.findFirst({
        where: { produtoId: parsed.data.produtoId, ativo: true },
      })
      if (fichaExistente) {
        return NextResponse.json(
          { erro: `O produto já tem a receita ativa "${fichaExistente.nome}" — desative-a primeiro` },
          { status: 409 }
        )
      }
    }

    const ficha = await prisma.fichaTecnica.create({
      data: {
        nome: parsed.data.nome,
        descricao: parsed.data.descricao,
        produtoId: parsed.data.produtoId,
        precoVenda: parsed.data.precoVenda,
        ativo: parsed.data.ativo,
        ingredientes: {
          create: parsed.data.ingredientes.map(i => ({
            produtoId: i.produtoId,
            quantidade: i.quantidade,
            unidade: i.unidade
          }))
        }
      },
      include: { ingredientes: true }
    })

    return NextResponse.json({ ok: true, ficha }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ erro: 'Erro ao criar ficha técnica' }, { status: 500 })
  }
}
