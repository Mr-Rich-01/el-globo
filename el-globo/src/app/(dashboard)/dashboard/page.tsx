import { getSession, canaisPermitidos } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { DashboardClient } from './DashboardClient'
import { startOfDay, startOfMonth, endOfDay } from 'date-fns'
import { linhasStockBaixo } from '@/lib/stock-baixo'

async function contarAlertasStock(): Promise<number> {
  return (await linhasStockBaixo()).length
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const hoje = new Date()
  const inicioHoje = startOfDay(hoje)
  const fimHoje = endOfDay(hoje)
  const inicioMes = startOfMonth(hoje)

  // Cada gestor só vê a faturação dos SEUS canais (o ADMIN vê tudo)
  const permitidos = canaisPermitidos(session)

  // Estatísticas de hoje
  const [vendasHoje, vendasMes, mesasStats, abasAbertas, stockAlertas] = await Promise.all([
    // Vendas de hoje por canal
    prisma.venda.groupBy({
      by: ['canal'],
      where: { criadoEm: { gte: inicioHoje, lte: fimHoje }, estado: 'PAGA', canal: { in: permitidos } },
      _sum: { total: true },
      _count: { id: true },
    }),

    // Vendas do mês
    prisma.venda.aggregate({
      where: { criadoEm: { gte: inicioMes }, estado: 'PAGA', canal: { in: permitidos } },
      _sum: { total: true },
      _count: { id: true },
    }),

    // Estado das mesas
    prisma.mesa.groupBy({
      by: ['estado'],
      _count: { id: true },
    }),

    // Abas abertas na piscina
    prisma.aba.count({ where: { estado: 'ABERTA' } }),

    // Produtos/Canais com stock abaixo do mínimo (equivalente caixa+unidade)
    contarAlertasStock().catch(() => 0),
  ])

  // Faturação por hora (últimas 12h)
  const faturacaoPorHora = await prisma.venda.groupBy({
    by: ['criadoEm'],
    where: { criadoEm: { gte: inicioHoje }, estado: 'PAGA', canal: { in: permitidos } },
    _sum: { total: true },
  })

  // Top 5 produtos mais vendidos hoje
  const topProdutos = await prisma.itemVenda.groupBy({
    by: ['nomeProduto'],
    where: { venda: { criadoEm: { gte: inicioHoje }, estado: 'PAGA', canal: { in: permitidos } } },
    _sum: { quantidade: true, subtotal: true },
    orderBy: { _sum: { subtotal: 'desc' } },
    take: 5,
  })

  const totalHoje = vendasHoje.reduce((acc, v) => acc + Number(v._sum.total ?? 0), 0)
  const totalMes = Number(vendasMes._sum.total ?? 0)

  // Mapear por canal sem passar Decimals
  const getCanalSafe = (c: string) => {
    const v = vendasHoje.find(x => x.canal === c)
    return v ? { canal: v.canal, _sum: { total: Number(v._sum.total ?? 0) }, _count: { id: v._count.id } } : undefined
  }
  const porCanal = {
    RESTAURANTE: getCanalSafe('RESTAURANTE'),
    BOTTLESTORE: getCanalSafe('BOTTLESTORE'),
    PISCINA: getCanalSafe('PISCINA'),
  }

  // Limpar Decimals do topProdutos
  const topProdutosSafe = topProdutos.map(p => ({
    nomeProduto: p.nomeProduto,
    _sum: { 
      quantidade: p._sum.quantidade, 
      subtotal: Number(p._sum.subtotal ?? 0) 
    }
  }))

  return (
    <DashboardClient
      session={session}
      totalHoje={totalHoje}
      totalMes={totalMes}
      porCanal={porCanal as any}
      mesasStats={mesasStats}
      abasAbertas={abasAbertas}
      topProdutos={topProdutosSafe}
      nrTransacoesHoje={vendasHoje.reduce((acc, v) => acc + v._count.id, 0)}
      stockAlertas={stockAlertas}
    />
  )
}
