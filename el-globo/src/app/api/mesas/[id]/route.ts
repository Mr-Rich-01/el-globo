import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, canaisPermitidos } from '@/lib/auth'
import { z } from 'zod'

// Edição e remoção de mesas — apenas ADMIN/GERENTE do canal RESTAURANTE.
// Remoção: mesa com histórico de pedidos/vendas é desativada (soft delete,
// preserva relatórios); sem histórico é apagada de vez.

const MesaUpdateSchema = z.object({
  numero: z.number().int().positive().optional(),
  nome: z.string().trim().max(60).nullable().optional(),
  zona: z.string().trim().max(60).nullable().optional(),
  lugares: z.number().int().min(1).max(50).optional(),
})

function autorizar(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session || !['ADMIN', 'GERENTE'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  if (!canaisPermitidos(session).includes('RESTAURANTE')) {
    return NextResponse.json({ erro: 'Sem acesso ao canal RESTAURANTE' }, { status: 403 })
  }
  return null
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  const bloqueio = autorizar(session)
  if (bloqueio) return bloqueio

  const { id } = await params

  try {
    const body = await request.json()
    const parsed = MesaUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })
    }

    if (parsed.data.numero != null) {
      const existente = await prisma.mesa.findUnique({ where: { numero: parsed.data.numero } })
      if (existente && existente.id !== id) {
        return NextResponse.json({ erro: `A mesa nº ${parsed.data.numero} já existe` }, { status: 409 })
      }
    }

    const mesa = await prisma.mesa.update({ where: { id }, data: parsed.data })
    return NextResponse.json({ ok: true, mesa })
  } catch (error) {
    console.error('Erro ao atualizar mesa:', error)
    return NextResponse.json({ erro: 'Erro ao atualizar mesa' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  const bloqueio = autorizar(session)
  if (bloqueio) return bloqueio

  const { id } = await params

  try {
    const mesa = await prisma.mesa.findUnique({
      where: { id },
      include: {
        _count: { select: { pedidos: true, vendas: true } },
        pedidos: {
          // Pedidos por faturar (não cancelados e sem venda) travam a remoção
          where: { estado: { not: 'CANCELADO' }, vendaId: null },
          select: { id: true },
          take: 1,
        },
      },
    })
    if (!mesa || !mesa.ativo) {
      return NextResponse.json({ erro: 'Mesa não encontrada' }, { status: 404 })
    }
    if (mesa.estado !== 'LIVRE') {
      return NextResponse.json({ erro: 'A mesa está em uso — feche a conta primeiro' }, { status: 409 })
    }
    if (mesa.pedidos.length > 0) {
      return NextResponse.json({ erro: 'A mesa tem pedidos por faturar — feche-os primeiro' }, { status: 409 })
    }

    if (mesa._count.pedidos > 0 || mesa._count.vendas > 0) {
      // Histórico existente: desativar preserva relatórios e vendas antigas
      await prisma.mesa.update({ where: { id }, data: { ativo: false } })
      return NextResponse.json({ ok: true, mensagem: `Mesa ${mesa.numero} desativada (tinha histórico de vendas)` })
    }

    await prisma.mesa.delete({ where: { id } })
    return NextResponse.json({ ok: true, mensagem: `Mesa ${mesa.numero} apagada` })
  } catch (error) {
    console.error('Erro ao apagar mesa:', error)
    return NextResponse.json({ erro: 'Erro ao apagar mesa' }, { status: 500 })
  }
}
