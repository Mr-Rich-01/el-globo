import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  try {
    const aba = await prisma.aba.update({
      where: { id },
      data: { estado: 'FECHADA', fechadaEm: new Date() },
    })
    return NextResponse.json({ ok: true, aba })
  } catch {
    return NextResponse.json({ erro: 'Aba não encontrada' }, { status: 404 })
  }
}
