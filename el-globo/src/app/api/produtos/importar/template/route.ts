import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { construirTemplate } from '@/lib/importacao-produtos'

// Template Excel de importação de produtos, gerado na hora para que os
// dropdowns de categoria reflitam sempre as categorias reais da BD.
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ erro: 'Apenas o administrador pode importar produtos' }, { status: 401 })
  }

  const categorias = await prisma.categoria.findMany({
    where: { ativo: true },
    select: { nome: true },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
  })

  const wb = construirTemplate(categorias.map(c => c.nome))
  const buffer = await wb.xlsx.writeBuffer()

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="importacao-produtos.xlsx"',
    },
  })
}
