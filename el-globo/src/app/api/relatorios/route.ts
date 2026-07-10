import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, hasPermission, canaisPermitidos } from '@/lib/auth'
import { CanalVenda, Prisma } from '@prisma/client'
import { startOfDay, endOfDay, startOfMonth, parseISO, isValid, format } from 'date-fns'

// Relatórios BI para o Administrador e Gestores locais.
// Filtros: dataInicio / dataFim (yyyy-MM-dd), canal, operadorId.
// RBAC: cada gestor fica automaticamente preso aos seus canais —
// pedir um canal alheio devolve 403; sem canal, agrega só os permitidos.

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  if (!hasPermission(session.role, 'relatorios:view')) {
    return NextResponse.json({ erro: 'Sem permissão para ver relatórios' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const canalParam = searchParams.get('canal')
  const operadorId = searchParams.get('operadorId')

  const permitidos = canaisPermitidos(session)
  if (canalParam && !permitidos.includes(canalParam as CanalVenda)) {
    return NextResponse.json({ erro: `Sem acesso ao canal ${canalParam}` }, { status: 403 })
  }

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
    : { canal: { in: permitidos } }

  const whereVenda: Prisma.VendaWhereInput = {
    estado: 'PAGA',
    criadoEm: { gte: dataInicio, lte: dataFim },
    ...filtroCanal,
    ...(operadorId ? { userId: operadorId } : {}),
  }

  const [totais, porCanalRaw, porOperadorRaw, topProdutosRaw, vendasSerie, itensMargem, quebrasRaw, operadoresRaw] =
    await Promise.all([
      // KPIs globais do período
      prisma.venda.aggregate({
        where: whereVenda,
        _sum: { total: true, desconto: true },
        _count: { id: true },
      }),

      // Faturação por canal de venda
      prisma.venda.groupBy({
        by: ['canal'],
        where: whereVenda,
        _sum: { total: true },
        _count: { id: true },
      }),

      // Volume de vendas por operador/garçom (quem fechou a venda)
      prisma.venda.groupBy({
        by: ['userId'],
        where: whereVenda,
        _sum: { total: true },
        _count: { id: true },
        orderBy: { _sum: { total: 'desc' } },
      }),

      // Top produtos por faturação
      prisma.itemVenda.groupBy({
        by: ['nomeProduto'],
        where: { venda: whereVenda },
        _sum: { quantidade: true, subtotal: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take: 10,
      }),

      // Série temporal — agregada por dia em JS (o Prisma não agrupa por dia)
      prisma.venda.findMany({
        where: whereVenda,
        select: { criadoEm: true, total: true },
      }),

      // Margem real: snapshot de custo capturado no momento da venda
      prisma.itemVenda.findMany({
        where: { venda: whereVenda },
        select: { subtotal: true, custoUnitario: true, quantidade: true },
      }),

      // Histórico de quebras do período (mesmo scoping de canal)
      prisma.quebra.findMany({
        where: {
          criadoEm: { gte: dataInicio, lte: dataFim },
          ...(canalParam
            ? { canal: canalParam as CanalVenda }
            : {
                OR: [
                  { canal: { in: permitidos } },
                  ...(session.role === 'ADMIN' ? [{ canal: null }] : []),
                ],
              }),
        },
        include: {
          produto: { select: { nome: true } },
          user: { select: { nome: true } },
        },
        orderBy: { criadoEm: 'desc' },
        take: 100,
      }),

      // Operadores para o dropdown de filtro (globais + dos canais permitidos)
      prisma.user.findMany({
        where: {
          ativo: true,
          OR: [{ canal: { in: permitidos } }, { canal: null }],
        },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      }),
    ])

  // ── KPIs ──────────────────────────────────────────────────────
  const faturamentoTotal = Number(totais._sum.total ?? 0)
  const nrVendas = totais._count.id
  const ticketMedio = nrVendas > 0 ? faturamentoTotal / nrVendas : 0

  // Margem apenas sobre itens com custo conhecido; coberturaCusto diz ao
  // gestor que fração do faturamento tem custo registado (itens antigos
  // ou sem precoCusto ficam de fora do cálculo).
  let custoTotal = 0
  let faturamentoComCusto = 0
  let faturamentoItens = 0
  for (const item of itensMargem) {
    const sub = Number(item.subtotal)
    faturamentoItens += sub
    if (item.custoUnitario != null) {
      custoTotal += Number(item.custoUnitario) * item.quantidade
      faturamentoComCusto += sub
    }
  }
  const margemBruta = faturamentoComCusto - custoTotal
  const margemPercent = faturamentoComCusto > 0 ? (margemBruta / faturamentoComCusto) * 100 : null
  const coberturaCusto = faturamentoItens > 0 ? (faturamentoComCusto / faturamentoItens) * 100 : 0

  // ── Série diária ──────────────────────────────────────────────
  const porDia = new Map<string, { total: number; nrVendas: number }>()
  for (const v of vendasSerie) {
    const dia = format(v.criadoEm, 'yyyy-MM-dd')
    const atual = porDia.get(dia) ?? { total: 0, nrVendas: 0 }
    atual.total += Number(v.total)
    atual.nrVendas += 1
    porDia.set(dia, atual)
  }
  const serieDiaria = [...porDia.entries()]
    .map(([dia, v]) => ({ dia, total: Math.round(v.total * 100) / 100, nrVendas: v.nrVendas }))
    .sort((a, b) => a.dia.localeCompare(b.dia))

  // ── Nomes dos operadores ──────────────────────────────────────
  const idsOperadores = porOperadorRaw.map(o => o.userId)
  const nomes = await prisma.user.findMany({
    where: { id: { in: idsOperadores } },
    select: { id: true, nome: true },
  })
  const nomePorId = new Map(nomes.map(u => [u.id, u.nome]))

  return NextResponse.json({
    periodo: { dataInicio: format(dataInicio, 'yyyy-MM-dd'), dataFim: format(dataFim, 'yyyy-MM-dd') },
    kpis: {
      faturamentoTotal,
      nrVendas,
      ticketMedio: Math.round(ticketMedio * 100) / 100,
      descontoTotal: Number(totais._sum.desconto ?? 0),
      custoTotal: Math.round(custoTotal * 100) / 100,
      margemBruta: Math.round(margemBruta * 100) / 100,
      margemPercent: margemPercent != null ? Math.round(margemPercent * 10) / 10 : null,
      coberturaCusto: Math.round(coberturaCusto * 10) / 10,
      totalQuebras: quebrasRaw.length,
    },
    porCanal: porCanalRaw.map(c => ({
      canal: c.canal,
      total: Number(c._sum.total ?? 0),
      nrVendas: c._count.id,
    })),
    porOperador: porOperadorRaw.map(o => ({
      userId: o.userId,
      nome: nomePorId.get(o.userId) ?? '—',
      total: Number(o._sum.total ?? 0),
      nrVendas: o._count.id,
      ticketMedio: o._count.id > 0 ? Math.round((Number(o._sum.total ?? 0) / o._count.id) * 100) / 100 : 0,
    })),
    topProdutos: topProdutosRaw.map(p => ({
      nomeProduto: p.nomeProduto,
      quantidade: p._sum.quantidade ?? 0,
      total: Number(p._sum.subtotal ?? 0),
    })),
    serieDiaria,
    quebras: quebrasRaw.map(q => ({
      id: q.id,
      produto: q.produto.nome,
      canal: q.canal,
      quantidade: Number(q.quantidade),
      motivo: q.motivo,
      user: q.user.nome,
      criadoEm: q.criadoEm.toISOString(),
    })),
    operadores: operadoresRaw,
  })
}
