'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Tipo = 'BEBIDA_ALCOOLICA' | 'BEBIDA_NAO_ALCOOLICA' | 'COMIDA' | 'TABACO' | 'SNACK' | 'OUTRO'

const TIPOS: { id: Tipo; label: string }[] = [
  { id: 'COMIDA', label: '🍲 Comida' },
  { id: 'BEBIDA_ALCOOLICA', label: '🍺 Bebida Alcoólica' },
  { id: 'BEBIDA_NAO_ALCOOLICA', label: '🥤 Bebida Não Alcoólica' },
  { id: 'SNACK', label: '🍿 Snack' },
  { id: 'TABACO', label: '🚬 Tabaco' },
  { id: 'OUTRO', label: '📦 Outro' },
]

export interface CategoriaData {
  id: string
  nome: string
  tipo: string
  icone: string | null
  cor: string | null
  ordem: number
  parentCategoryId: string | null
  nrProdutos: number
}

// null = fechado; parentCategoryId '' = novo grupo; preenchido = nova subcategoria
type NovaForm = { nome: string; tipo: Tipo; parentCategoryId: string; cor: string; usarCor: boolean }

export function CategoriasClient({ categorias }: { categorias: CategoriaData[] }) {
  const router = useRouter()
  const [nova, setNova] = useState<NovaForm | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [aGuardar, setAGuardar] = useState(false)

  const grupos = categorias.filter(c => !c.parentCategoryId)
  const subsDe = (grupoId: string) => categorias.filter(c => c.parentCategoryId === grupoId)

  function abrirNova(parentCategoryId: string, tipoHerdado?: string) {
    setErro(null)
    setNova({
      nome: '',
      tipo: (tipoHerdado as Tipo) ?? 'COMIDA',
      parentCategoryId,
      cor: '#f59e0b',
      usarCor: false,
    })
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!nova) return
    setErro(null)
    setAGuardar(true)
    try {
      const res = await fetch('/api/categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nova.nome.trim(),
          tipo: nova.tipo,
          parentCategoryId: nova.parentCategoryId || null,
          cor: nova.usarCor ? nova.cor : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErro(data.erro ?? 'Erro ao criar categoria')
        return
      }
      setNova(null)
      setSucesso(`Categoria "${data.categoria.nome}" criada`)
      setTimeout(() => setSucesso(null), 5000)
      router.refresh()
    } catch {
      setErro('Erro de ligação — tente novamente')
    } finally {
      setAGuardar(false)
    }
  }

  async function apagar(c: CategoriaData) {
    const eGrupo = !c.parentCategoryId
    const subs = eGrupo ? subsDe(c.id) : []
    const aviso = eGrupo && subs.length > 0
      ? `Apagar o grupo "${c.nome}" e as suas ${subs.length} subcategoria(s)?`
      : `Apagar "${c.nome}"?`
    if (!confirm(aviso)) return

    const res = await fetch(`/api/categorias/${c.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      setSucesso(null)
      setErro(data.erro ?? 'Erro ao apagar categoria')
      setTimeout(() => setErro(null), 8000)
      return
    }
    setErro(null)
    setSucesso(data.mensagem ?? 'Categoria apagada')
    setTimeout(() => setSucesso(null), 5000)
    router.refresh()
  }

  function tipoLabel(tipo: string) {
    return TIPOS.find(t => t.id === tipo)?.label ?? tipo
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800 }}>🏷️ Categorias & Subcategorias</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Organizam os produtos no formulário, no POS e no cardápio digital. Categorias com produtos não podem ser apagadas.
          </p>
        </div>
        <button onClick={() => abrirNova('')} className="btn btn-primary">➕ Novo Grupo</button>
      </div>

      {sucesso && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-success-muted, rgba(16,185,129,0.15))', color: 'var(--color-success, #10b981)', fontSize: '13px', marginBottom: '16px' }}>
          ✓ {sucesso}
        </div>
      )}
      {erro && !nova && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '16px' }}>
          ⚠ {erro}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {grupos.map(grupo => {
          const subs = subsDe(grupo.id)
          return (
            <div key={grupo.id} className="card" style={{ padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  {grupo.cor && (
                    <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: grupo.cor, flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: '16px', fontWeight: 700 }}>{grupo.nome}</span>
                  <span className="badge" style={{ fontSize: '10px' }}>{tipoLabel(grupo.tipo)}</span>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    {grupo.nrProdutos} produto{grupo.nrProdutos === 1 ? '' : 's'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => abrirNova(grupo.id, grupo.tipo)} className="btn btn-ghost btn-sm" title="Adicionar subcategoria">➕ Subcategoria</button>
                  <button onClick={() => apagar(grupo)} className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} title="Apagar grupo">🗑</button>
                </div>
              </div>

              {subs.length > 0 && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {subs.map(sub => (
                    <div key={sub.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                      padding: '8px 12px', marginLeft: '16px', borderRadius: '8px',
                      background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>└</span>
                        {sub.cor && (
                          <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: sub.cor, flexShrink: 0 }} />
                        )}
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>{sub.nome}</span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          {sub.nrProdutos} produto{sub.nrProdutos === 1 ? '' : 's'}
                        </span>
                      </div>
                      <button onClick={() => apagar(sub)} className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} title="Apagar subcategoria">🗑</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {grupos.length === 0 && (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Sem categorias — crie o primeiro grupo.
          </div>
        )}
      </div>

      {/* ─── Modal Nova Categoria / Subcategoria ───────────── */}
      {nova && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }} onClick={() => setNova(null)}>
          <form
            onSubmit={criar}
            onClick={e => e.stopPropagation()}
            className="card animate-fade-in"
            style={{ padding: '28px', maxWidth: '420px', width: '100%' }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
              {nova.parentCategoryId ? '➕ Nova Subcategoria' : '➕ Novo Grupo'}
            </h3>
            {nova.parentCategoryId && (
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                Dentro de: <b>{grupos.find(g => g.id === nova.parentCategoryId)?.nome}</b>
              </p>
            )}

            <div style={{ marginTop: '12px', marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Nome *</label>
              <input
                className="input" required autoFocus maxLength={60}
                placeholder={nova.parentCategoryId ? 'Ex: Cervejas, Pratos Principais...' : 'Ex: Bebida Alcoólica, Comida...'}
                value={nova.nome}
                onChange={e => setNova(f => f && { ...f, nome: e.target.value })}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Tipo *</label>
              <select className="input" value={nova.tipo} onChange={e => setNova(f => f && { ...f, tipo: e.target.value as Tipo })}>
                {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={nova.usarCor}
                  onChange={e => setNova(f => f && { ...f, usarCor: e.target.checked })}
                />
                Cor de destaque
                {nova.usarCor && (
                  <input
                    type="color"
                    value={nova.cor}
                    onChange={e => setNova(f => f && { ...f, cor: e.target.value })}
                    style={{ width: '36px', height: '24px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                  />
                )}
              </label>
            </div>

            {erro && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>
                ⚠ {erro}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => setNova(null)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
              <button type="submit" disabled={aGuardar} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                {aGuardar ? 'A criar...' : 'Criar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
