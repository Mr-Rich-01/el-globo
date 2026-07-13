import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, canaisPermitidos, CanalNaoAutorizadoError } from '@/lib/auth'
import { transferirStock, StockInsuficienteError } from '@/lib/stock'
import { z } from 'zod'
import { CanalVenda } from '@prisma/client'

// Transferência de stock entre canais. O ADMIN (dono, compra centralizada)
// transfere entre quaisquer canais; o GERENTE só entre os canais dele
// (ex.: Restaurante ↔ Piscina) — nunca para fora.

const TransferirSchema = z.object({
  produtoId: z.string().min(1),
  canalOrigem: z.enum(['RESTAURANTE', 'BOTTLESTORE', 'PISCINA']),
  canalDestino: z.enum(['RESTAURANTE', 'BOTTLESTORE', 'PISCINA']),
  quantidade: z.number().positive(),
  precoVendaDestino: z.number().min(0).optional(),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || !['ADMIN', 'GERENTE', 'GESTOR_STOCK'].includes(session.role)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = TransferirSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ erro: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 })
    }

    const { produtoId, canalOrigem, canalDestino, quantidade, precoVendaDestino } = parsed.data

    if (canalOrigem === canalDestino) {
      return NextResponse.json({ erro: 'O canal de origem e o de destino têm de ser diferentes' }, { status: 400 })
    }

    // ADMIN pode tudo; GERENTE só transfere DENTRO dos seus canais.
    const permitidos = canaisPermitidos(session)
    for (const canal of [canalOrigem, canalDestino] as CanalVenda[]) {
      if (!permitidos.includes(canal)) {
        return NextResponse.json({ erro: `Sem acesso ao canal ${canal}` }, { status: 403 })
      }
    }

    await prisma.$transaction(async (tx) => {
      await transferirStock(tx, {
        produtoId,
        canalOrigem: canalOrigem as CanalVenda,
        canalDestino: canalDestino as CanalVenda,
        quantidade,
        userId: session.sub,
        referencia: 'transferencia-manual',
        precoVendaDestino,
      })
    })

    return NextResponse.json({
      ok: true,
      mensagem: `${quantidade} transferido(s) de ${canalOrigem} para ${canalDestino}`,
    })
  } catch (error: unknown) {
    const status =
      error instanceof CanalNaoAutorizadoError ? 403 :
      error instanceof StockInsuficienteError ? 400 : 400
    const mensagem = error instanceof Error ? error.message : 'Erro ao transferir stock'
    console.error('Erro ao transferir stock:', error)
    return NextResponse.json({ erro: mensagem }, { status })
  }
}
