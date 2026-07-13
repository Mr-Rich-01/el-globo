'use client'

import { useState, useEffect, useCallback } from 'react'

type Canal = 'RESTAURANTE' | 'BOTTLESTORE' | 'PISCINA'
const CANAIS: { id: Canal; label: string; icone: string }[] = [
  { id: 'RESTAURANTE', label: 'Restaurante', icone: '🍽️' },
  { id: 'BOTTLESTORE', label: 'Bottlestore', icone: '🛒' },
  { id: 'PISCINA', label: 'Piscina', icone: '🏊' },
]

const MOTIVOS_SUGERIDOS = ['Derrame', 'Partido', 'Validade expirada', 'Oferta', 'Confeção falhada']

type Quebra = {
  id: string
  produto: string
  sku: string
  unidadeMedida: string
  canal: Canal | null
  quantidade: number
  motivo: string
  notas: string | null
  user: string
  criadoEm: string
}

type ProdutoGestao = {
  id: string
  nome: string
  sku: string
  isIngrediente: boolean
  stockCanais: { canal: Canal; stockAtual: number }[]
}

type FormState = { produtoId: string; canal: Canal; quantidade: string; motivo: string; notas: string }

interface Props {
  canais: Canal[]
}

export function QuebrasClient({ canais }: Props) {
  const [quebras, setQuebras] = useState<Quebra[]>([])
  const [produtos, setProdutos] = useState<ProdutoGestao[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroCanal, setFiltroCanal] = useState<Canal | ''>('')
  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm] = useState<FormState>({ produtoId: '', canal: canais[0], quantidade: '1', motivo: '', notas: '' })
  const [erro, setErro] = useState<string | null>(null)
  const [aGuardar, setAGuardar] = useState(false)
  const [sucesso, setSucesso] = useState<string | null>(null)

  const fetchQuebras = useCallback(async (canal: Canal | '') => {
    const res = await fetch(`/api/quebras${canal ? `?canal=${canal}` : ''}`)
    const data = await res.json()
    setQuebras(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        // Modo gestão: inclui ingredientes de preparação — as quebras de
        // matéria-prima (derrame de vodka, frango estragado) são desejáveis.
        const [, resProd] = await Promise.all([
          fetchQuebras(''),
          fetch('/api/produtos'),
        ])
        const prod = await resProd.json()
        setProdutos(Array.isArray(prod) ? prod : [])
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [fetchQuebras])

  function abrirModal() {
    setForm({ produtoId: '', canal: canais[0], quantidade: '1', motivo: '', notas: '' })
    setErro(null)
    setModalAberto(true)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setAGuardar(true)
    try {
      const res = await fetch('/api/quebras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produtoId: form.produtoId,
          canal: form.canal,
          quantidade: Number(form.quantidade),
          motivo: form.motivo.trim(),
          notas: form.notas.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErro(data.erro ?? 'Erro ao registar quebra')
        return
      }
      setModalAberto(false)
      setSucesso('Quebra registada — stock atualizado')
      setTimeout(() => setSucesso(null), 5000)
      fetchQuebras(filtroCanal)
    } catch {
      setErro('Erro de ligação — tente novamente')
    } finally {
      setAGuardar(false)
    }
  }

  const produtoSelecionado = produtos.find(p => p.id === form.produtoId)
  const stockNoCanal = produtoSelecionado?.stockCanais.find(s => s.canal === form.canal)
  // Só produtos com linha de stock no canal escolhido podem ter quebra nele
  const produtosDoCanal = produtos.filter(p => p.stockCanais.some(s => s.canal === form.canal))

  const canalCfg = (c: Canal | null) => CANAIS.find(x => x.id === c)

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800 }}>🗑️ Quebras de Stock</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Derrames, produtos partidos, validade expirada — cada registo desconta o stock do canal e fica no histórico de auditoria.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {canais.length > 1 && (
            <select
              className="input"
              style={{ width: 'auto' }}
              value={filtroCanal}
              onChange={e => {
                const c = e.target.value as Canal | ''
                setFiltroCanal(c)
                fetchQuebras(c)
              }}
            >
              <option value="">Todos os canais</option>
              {canais.map(c => {
                const cfg = canalCfg(c)!
                return <option key={c} value={c}>{cfg.icone} {cfg.label}</option>
              })}
            </select>
          )}
          <button onClick={abrirModal} className="btn btn-primary">+ Registar Quebra</button>
        </div>
      </div>

      {sucesso && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-success-muted, rgba(16,185,129,0.15))', color: 'var(--color-success, #10b981)', fontSize: '13px', marginBottom: '16px' }}>
          ✓ {sucesso}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="spinner" /></div>
      ) : quebras.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Sem quebras registadas{filtroCanal ? ' neste canal' : ''}.
        </div>
      ) : (
        <div className="card table-scroll">
          <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-strong)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Produto</th>
                <th style={{ padding: '12px 8px', fontWeight: 700 }}>Canal</th>
                <th style={{ padding: '12px 8px', fontWeight: 700, textAlign: 'right' }}>Quantidade</th>
                <th style={{ padding: '12px 8px', fontWeight: 700 }}>Motivo</th>
                <th style={{ padding: '12px 8px', fontWeight: 700 }}>Registado por</th>
                <th style={{ padding: '12px 8px', fontWeight: 700 }}>Data</th>
              </tr>
            </thead>
            <tbody>
              {quebras.map(q => {
                const cfg = canalCfg(q.canal)
                return (
                  <tr key={q.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{q.produto}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        {q.sku}{q.notas ? ` · ${q.notas}` : ''}
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      {cfg ? <span className="badge badge-info">{cfg.icone} {cfg.label}</span> : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--color-danger)' }}>
                      −{q.quantidade}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span className="badge badge-warning">{q.motivo}</span>
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--color-text-secondary)' }}>{q.user}</td>
                    <td style={{ padding: '10px 8px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(q.criadoEm).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Modal Registar Quebra ─────────────────────────── */}
      {modalAberto && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }} onClick={() => setModalAberto(false)}>
          <form
            onSubmit={guardar}
            onClick={e => e.stopPropagation()}
            className="card animate-fade-in"
            style={{ padding: '28px', maxWidth: '480px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>🗑️ Registar Quebra</h3>

            {canais.length > 1 && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Canal *</label>
                <select
                  className="input" required
                  value={form.canal}
                  onChange={e => setForm(f => ({ ...f, canal: e.target.value as Canal, produtoId: '' }))}
                >
                  {canais.map(c => {
                    const cfg = canalCfg(c)!
                    return <option key={c} value={c}>{cfg.icone} {cfg.label}</option>
                  })}
                </select>
              </div>
            )}

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Produto *</label>
              <select
                className="input" required
                value={form.produtoId}
                onChange={e => setForm(f => ({ ...f, produtoId: e.target.value }))}
              >
                <option value="">Selecionar produto...</option>
                {produtosDoCanal.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.isIngrediente ? '🧂 ' : ''}{p.nome} ({p.sku})
                  </option>
                ))}
              </select>
              {stockNoCanal && (
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  Stock atual neste canal: <b>{stockNoCanal.stockAtual}</b>
                </p>
              )}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Quantidade *</label>
              <input
                className="input" type="number" min="0.001" step="any" required
                value={form.quantidade}
                onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))}
              />
              {stockNoCanal && Number(form.quantidade) > stockNoCanal.stockAtual && (
                <div style={{ color: 'var(--color-danger)', fontSize: '12px', marginTop: '4px' }}>
                  ⚠ Só há {stockNoCanal.stockAtual} em stock neste canal.
                </div>
              )}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Motivo *</label>
              <input
                className="input" required maxLength={120}
                placeholder="Ex: Derrame no bar"
                value={form.motivo}
                onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
              />
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                {MOTIVOS_SUGERIDOS.map(m => (
                  <button
                    key={m} type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '11px', padding: '4px 10px', border: '1px solid var(--color-border)' }}
                    onClick={() => setForm(f => ({ ...f, motivo: m }))}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Notas</label>
              <textarea
                className="input" rows={2} maxLength={500}
                value={form.notas}
                onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              />
            </div>

            {erro && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>
                ⚠ {erro}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button type="button" onClick={() => setModalAberto(false)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
              <button type="submit" disabled={aGuardar || !form.produtoId} className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }}>
                {aGuardar ? 'A registar...' : 'Registar Quebra'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
