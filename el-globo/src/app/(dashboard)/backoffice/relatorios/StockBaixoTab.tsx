'use client'

import { useState, useEffect, useCallback } from 'react'

type Canal = 'RESTAURANTE' | 'BOTTLESTORE' | 'PISCINA'
const CANAL_INFO: Record<Canal, { label: string; icone: string }> = {
  RESTAURANTE: { label: 'Restaurante', icone: '🍽️' },
  BOTTLESTORE: { label: 'Bottlestore', icone: '🛒' },
  PISCINA: { label: 'Piscina', icone: '🏊' },
}

type LinhaStockBaixo = {
  produtoId: string
  produto: string
  canal: Canal
  stockAtual: number
  stockEquivalente: number
  stockMinimo: number
  diferenca: number
}

const fmtQtd = (v: number) =>
  v.toLocaleString('pt-PT', { maximumFractionDigits: 3 })

interface Props {
  canais: Canal[]
}

export function StockBaixoTab({ canais }: Props) {
  const [canal, setCanal] = useState<Canal | ''>('')
  const [linhas, setLinhas] = useState<LinhaStockBaixo[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const params = new URLSearchParams()
      if (canal) params.set('canal', canal)
      const res = await fetch(`/api/relatorios/stock-baixo?${params}`)
      const data = await res.json()
      if (!res.ok) {
        setErro(data.erro ?? 'Erro ao carregar stock baixo')
        setLinhas(null)
        return
      }
      setLinhas(data.linhas)
    } catch {
      setErro('Erro de ligação — tente novamente')
    } finally {
      setLoading(false)
    }
  }, [canal])

  useEffect(() => {
    const t = setTimeout(carregar, 0)
    return () => clearTimeout(t)
  }, [carregar])

  return (
    <div>
      {canais.length > 1 && (
        <div className="card" style={{ padding: '16px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Canal</label>
            <select className="input" value={canal} onChange={e => setCanal(e.target.value as Canal | '')}>
              <option value="">Todos os meus canais</option>
              {canais.map(c => (
                <option key={c} value={c}>{CANAL_INFO[c].icone} {CANAL_INFO[c].label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {erro && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '16px' }}>
          ⚠ {erro}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="spinner" /></div>
      ) : linhas && (
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>⚠️ Produtos com Stock Baixo</h3>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
            Produtos com stock atual (equivalente caixa/unidade) igual ou abaixo do mínimo definido — os mais críticos primeiro.
          </p>

          {linhas.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', padding: '20px 0' }}>
              Nenhum produto abaixo do stock mínimo. 👍
            </p>
          ) : (
            <div className="table-scroll">
              <table style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-strong)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 4px', fontWeight: 700 }}>Produto</th>
                    <th style={{ padding: '8px 4px', fontWeight: 700 }}>Canal</th>
                    <th style={{ padding: '8px 4px', fontWeight: 700, textAlign: 'right' }}>Stock (equiv.)</th>
                    <th style={{ padding: '8px 4px', fontWeight: 700, textAlign: 'right' }}>Mínimo</th>
                    <th style={{ padding: '8px 4px', fontWeight: 700, textAlign: 'right' }}>Falta</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(l => (
                    <tr key={`${l.produtoId}-${l.canal}`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '8px 4px', fontWeight: 600 }}>
                        {l.produto}
                        {l.stockEquivalente <= 0 && (
                          <span className="badge badge-danger" style={{ marginLeft: '8px' }}>Esgotado</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 4px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                        {CANAL_INFO[l.canal]?.label ?? l.canal}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: l.stockEquivalente <= 0 ? 'var(--color-danger)' : 'var(--color-text-primary)' }}>
                        {fmtQtd(l.stockEquivalente)}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                        {fmtQtd(l.stockMinimo)}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--color-danger)' }}>
                        {l.diferenca > 0 ? `−${fmtQtd(l.diferenca)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
