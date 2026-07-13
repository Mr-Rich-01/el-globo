'use client'

import { JWTPayload } from '@/lib/auth'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

interface Props {
  session: JWTPayload
  totalHoje: number
  totalMes: number
  porCanal: Record<string, { _sum: { total: unknown }; _count: { id: number } } | undefined>
  mesasStats: { estado: string; _count: { id: number } }[]
  abasAbertas: number
  topProdutos: { nomeProduto: string; _sum: { quantidade: number | null; subtotal: unknown } }[]
  nrTransacoesHoje: number
  stockAlertas: number
}

const CANAL_CONFIG = {
  RESTAURANTE: { label: 'Restaurante', icon: '🍽️', color: '#f59e0b' },
  BOTTLESTORE:  { label: 'Bottlestore', icon: '🛒', color: '#10b981' },
  PISCINA:      { label: 'Piscina',     icon: '🏊', color: '#3b82f6' },
}

function fmt(n: number) {
  return new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN', minimumFractionDigits: 2 }).format(n)
}

export function DashboardClient({
  session, totalHoje, totalMes, porCanal, mesasStats, abasAbertas, topProdutos, nrTransacoesHoje, stockAlertas
}: Props) {
  const pieData = Object.entries(CANAL_CONFIG).map(([canal, cfg]) => ({
    name: cfg.label,
    value: Number(porCanal[canal]?._sum?.total ?? 0),
    color: cfg.color,
    icon: cfg.icon,
  })).filter(d => d.value > 0)

  const mesaData = [
    { name: 'Livres', value: mesasStats.find(m => m.estado === 'LIVRE')?._count.id ?? 0, color: '#10b981' },
    { name: 'Ocupadas', value: mesasStats.find(m => m.estado === 'OCUPADA')?._count.id ?? 0, color: '#f59e0b' },
    { name: 'Conta', value: mesasStats.find(m => m.estado === 'CONTA_PEDIDA')?._count.id ?? 0, color: '#ef4444' },
  ]

  const topProdutosData = topProdutos.map(p => ({
    nome: p.nomeProduto.length > 18 ? p.nomeProduto.slice(0, 18) + '…' : p.nomeProduto,
    total: Number(p._sum.subtotal ?? 0),
  }))

  return (
    <div style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
          {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px' }}>
          Olá, {session.nome.split(' ')[0]} 👋
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: '4px' }}>
          Aqui está o resumo das operações de hoje.
        </p>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {/* Total Hoje */}
        <div className="metric-card" style={{ '--metric-color': 'var(--color-accent)' } as React.CSSProperties}>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            💰 Faturação Hoje
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px' }} className="gradient-text">
            {fmt(totalHoje)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
            {nrTransacoesHoje} transações
          </div>
        </div>

        {/* Total Mês */}
        <div className="metric-card" style={{ '--metric-color': '#10b981' } as React.CSSProperties}>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            📅 Faturação do Mês
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--color-success)' }}>
            {fmt(totalMes)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
            {format(new Date(), 'MMMM yyyy', { locale: ptBR })}
          </div>
        </div>

        {/* Canais hoje */}
        {Object.entries(CANAL_CONFIG).map(([canal, cfg]) => (
          <div key={canal} className="metric-card" style={{ '--metric-color': cfg.color } as React.CSSProperties}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
              {cfg.icon} {cfg.label}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px', color: cfg.color }}>
              {fmt(Number(porCanal[canal]?._sum?.total ?? 0))}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
              {porCanal[canal]?._count?.id ?? 0} vendas
            </div>
          </div>
        ))}

        {/* Abas Piscina */}
        <div className="metric-card" style={{ '--metric-color': '#3b82f6' } as React.CSSProperties}>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            🏊 Abas Abertas
          </div>
          <div style={{ fontSize: '48px', fontWeight: 800, color: 'var(--color-info)' }}>
            {abasAbertas}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
            clientes na piscina
          </div>
        </div>

        {/* Alertas de Stock (equivalente caixa+unidade) */}
        <div className="metric-card" style={{ '--metric-color': stockAlertas > 0 ? '#ef4444' : '#10b981' } as React.CSSProperties}>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            ⚠️ Stock Baixo
          </div>
          <div style={{ fontSize: '48px', fontWeight: 800, color: stockAlertas > 0 ? 'var(--color-danger, #ef4444)' : 'var(--color-success, #10b981)' }}>
            {stockAlertas}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
            {stockAlertas === 1 ? 'linha de stock abaixo do mínimo' : 'linhas de stock abaixo do mínimo'}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '24px' }}>
        {/* Top Produtos */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Top Produtos Hoje</h3>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>Por faturação</p>
          {topProdutosData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProdutosData} margin={{ left: -10 }}>
                <XAxis dataKey="nome" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f5f9' }}
                  formatter={(v: unknown) => [fmt(Number(v ?? 0)), 'Total']}
                />
                <Bar dataKey="total" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
              Sem vendas hoje ainda
            </div>
          )}
        </div>

        {/* Faturação por Canal */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Por Canal</h3>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>Distribuição de hoje</p>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f5f9' }}
                  formatter={(v: unknown) => [fmt(Number(v ?? 0)), '']}
                />
                <Legend formatter={(value) => <span style={{ color: '#94a3b8', fontSize: '12px' }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
              Sem dados
            </div>
          )}
        </div>
      </div>

      {/* Mesas Status */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Estado das Mesas</h3>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {mesaData.map(({ name, value, color }) => (
            <div key={name} style={{
              flex: 1, minWidth: '120px', padding: '16px',
              background: `${color}15`, border: `1px solid ${color}40`,
              borderRadius: '10px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '32px', fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>{name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
