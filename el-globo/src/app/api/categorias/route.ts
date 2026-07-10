import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

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
