'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, startOfMonth } from 'date-fns'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'

type Canal = 'RESTAURANTE' | 'BOTTLESTORE' | 'PISCINA'
const CANAL_INFO: Record<Canal, { label: string; icone: string; cor: string }> = {
  RESTAURANTE: { label: 'Restaurante', icone: '🍽️', cor: '#f59e0b' },
  BOTTLESTORE: { label: 'Bottlestore', icone: '🛒', cor: '#10b981' },
  PISCINA: { label: 'Piscina', icone: '🏊', cor: '#3b82f6' },
}

type Relatorio = {
  periodo: { dataInicio: string; dataFim: string }
  kpis: {
    faturamentoTotal: number
    nrVendas: number
    ticketMedio: number
    descontoTotal: number
    custoTotal: number
    margemBruta: number
    margemPercent: number | null
    coberturaCusto: number
    totalQuebras: number
  }
  porCanal: { canal: Canal; total: number; nrVendas: number }[]
  porOperador: { userId: string; nome: string; total: number; nrVendas: number; ticketMedio: number }[]
  topProdutos: { nomeProduto: string; quantidade: number; total: number }[]
  serieDiaria: { dia: string; total: number; nrVendas: number }[]
  quebras: { id: string; produto: string; canal: Canal | null; quantidade: number; motivo: string; user: string; criadoEm: string }[]
  operadores: { id: string; nome: string }[]
}

interface Props {
  canais: Canal[]
}

