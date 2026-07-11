import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { CategoriasClient } from './CategoriasClient'

export const metadata = {
  title: 'Categorias - EL Globo',
}

export default async function CategoriasPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['ADMIN', 'GERENTE'].includes(session.role)) redirect('/stock/produtos')

  const categorias = await prisma.categoria.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    include: { _count: { select: { produtos: true } } },
  })

  return (
    <CategoriasClient
      categorias={categorias.map(c => ({
        id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        icone: c.icone,
        cor: c.cor,
        ordem: c.ordem,
        parentCategoryId: c.parentCategoryId,
        nrProdutos: c._count.produtos,
      }))}
    />
  )
}
