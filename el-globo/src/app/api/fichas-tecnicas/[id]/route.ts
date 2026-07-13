import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !['ADMIN', 'GESTOR_STOCK'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params

  try {
    // Soft delete
    await prisma.fichaTecnica.update({
      where: { id },
      data: { ativo: false },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ erro: 'Erro ao apagar ficha técnica' }, { status: 500 })
  }
}
