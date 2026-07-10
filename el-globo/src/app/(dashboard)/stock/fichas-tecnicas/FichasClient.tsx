'use client'

import { useState, useEffect } from 'react'

type Produto = {
  id: string
  nome: string
  unidadeMedida: string
  precoVenda: number
  stockAtual: number
}

type FichaItem = {
  id: string
  produtoId: string
  produto: Produto
  quantidade: number
  unidade: string
}

type FichaTecnica = {
  id: string
  nome: string
  descricao: string | null
  precoVenda: number
  ativo: boolean
  ingredientes: FichaItem[]
  produto: Produto | null
}

export function FichasClient() {
  const [fichas, setFichas] = useState<FichaTecnica[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    precoVenda: 0,
    produtoId: '',
    ativo: true,
    ingredientes: [] as { produtoId: string, quantidade: number, unidade: string }[]
  })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [resFichas, resProd] = await Promise.all([
        fetch('/api/fichas-tecnicas'),
        fetch('/api/produtos')
      ])
      const f = await resFichas.json()
      const p = await resProd.json()
      setFichas(Array.isArray(f) ? f : [])
      setProdutos(Array.isArray(p) ? p : [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  function handleAddIngredient() {
    setFormData(prev => ({
      ...prev,
      ingredientes: [...prev.ingredientes, { produtoId: '', quantidade: 0, unidade: 'MILILITRO' }]
    }))
  }

  function handleRemoveIngredient(index: number) {
    setFormData(prev => ({
      ...prev,
      ingredientes: prev.ingredientes.filter((_, i) => i !== index)
    }))
  }

  function updateIngredient(index: number, field: string, value: any) {
    setFormData(prev => {
      const newIngs = [...prev.ingredientes]
      newIngs[index] = { ...newIngs[index], [field]: value }
      return { ...prev, ingredientes: newIngs }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (formData.ingredientes.length === 0) {
      alert('Adicione pelo menos um ingrediente')
      return
    }

    try {
      const res = await fetch('/api/fichas-tecnicas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          produtoId: formData.produtoId || null
        })
      })
      
      if (res.ok) {
        setIsModalOpen(false)
        setFormData({
          nome: '', descricao: '', precoVenda: 0, produtoId: '', ativo: true, ingredientes: []
        })
        fetchData()
      } else {
        const err = await res.json()
        alert('Erro: ' + (err.erro || 'Desconhecido'))
      }
    } catch (error) {
      console.error(error)
      alert('Erro ao guardar')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja realmente apagar esta ficha técnica?')) return
    try {
      const res = await fetch(`/api/fichas-tecnicas/${id}`, { method: 'DELETE' })
      if (res.ok) fetchData()
      else alert('Erro ao apagar')
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Fichas Técnicas (Receitas)</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Criação de menus combinados, cocktails e pratos</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[var(--color-accent)] text-black px-4 py-2 rounded-lg font-bold hover:brightness-110 transition-all"
        >
          + Nova Receita
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-[var(--color-text-muted)]">A carregar...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {fichas.map(f => (
            <div key={f.id} className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-xl p-5 relative group">
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleDelete(f.id)} className="text-red-400 hover:text-red-300">Apagar</button>
              </div>
              
              <h3 className="text-lg font-bold mb-1">{f.nome}</h3>
              {f.descricao && <p className="text-sm text-[var(--color-text-muted)] mb-3">{f.descricao}</p>}
              
              <div className="text-[var(--color-accent)] font-mono text-xl font-bold mb-4">
                {new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' }).format(f.precoVenda)}
              </div>

              <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Ingredientes</div>
              <ul className="space-y-2 mb-4">
                {f.ingredientes.map(i => (
                  <li key={i.id} className="text-sm flex justify-between bg-black/20 p-2 rounded">
                    <span>{i.produto?.nome}</span>
                    <span className="font-mono text-[var(--color-text-muted)]">{i.quantidade} {i.unidade}</span>
                  </li>
                ))}
              </ul>
              {f.produto && (
                <div className="text-xs bg-blue-500/10 text-blue-400 p-2 rounded">
                  Gera stock para: <b>{f.produto.nome}</b>
                </div>
              )}
            </div>
          ))}
          {fichas.length === 0 && (
            <div className="col-span-full p-10 text-center text-[var(--color-text-muted)] border border-dashed border-[var(--color-border)] rounded-xl">
              Nenhuma ficha técnica criada.
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-[var(--color-border)] flex justify-between items-center sticky top-0 bg-[var(--color-bg-elevated)] z-10">
              <h2 className="text-xl font-bold">Nova Ficha Técnica</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-[var(--color-text-muted)] hover:text-white text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">Nome (ex: Margarita)</label>
                  <input required value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg p-2.5 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">Preço de Venda (MZN)</label>
                  <input type="number" required min="0" step="0.01" value={formData.precoVenda || ''} onChange={e => setFormData({...formData, precoVenda: Number(e.target.value)})} className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg p-2.5 text-sm font-mono text-[var(--color-accent)]" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">Descrição / Modo de Preparo</label>
                <textarea value={formData.descricao} onChange={e => setFormData({...formData, descricao: e.target.value})} className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg p-2.5 text-sm h-20" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">Produto Final Resultante (Opcional)</label>
                <select value={formData.produtoId} onChange={e => setFormData({...formData, produtoId: e.target.value})} className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg p-2.5 text-sm">
                  <option value="">Nenhum (Apenas receita para venda direta)</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <p className="text-xs text-[var(--color-text-muted)]">Use isto se esta receita for usada para produzir algo que vai para o stock antes de ser vendido.</p>
              </div>

              <div className="border-t border-[var(--color-border)] pt-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider">Ingredientes</h3>
                  <button type="button" onClick={handleAddIngredient} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition-colors">
                    + Adicionar
                  </button>
                </div>
                
                <div className="space-y-3">
                  {formData.ingredientes.map((ing, i) => (
                    <div key={i} className="flex gap-2 items-center bg-black/20 p-2 rounded border border-[var(--color-border)]/50">
                      <select required value={ing.produtoId} onChange={e => updateIngredient(i, 'produtoId', e.target.value)} className="flex-1 bg-black/40 border border-[var(--color-border)] rounded p-2 text-sm">
                        <option value="">Produto...</option>
                        {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} (Stock: {p.stockAtual} {p.unidadeMedida})</option>)}
                      </select>
                      <input type="number" required min="0.0001" step="0.0001" placeholder="Qtd" value={ing.quantidade || ''} onChange={e => updateIngredient(i, 'quantidade', Number(e.target.value))} className="w-24 bg-black/40 border border-[var(--color-border)] rounded p-2 text-sm font-mono" />
                      <select required value={ing.unidade} onChange={e => updateIngredient(i, 'unidade', e.target.value)} className="w-32 bg-black/40 border border-[var(--color-border)] rounded p-2 text-sm">
                        <option value="UNIDADE">Unidade</option>
                        <option value="MILILITRO">Mililitro</option>
                        <option value="LITRO">Litro</option>
                        <option value="GRAMA">Grama</option>
                        <option value="KG">Kg</option>
                        <option value="PORCAO">Porção</option>
                      </select>
                      <button type="button" onClick={() => handleRemoveIngredient(i)} className="text-red-400 hover:bg-red-400/10 p-2 rounded">&times;</button>
                    </div>
                  ))}
                  {formData.ingredientes.length === 0 && (
                    <p className="text-sm text-[var(--color-text-muted)] text-center py-4">Adicione ingredientes para compor a ficha técnica.</p>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--color-border)] flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[rgba(255,255,255,0.05)] transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="bg-[var(--color-accent)] text-black px-6 py-2 rounded-lg text-sm font-bold hover:brightness-110 transition-all">
                  Guardar Receita
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