const fmtMT = (v: number) =>
  `MT ${v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Export CSV client-side: separador ';' e BOM para abrir direto no Excel
function exportarCSV(nome: string, cabecalho: string[], linhas: (string | number | null)[][]) {
  const escapar = (c: string | number | null) => {
    const s = c == null ? '' : String(c)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + [cabecalho, ...linhas].map(l => l.map(escapar).join(';')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nome}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function RelatoriosClient({ canais }: Props) {
  const hoje = new Date()
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(hoje), 'yyyy-MM-dd'))
  const [dataFim, setDataFim] = useState(format(hoje, 'yyyy-MM-dd'))
  const [canal, setCanal] = useState<Canal | ''>('')
  const [operadorId, setOperadorId] = useState('')
  const [dados, setDados] = useState<Relatorio | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const params = new URLSearchParams({ dataInicio, dataFim })
      if (canal) params.set('canal', canal)
      if (operadorId) params.set('operadorId', operadorId)
      const res = await fetch(`/api/relatorios?${params}`)
      const data = await res.json()
      if (!res.ok) {
        setErro(data.erro ?? 'Erro ao carregar relatório')
        setDados(null)
        return
      }
      setDados(data)
    } catch {
      setErro('Erro de ligação — tente novamente')
    } finally {
      setLoading(false)
    }
  }, [dataInicio, dataFim, canal, operadorId])

  useEffect(() => { carregar() }, [carregar])

  const kpis = dados?.kpis

  function exportarTudo() {
    if (!dados) return
    const periodo = `${dados.periodo.dataInicio}_a_${dados.periodo.dataFim}`
    exportarCSV(`relatorio-elglobo-${periodo}`,
      ['Secção', 'Chave', 'Valor 1', 'Valor 2', 'Valor 3'],
      [
        ['KPIs', 'Faturamento Total', dados.kpis.faturamentoTotal, '', ''],
        ['KPIs', 'Nº Vendas', dados.kpis.nrVendas, '', ''],
        ['KPIs', 'Ticket Médio', dados.kpis.ticketMedio, '', ''],
        ['KPIs', 'Custo Total (itens com custo)', dados.kpis.custoTotal, '', ''],
        ['KPIs', 'Margem Bruta', dados.kpis.margemBruta, dados.kpis.margemPercent != null ? `${dados.kpis.margemPercent}%` : 's/ dados', `cobertura ${dados.kpis.coberturaCusto}%`],
        ['KPIs', 'Descontos', dados.kpis.descontoTotal, '', ''],
        ['KPIs', 'Quebras no período', dados.kpis.totalQuebras, '', ''],
        ...dados.porCanal.map(c => ['Por Canal', c.canal, c.total, c.nrVendas, ''] as (string | number)[]),
        ...dados.porOperador.map(o => ['Por Operador', o.nome, o.total, o.nrVendas, o.ticketMedio] as (string | number)[]),
        ...dados.topProdutos.map(p => ['Top Produtos', p.nomeProduto, p.quantidade, p.total, ''] as (string | number)[]),
        ...dados.serieDiaria.map(s => ['Série Diária', s.dia, s.total, s.nrVendas, ''] as (string | number)[]),
        ...dados.quebras.map(q => ['Quebras', q.produto, q.quantidade, q.motivo, q.criadoEm.slice(0, 10)] as (string | number)[]),
      ])
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800 }}>📈 Relatórios & BI</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Análise histórica de faturação, margens, operadores e quebras — filtrada pelos seus canais.
          </p>
        </div>
        <button onClick={exportarTudo} disabled={!dados} className="btn btn-secondary">⬇️ Exportar CSV</button>
      </div>

      {/* ─── Filtros ─────────────────────────────────────── */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Data Início</label>
          <input className="input" type="date" value={dataInicio} max={dataFim} onChange={e => setDataInicio(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Data Fim</label>
          <input className="input" type="date" value={dataFim} min={dataInicio} onChange={e => setDataFim(e.target.value)} />
        </div>
        {canais.length > 1 && (
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Canal de Venda</label>
            <select className="input" value={canal} onChange={e => setCanal(e.target.value as Canal | '')}>
              <option value="">Todos os meus canais</option>
              {canais.map(c => (
                <option key={c} value={c}>{CANAL_INFO[c].icone} {CANAL_INFO[c].label}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Operador / Garçom</label>
          <select className="input" value={operadorId} onChange={e => setOperadorId(e.target.value)}>
            <option value="">Todos</option>
            {dados?.operadores.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
      </div>

      {erro && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '16px' }}>
          ⚠ {erro}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="spinner" /></div>
      ) : dados && kpis && (
        <>
          {/* ─── Cartões KPI ─────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div className="metric-card" style={{ '--metric-color': 'var(--color-accent)' } as React.CSSProperties}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>💰 Faturamento</div>
              <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-1px' }}>{fmtMT(kpis.faturamentoTotal)}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px' }}>{kpis.nrVendas} vendas no período</div>
            </div>
            <div className="metric-card" style={{ '--metric-color': '#3b82f6' } as React.CSSProperties}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>🎫 Ticket Médio</div>
              <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--color-info)' }}>{fmtMT(kpis.ticketMedio)}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px' }}>por venda/mesa/cliente</div>
            </div>
            <div className="metric-card" style={{ '--metric-color': '#10b981' } as React.CSSProperties}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>📊 Margem Bruta Real</div>
              <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--color-success, #10b981)' }}>
                {kpis.margemPercent != null ? `${kpis.margemPercent}%` : '—'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
                {fmtMT(kpis.margemBruta)} · custo conhecido em {kpis.coberturaCusto}% do faturamento
              </div>
            </div>
            <div className="metric-card" style={{ '--metric-color': kpis.totalQuebras > 0 ? '#ef4444' : '#10b981' } as React.CSSProperties}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>🗑️ Quebras</div>
              <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-1px', color: kpis.totalQuebras > 0 ? 'var(--color-danger)' : 'var(--color-success, #10b981)' }}>
                {kpis.totalQuebras}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px' }}>registos no período</div>
            </div>
          </div>

          {/* ─── Série temporal ──────────────────────────── */}
          <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>📅 Faturação ao Longo do Tempo</h3>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              {dados.periodo.dataInicio} → {dados.periodo.dataFim}
            </p>
            {dados.serieDiaria.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', padding: '20px 0' }}>Sem vendas no período selecionado.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dados.serieDiaria}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="dia" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f5f9' }}
                    formatter={(value, name) => name === 'total' ? [fmtMT(Number(value)), 'Faturação'] : [value, 'Vendas']}
                  />
                  <Line type="monotone" dataKey="total" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', marginBottom: '20px' }}>
            {/* ─── Por canal ─────────────────────────────── */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>🏪 Faturamento por Canal</h3>
              {dados.porCanal.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Sem dados.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dados.porCanal.map(c => ({ ...c, nome: CANAL_INFO[c.canal]?.label ?? c.canal }))}>
                    <XAxis dataKey="nome" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f5f9' }}
                      formatter={value => [fmtMT(Number(value)), 'Faturação']}
                    />
                    <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                      {dados.porCanal.map(c => (
                        <Cell key={c.canal} fill={CANAL_INFO[c.canal]?.cor ?? '#94a3b8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ─── Top produtos ──────────────────────────── */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>🏆 Top Produtos por Faturação</h3>
              {dados.topProdutos.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Sem dados.</p>
              ) : (
                <div className="table-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border-strong)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 4px', fontWeight: 700 }}>Produto</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700, textAlign: 'right' }}>Qtd</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700, textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.topProdutos.map(p => (
                      <tr key={p.nomeProduto} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px 4px', fontWeight: 600 }}>{p.nomeProduto}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{p.quantidade}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700, color: 'var(--color-accent)' }}>{fmtMT(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
            {/* ─── Por operador ──────────────────────────── */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>👤 Volume por Operador / Garçom</h3>
              {dados.porOperador.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Sem dados.</p>
              ) : (
                <div className="table-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border-strong)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 4px', fontWeight: 700 }}>Operador</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700, textAlign: 'right' }}>Vendas</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700, textAlign: 'right' }}>Ticket Médio</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700, textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.porOperador.map(o => (
                      <tr key={o.userId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px 4px', fontWeight: 600 }}>{o.nome}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{o.nrVendas}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{fmtMT(o.ticketMedio)}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700, color: 'var(--color-accent)' }}>{fmtMT(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* ─── Histórico de quebras ──────────────────── */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>🗑️ Histórico de Quebras</h3>
              {dados.quebras.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Sem quebras no período. 👍</p>
              ) : (
                <div className="table-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border-strong)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 4px', fontWeight: 700 }}>Produto</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700 }}>Motivo</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700, textAlign: 'right' }}>Qtd</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700 }}>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.quebras.map(q => (
                      <tr key={q.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px 4px', fontWeight: 600 }}>
                          {q.produto}
                          {q.canal && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}> · {CANAL_INFO[q.canal]?.label}</span>}
                        </td>
                        <td style={{ padding: '8px 4px' }}><span className="badge badge-warning">{q.motivo}</span></td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700, color: 'var(--color-danger)' }}>−{q.quantidade}</td>
                        <td style={{ padding: '8px 4px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                          {new Date(q.criadoEm).toLocaleDateString('pt-PT')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
