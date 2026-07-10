import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const mesa = await prisma.mesa.update({
      where: { id },
      data: { estado: 'OCUPADA' },
    })
    return NextResponse.json({ ok: true, mesa })
  } catch {
    return NextResponse.json({ erro: 'Mesa não encontrada' }, { status: 404 })
  }
}
