'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, startOfMonth } from 'date-fns'
import { MOTIVOS, MotivoKey } from '@/lib/stock-tipos'

type Canal = 'RESTAURANTE' | 'BOTTLESTORE' | 'PISCINA'
const CANAL_INFO: Record<Canal, { label: string; icone: string }> = {
  RESTAURANTE: { label: 'Restaurante', icone: '🍽️' },
  BOTTLESTORE: { label: 'Bottlestore', icone: '🛒' },
  PISCINA: { label: 'Piscina', icone: '🏊' },
}

type Movimentacao = {
  id: string
  criadoEm: string
  tipo: string
  entrada: boolean
  motivo: string
  produto: string
  canal: Canal | null
  quantidade: number
  stockAntes: number
  stockDepois: number
  referencia: string | null
  notas: string | null
  user: string
}

type RespostaStock = {
  page: number
  limit: number
  total: number
  totalPages: number
  movimentacoes: Movimentacao[]
}

const fmtQtd = (v: number) =>
  v.toLocaleString('pt-PT', { maximumFractionDigits: 3 })

const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })

interface Props {
  canais: Canal[]
}

export function StockTab({ canais }: Props) {
  const hoje = new Date()
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(hoje), 'yyyy-MM-dd'))
  const [dataFim, setDataFim] = useState(format(hoje, 'yyyy-MM-dd'))
  const [motivo, setMotivo] = useState<MotivoKey | ''>('')
  const [canal, setCanal] = useState<Canal | ''>('')
  const [produtoInput, setProdutoInput] = useState('')
  const [produtoQ, setProdutoQ] = useState('')
  const [page, setPage] = useState(1)
  const [dados, setDados] = useState<RespostaStock | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Debounce da pesquisa de produto — evita um fetch por tecla
  useEffect(() => {
    const t = setTimeout(() => {
      setProdutoQ(produtoInput.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [produtoInput])

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const params = new URLSearchParams({ dataInicio, dataFim, page: String(page) })
      if (motivo) params.set('motivo', motivo)
      if (canal) params.set('canal', canal)
      if (produtoQ) params.set('produto', produtoQ)
      const res = await fetch(`/api/relatorios/stock?${params}`)
      const data = await res.json()
      if (!res.ok) {
        setErro(data.erro ?? 'Erro ao carregar movimentos de stock')
        setDados(null)
        return
      }
      setDados(data)
    } catch {
      setErro('Erro de ligação — tente novamente')
    } finally {
      setLoading(false)
    }
  }, [dataInicio, dataFim, motivo, canal, produtoQ, page])

  // Agendado (não síncrono) — evita cascata de renders e absorve
  // mudanças rápidas de filtros num só fetch
  useEffect(() => {
    const t = setTimeout(carregar, 0)
    return () => clearTimeout(t)
  }, [carregar])

  return (
    <div>
      {/* ─── Filtros ─────────────────────────────────────── */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Data Início</label>
          <input className="input" type="date" value={dataInicio} max={dataFim} onChange={e => { setDataInicio(e.target.value); setPage(1) }} />
        </div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Data Fim</label>
          <input className="input" type="date" value={dataFim} min={dataInicio} onChange={e => { setDataFim(e.target.value); setPage(1) }} />
        </div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Motivo</label>
          <select className="input" value={motivo} onChange={e => { setMotivo(e.target.value as MotivoKey | ''); setPage(1) }}>
            <option value="">Todos</option>
            {Object.entries(MOTIVOS).map(([chave, m]) => (
              <option key={chave} value={chave}>{m.label}</option>
            ))}
          </select>
        </div>
        {canais.length > 1 && (
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Canal</label>
            <select className="input" value={canal} onChange={e => { setCanal(e.target.value as Canal | ''); setPage(1) }}>
              <option value="">Todos os meus canais</option>
              {canais.map(c => (
                <option key={c} value={c}>{CANAL_INFO[c].icone} {CANAL_INFO[c].label}</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ flex: '1 1 180px', maxWidth: '280px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Produto</label>
          <input
            className="input"
            placeholder="Pesquisar por nome..."
            value={produtoInput}
            onChange={e => setProdutoInput(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {erro && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '16px' }}>
          ⚠ {erro}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="spinner" /></div>
      ) : dados && (
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>📦 Movimentos de Stock</h3>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
            Histórico completo do ledger — entradas e saídas por venda, compra, quebra, ajuste, desmanche e transferência.
          </p>

          {dados.movimentacoes.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', padding: '20px 0' }}>
              Sem movimentos nos filtros selecionados.
            </p>
          ) : (
            <>
              <div className="table-scroll">
                <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border-strong)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 4px', fontWeight: 700 }}>Data</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700 }}>Movimento</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700 }}>Produto</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700, textAlign: 'right' }}>Qtd</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700, textAlign: 'right' }}>Stock</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700 }}>Canal</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700 }}>Utilizador</th>
                      <th style={{ padding: '8px 4px', fontWeight: 700 }}>Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.movimentacoes.map(m => (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px 4px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                          {fmtDataHora(m.criadoEm)}
                        </td>
                        <td style={{ padding: '8px 4px' }}>
                          <span className={`badge ${m.entrada ? 'badge-success' : 'badge-danger'}`}>
                            {m.entrada ? '▲' : '▼'} {m.motivo}
                          </span>
                        </td>
                        <td style={{ padding: '8px 4px', fontWeight: 600 }}>{m.produto}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: m.entrada ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {m.entrada ? '+' : '−'}{fmtQtd(m.quantidade)}
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                          {fmtQtd(m.stockAntes)} → <span style={{ fontWeight: 600, color: m.stockDepois < 0 ? 'var(--color-danger)' : 'var(--color-text-primary)' }}>{fmtQtd(m.stockDepois)}</span>
                        </td>
                        <td style={{ padding: '8px 4px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                          {m.canal ? CANAL_INFO[m.canal]?.label ?? m.canal : '—'}
                        </td>
                        <td style={{ padding: '8px 4px', color: 'var(--color-text-secondary)' }}>{m.user}</td>
                        <td style={{ padding: '8px 4px', maxWidth: '220px' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.notas ?? undefined}>
                            {m.notas ?? '—'}
                          </div>
                          {m.referencia && (
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.referencia}>
                              ref: {m.referencia}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ─── Paginação ─────────────────────────────── */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(p => p - 1)}
                >
                  ‹ Anterior
                </button>
                <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  Página {dados.page} de {dados.totalPages} · {dados.total} movimento{dados.total === 1 ? '' : 's'}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page >= dados.totalPages || loading}
                  onClick={() => setPage(p => p + 1)}
                >
                  Seguinte ›
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
