import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, hasPermission, canaisPermitidos } from '@/lib/auth'
import { CanalVenda, Prisma } from '@prisma/client'
import { startOfDay, endOfDay, startOfMonth, parseISO, isValid } from 'date-fns'
import { MOTIVOS, isMotivoKey, isEntrada, motivoDoTipo } from '@/lib/stock-tipos'

// Histórico paginado do ledger de stock (movimentacoes_stock).
// Filtros: dataInicio / dataFim (yyyy-MM-dd), canal, motivo, produto (nome), page, limit.
// RBAC: mesmo modelo dos relatórios — canal alheio devolve 403; sem canal,
// vê os canais permitidos + movimentos sem canal (ex.: entradas de armazém,
// ajustes globais). Ao contrário das quebras nos relatórios (canal null só
// para ADMIN), aqui o ledger completo é visível a quem tem relatorios:view.

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  if (!hasPermission(session.role, 'relatorios:view')) {
    return NextResponse.json({ erro: 'Sem permissão para ver relatórios' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const canalParam = searchParams.get('canal')
  const motivoParam = searchParams.get('motivo')
  const produtoQ = searchParams.get('produto')?.trim() ?? ''

  const permitidos = canaisPermitidos(session)
  if (canalParam && !permitidos.includes(canalParam as CanalVenda)) {
    return NextResponse.json({ erro: `Sem acesso ao canal ${canalParam}` }, { status: 403 })
  }
  if (motivoParam && !isMotivoKey(motivoParam)) {
    return NextResponse.json({ erro: `Motivo inválido: ${motivoParam}` }, { status: 400 })
  }

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25') || 25))

  const hoje = new Date()
  const parseData = (valor: string | null): Date | null => {
    if (!valor) return null
    const d = parseISO(valor)
    return isValid(d) ? d : null
  }
  const dataInicio = startOfDay(parseData(searchParams.get('dataInicio')) ?? startOfMonth(hoje))
  const dataFim = endOfDay(parseData(searchParams.get('dataFim')) ?? hoje)

  const filtroCanal = canalParam
    ? { canal: canalParam as CanalVenda }
    : { OR: [{ canal: { in: permitidos } }, { canal: null }] }

  const where: Prisma.MovimentacaoStockWhereInput = {
    criadoEm: { gte: dataInicio, lte: dataFim },
    ...filtroCanal,
    ...(motivoParam ? { tipo: { in: [...MOTIVOS[motivoParam as keyof typeof MOTIVOS].tipos] } } : {}),
    ...(produtoQ ? { produto: { nome: { contains: produtoQ, mode: 'insensitive' } } } : {}),
  }

  const [total, movs] = await Promise.all([
    prisma.movimentacaoStock.count({ where }),
    prisma.movimentacaoStock.findMany({
      where,
      include: {
        produto: { select: { nome: true } },
        user: { select: { nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return NextResponse.json({
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    movimentacoes: movs.map(m => ({
      id: m.id,
      criadoEm: m.criadoEm.toISOString(),
      tipo: m.tipo,
      entrada: isEntrada(m.tipo),
      motivo: motivoDoTipo(m.tipo),
      produto: m.produto.nome,
      canal: m.canal,
      quantidade: Number(m.quantidade),
      stockAntes: Number(m.stockAntes),
      stockDepois: Number(m.stockDepois),
      referencia: m.referencia,
      notas: m.notas,
      user: m.user.nome,
    })),
  })
}
