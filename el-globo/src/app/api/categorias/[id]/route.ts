import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { z } from 'zod'

// Edição e remoção de categorias — ADMIN/GERENTE.
// Remoção: bloqueada se a categoria (ou qualquer subcategoria) tiver
// produtos; subcategorias vazias são apagadas em cascata (hard delete —
// sem produtos não há FKs em risco).

const CategoriaUpdateSchema = z.object({
  nome: z.string().trim().min(1).max(60).optional(),
  tipo: z.enum(['BEBIDA_ALCOOLICA', 'BEBIDA_NAO_ALCOOLICA', 'COMIDA', 'TABACO', 'SNACK', 'OUTRO']).optional(),
  icone: z.string().trim().max(40).nullable().optional(),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  ordem: z.number().int().min(0).optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !['ADMIN', 'GERENTE', 'GESTOR_STOCK'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const parsed = CategoriaUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })
    }

    const categoria = await prisma.categoria.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ ok: true, categoria })
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error)
    return NextResponse.json({ erro: 'Erro ao atualizar categoria' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !['ADMIN', 'GERENTE', 'GESTOR_STOCK'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params

  try {
    const categoria = await prisma.categoria.findUnique({
      where: { id },
      include: {
        _count: { select: { produtos: true } },
        subcategorias: {
          select: { id: true, nome: true, _count: { select: { produtos: true } } },
        },
      },
    })
    if (!categoria) {
      return NextResponse.json({ erro: 'Categoria não encontrada' }, { status: 404 })
    }

    if (categoria._count.produtos > 0) {
      return NextResponse.json(
        { erro: `"${categoria.nome}" tem ${categoria._count.produtos} produto(s) vinculado(s) — mova-os para outra categoria primeiro` },
        { status: 409 }
      )
    }
    const subComProdutos = categoria.subcategorias.filter(s => s._count.produtos > 0)
    if (subComProdutos.length > 0) {
      const nomes = subComProdutos.map(s => `"${s.nome}" (${s._count.produtos})`).join(', ')
      return NextResponse.json(
        { erro: `Subcategorias com produtos vinculados: ${nomes} — mova os produtos primeiro` },
        { status: 409 }
      )
    }

    await prisma.$transaction([
      // Subcategorias vazias caem em cascata com o grupo
      prisma.categoria.deleteMany({ where: { parentCategoryId: id } }),
      prisma.categoria.delete({ where: { id } }),
    ])

    return NextResponse.json({
      ok: true,
      mensagem: categoria.subcategorias.length > 0
        ? `"${categoria.nome}" e ${categoria.subcategorias.length} subcategoria(s) vazia(s) apagadas`
        : `"${categoria.nome}" apagada`,
    })
  } catch (error) {
    console.error('Erro ao apagar categoria:', error)
    return NextResponse.json({ erro: 'Erro ao apagar categoria' }, { status: 500 })
  }
}
