import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { z } from 'zod'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  // Lista achatada com parentCategoryId — os clientes montam a árvore
  // Pai → Subcategorias para os dropdowns/chips dependentes.
  const categorias = await prisma.categoria.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
  })

  return NextResponse.json(categorias)
}

// Criação de categorias (grupos) e subcategorias — ADMIN/GERENTE.
// A hierarquia é mantida a 2 níveis: o parent, se vier, tem de ser raiz.

const CategoriaCreateSchema = z.object({
  nome: z.string().trim().min(1).max(60),
  tipo: z.enum(['BEBIDA_ALCOOLICA', 'BEBIDA_NAO_ALCOOLICA', 'COMIDA', 'TABACO', 'SNACK', 'OUTRO']),
  parentCategoryId: z.string().nullable().optional(),
  icone: z.string().trim().max(40).nullable().optional(),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  ordem: z.number().int().min(0).optional(),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || !['ADMIN', 'GERENTE'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = CategoriaCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })
    }

    const { nome, tipo, parentCategoryId, icone, cor, ordem } = parsed.data

    if (parentCategoryId) {
      const parent = await prisma.categoria.findUnique({ where: { id: parentCategoryId } })
      if (!parent || !parent.ativo) {
        return NextResponse.json({ erro: 'Categoria pai não encontrada' }, { status: 404 })
      }
      if (parent.parentCategoryId) {
        return NextResponse.json({ erro: 'Só há dois níveis: uma subcategoria não pode ter subcategorias' }, { status: 400 })
      }
    }

    const duplicada = await prisma.categoria.findFirst({
      where: { nome: { equals: nome, mode: 'insensitive' }, parentCategoryId: parentCategoryId ?? null, ativo: true },
    })
    if (duplicada) {
      return NextResponse.json({ erro: `Já existe uma categoria "${nome}" nesse nível` }, { status: 409 })
    }

    const categoria = await prisma.categoria.create({
      data: {
        nome,
        tipo,
        parentCategoryId: parentCategoryId ?? null,
        icone: icone ?? null,
        cor: cor ?? null,
        ordem: ordem ?? 0,
      },
    })

    return NextResponse.json({ ok: true, categoria }, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar categoria:', error)
    return NextResponse.json({ erro: 'Erro ao criar categoria' }, { status: 500 })
  }
}
