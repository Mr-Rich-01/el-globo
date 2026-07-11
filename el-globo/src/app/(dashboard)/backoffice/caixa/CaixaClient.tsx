'use client'

import { useState, useEffect } from 'react'

type SessaoCaixa = {
  id: string
  user: { nome: string }
  canal: string
  estado: string
  fundoInicial: number
  totalVendas: number | null
  totalDinheiro: number | null
  totalCartao: number | null
  totalMobile: number | null
  nrTransacoes: number | null
  diferenca: number | null
  notas: string | null
  abertoEm: string
  fechadoEm: string | null
}

const CANAL_LABEL: Record<string, string> = {
  RESTAURANTE: 'Restaurante / Bar',
  BOTTLESTORE: 'Bottlestore',
  PISCINA: 'Piscina',
}

export function CaixaClient({ canaisDisponiveis }: { canaisDisponiveis: string[] }) {
  const [sessoes, setSessoes] = useState<SessaoCaixa[]>([])
  const [loading, setLoading] = useState(true)

  const [isAbrirModalOpen, setIsAbrirModalOpen] = useState(false)
  // Pré-fixado ao primeiro canal do utilizador — o gestor da loja só vê o dele
  const [canal, setCanal] = useState(canaisDisponiveis[0] ?? 'RESTAURANTE')
  const [fundoInicial, setFundoInicial] = useState(0)

  const [isFecharModalOpen, setIsFecharModalOpen] = useState(false)
  const [sessaoAtiva, setSessaoAtiva] = useState<SessaoCaixa | null>(null)
  const [contagemFisica, setContagemFisica] = useState<number | ''>('')
  const [notas, setNotas] = useState('')

  useEffect(() => {
    fetchSessoes()
  }, [])

  async function fetchSessoes() {
    setLoading(true)
    try {
      const res = await fetch('/api/caixa')
      const data = await res.json()
      setSessoes(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function handleAbrirCaixa(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch('/api/caixa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal, fundoInicial })
      })
      if (res.ok) {
        setIsAbrirModalOpen(false)
        fetchSessoes()
      } else {
        const err = await res.json()
        alert('Erro: ' + (err.erro || 'Desconhecido'))
      }
    } catch (error) {
      alert('Erro ao abrir caixa')
    }
  }

  function openFecharModal(sessao: SessaoCaixa) {
    setSessaoAtiva(sessao)
    setContagemFisica('')
    setNotas('')
    setIsFecharModalOpen(true)
  }

  async function handleFecharCaixa(e: React.FormEvent) {
    e.preventDefault()
    if (!sessaoAtiva) return

    try {
      const res = await fetch(`/api/caixa/${sessaoAtiva.id}/fechar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contagemFisica: Number(contagemFisica), notas })
      })
      if (res.ok) {
        setIsFecharModalOpen(false)
        fetchSessoes()
      } else {
        const err = await res.json()
        alert('Erro: ' + (err.erro || 'Desconhecido'))
      }
    } catch (error) {
      alert('Erro ao fechar caixa')
    }
  }

  function formatMZN(val: number | null) {
    if (val == null) return '---'
    return new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' }).format(val)
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Gestão de Caixa</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Histórico e fecho de turnos por canal</p>
        </div>
        <button 
          onClick={() => setIsAbrirModalOpen(true)}
          className="bg-[var(--color-accent)] text-black px-4 py-2 rounded-lg font-bold hover:brightness-110 transition-all"
        >
          Abertura de Caixa
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-[var(--color-text-muted)]">A carregar...</div>
      ) : (
        <div className="bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)] overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[rgba(255,255,255,0.02)]">
                <th className="p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase">Abertura</th>
                <th className="p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase">Operador</th>
                <th className="p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase">Canal</th>
                <th className="p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase">Estado</th>
                <th className="p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase text-right">Fundo Inicial</th>
                <th className="p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase text-right">Total Vendas</th>
                <th className="p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase text-right">Diferença (Dinheiro)</th>
                <th className="p-4 text-xs font-semibold text-[var(--color-text-muted)] uppercase text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {sessoes.map(s => (
                <tr key={s.id} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                  <td className="p-4 text-sm font-mono">{new Date(s.abertoEm).toLocaleString('pt-MZ')}</td>
                  <td className="p-4 text-sm">{s.user.nome}</td>
                  <td className="p-4 text-sm font-medium">{s.canal}</td>
                  <td className="p-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${s.estado === 'ABERTA' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                      {s.estado}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-right font-mono">{formatMZN(s.fundoInicial)}</td>
                  <td className="p-4 text-sm text-right font-mono font-bold text-[var(--color-accent)]">{formatMZN(s.totalVendas)}</td>
                  <td className="p-4 text-sm text-right font-mono">
                    {s.diferenca !== null && (
                      <span className={s.diferenca < 0 ? 'text-red-400' : s.diferenca > 0 ? 'text-green-400' : 'text-gray-400'}>
                        {formatMZN(s.diferenca)}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    {s.estado === 'ABERTA' && (
                      <button onClick={() => openFecharModal(s)} className="text-xs bg-red-500/20 text-red-400 px-3 py-1 rounded hover:bg-red-500/30">
                        Fechar Caixa
                      </button>
                    )}
                    {s.estado === 'FECHADA' && (
                      <span className="text-xs text-[var(--color-text-muted)]" title={s.fechadoEm ? new Date(s.fechadoEm).toLocaleString('pt-MZ') : ''}>
                        {s.fechadoEm ? new Date(s.fechadoEm).toLocaleTimeString('pt-MZ') : '---'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {sessoes.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-[var(--color-text-muted)]">Sem histórico de sessões.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Abrir */}
      {isAbrirModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-[var(--color-border)] flex justify-between items-center bg-[var(--color-bg-elevated)]">
              <h2 className="text-xl font-bold">Abrir Novo Caixa</h2>
            </div>
            <form onSubmit={handleAbrirCaixa} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">Ponto de Venda</label>
                <select value={canal} onChange={e => setCanal(e.target.value)} className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg p-2.5 text-sm">
                  {canaisDisponiveis.map(c => (
                    <option key={c} value={c}>{CANAL_LABEL[c] ?? c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">Fundo de Maneio (MZN)</label>
                <input type="number" required min="0" step="0.01" value={fundoInicial || ''} onChange={e => setFundoInicial(Number(e.target.value))} className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg p-2.5 text-sm font-mono text-[var(--color-accent)]" placeholder="Valor no cofre..." />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsAbrirModalOpen(false)} className="px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[rgba(255,255,255,0.05)] transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="bg-[var(--color-accent)] text-black px-6 py-2 rounded-lg text-sm font-bold hover:brightness-110 transition-all">
                  Abrir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Fechar */}
      {isFecharModalOpen && sessaoAtiva && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
              <h2 className="text-xl font-bold text-red-400">Fecho de Caixa</h2>
              <p className="text-sm text-[var(--color-text-muted)]">Operador: {sessaoAtiva.user.nome} • {sessaoAtiva.canal}</p>
            </div>
            <form onSubmit={handleFecharCaixa} className="p-6 space-y-6">
              
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
                <div className="text-xs text-blue-300 font-semibold mb-1 uppercase tracking-wider">Fundo Inicial Informado</div>
                <div className="font-mono text-xl text-blue-100">{formatMZN(sessaoAtiva.fundoInicial)}</div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">
                  Contagem Física (MZN) <span className="text-red-400">*</span>
                </label>
                <p className="text-[10px] text-[var(--color-text-muted)] mb-1">
                  Conte TODO o dinheiro físico na gaveta (Fundo inicial + Entradas em dinheiro). O sistema calculará a diferença.
                </p>
                <input 
                  type="number" required min="0" step="0.01" 
                  value={contagemFisica} 
                  onChange={e => setContagemFisica(e.target.value === '' ? '' : Number(e.target.value))} 
                  className="w-full bg-black/40 border border-red-500/50 focus:border-red-500 rounded-lg p-3 text-lg font-mono text-white outline-none" 
                  placeholder="0.00" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">Observações (Faltas/Sobras)</label>
                <textarea 
                  value={notas} 
                  onChange={e => setNotas(e.target.value)} 
                  className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg p-2 text-sm h-16" 
                  placeholder="Justifique qualquer diferença..." 
                />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setIsFecharModalOpen(false)} className="px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[rgba(255,255,255,0.05)] transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="bg-red-500 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-red-600 transition-all">
                  Submeter Fecho X/Z
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
