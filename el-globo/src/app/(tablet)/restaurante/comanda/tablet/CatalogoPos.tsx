'use client'

import { useState } from 'react'

// Catálogo do POS tablet: pesquisa + chips hierárquicos (grupo pai →
// subcategoria) + grelhas de fichas técnicas e produtos com indicação
// de stock. Estado de navegação/pesquisa vive aqui — o TabletClient
// monta com key={canal} para repor tudo ao trocar de canal.

export interface Categoria {
  id: string; nome: string; icone: string | null
  parentCategoryId: string | null
  parent: { id: string; nome: string } | null
}

export interface Produto {
  id: string; nome: string; precoVenda: number
  imagemUrl: string | null
  categoria: Categoria
  // Unidades vendáveis no canal (inclui caixas do pai via auto-unboxing).
  // Advisory: a guarda real é o decremento condicional no envio.
  disponivel: number
}

// disponivel: limitado pelo ingrediente mais escasso; null = sem receita (sem limite)
export interface Ficha { id: string; nome: string; precoVenda: number; disponivel: number | null }

export function CatalogoPos({
  produtos,
  fichas,
  qtdDe,
  onAdicionar,
}: {
  produtos: Produto[]
  fichas: Ficha[]
  qtdDe: (tipo: 'produto' | 'ficha', id: string) => number
  onAdicionar: (tipo: 'produto' | 'ficha', id: string, nome: string, preco: number) => void
}) {
  const [pesquisa, setPesquisa] = useState('')
  // Navegação hierárquica: grupo pai ('BAR' = fichas técnicas) → subcategoria.
  const [grupoAtivo, setGrupoAtivo] = useState<string | null>(null)
  const [subAtiva, setSubAtiva] = useState<string | null>(null)

  // Grupo de um produto = parent da categoria (ou a própria, se for pai)
  const grupoDe = (p: Produto) => p.categoria.parent ?? p.categoria
  const grupos = Array.from(new Map(produtos.map(p => [grupoDe(p).id, grupoDe(p)])).values())
  const subcategorias = grupoAtivo && grupoAtivo !== 'BAR'
    ? Array.from(new Map(
        produtos.filter(p => p.categoria.parentCategoryId === grupoAtivo).map(p => [p.categoria.id, p.categoria])
      ).values())
    : []

  const matchPesquisa = (nome: string) => nome.toLowerCase().includes(pesquisa.toLowerCase())

  const produtosFiltrados = produtos.filter(p => {
    if (!matchPesquisa(p.nome)) return false
    if (!grupoAtivo) return true
    if (grupoAtivo === 'BAR') return false
    if (grupoDe(p).id !== grupoAtivo) return false
    return !subAtiva || p.categoria.id === subAtiva
  })
  const fichasFiltradas = fichas.filter(f => matchPesquisa(f.nome))
  const mostrarFichas = fichasFiltradas.length > 0 && (!grupoAtivo || grupoAtivo === 'BAR')

  function escolherGrupo(id: string | null) {
    setGrupoAtivo(id)
    setSubAtiva(null)
  }

  // Cartão de item (produto ou ficha) com bloqueio de esgotado e dica de
  // stock baixo — mesmas regras do POS do dashboard (ComandaClient).
  function cartao(opts: {
    tipo: 'produto' | 'ficha'
    id: string
    nome: string
    preco: number
    categoriaLabel: string
    imagemUrl?: string | null
    disponivel: number | null // null = sem limite
  }) {
    const { tipo, id, nome, preco, categoriaLabel, imagemUrl, disponivel } = opts
    const esgotado = disponivel !== null && disponivel <= 0
    const qty = qtdDe(tipo, id)
    return (
      <button
        key={`${tipo}-${id}`}
        onClick={() => onAdicionar(tipo, id, nome, preco)}
        disabled={esgotado}
        className="card btn-touch"
        style={{
          padding: '14px', textAlign: 'left', border: 'none', position: 'relative',
          cursor: esgotado ? 'not-allowed' : 'pointer',
          opacity: esgotado ? 0.45 : 1,
          background: qty > 0 ? 'var(--color-accent-muted)' : 'var(--color-bg-elevated)',
        }}
      >
        {qty > 0 && (
          <div style={{ position: 'absolute', top: '6px', right: '6px', background: 'var(--color-accent)', color: '#000', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800 }}>{qty}</div>
        )}
        {imagemUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagemUrl} alt={nome} loading="lazy"
            style={{ width: '100%', height: '72px', objectFit: 'cover', borderRadius: '8px', marginBottom: '8px' }}
          />
        )}
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>{categoriaLabel}</div>
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px', lineHeight: 1.3 }}>{nome}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-accent)' }}>MT {preco.toFixed(2)}</div>
          {esgotado && <span className="badge badge-danger">Esgotado</span>}
          {!esgotado && disponivel !== null && disponivel <= 5 && (
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-danger)' }}>Restam {disponivel}</span>
          )}
        </div>
      </button>
    )
  }

  return (
    <>
      {/* Pesquisa */}
      <input
        className="input"
        placeholder="🔍 Pesquisar produto..."
        value={pesquisa}
        onChange={e => setPesquisa(e.target.value)}
        style={{ marginBottom: '12px', minHeight: '48px', fontSize: '15px' }}
      />

      {/* Chips de GRUPO (categorias pai) com scroll horizontal */}
      <div className="chips-scroll" style={{ marginBottom: subcategorias.length > 0 ? '8px' : '12px' }}>
        <button
          onClick={() => escolherGrupo(null)}
          className={`btn btn-sm btn-touch ${!grupoAtivo ? 'btn-primary' : 'btn-secondary'}`}
        >
          Tudo
        </button>
        {fichas.length > 0 && (
          <button
            onClick={() => escolherGrupo(grupoAtivo === 'BAR' ? null : 'BAR')}
            className={`btn btn-sm btn-touch ${grupoAtivo === 'BAR' ? 'btn-primary' : 'btn-secondary'}`}
          >
            🍸 Bar
          </button>
        )}
        {grupos.map(g => (
          <button
            key={g.id}
            onClick={() => escolherGrupo(grupoAtivo === g.id ? null : g.id)}
            className={`btn btn-sm btn-touch ${grupoAtivo === g.id ? 'btn-primary' : 'btn-secondary'}`}
          >
            {g.nome}
          </button>
        ))}
      </div>

      {/* Chips de SUBCATEGORIA — só ativos depois de escolher o grupo */}
      {subcategorias.length > 0 && (
        <div className="chips-scroll" style={{ marginBottom: '12px', paddingLeft: '6px', borderLeft: '3px solid var(--color-accent-muted)' }}>
          <button
            onClick={() => setSubAtiva(null)}
            className={`btn btn-sm btn-touch ${!subAtiva ? 'btn-primary' : 'btn-ghost'}`}
          >
            Todas
          </button>
          {subcategorias.map(s => (
            <button
              key={s.id}
              onClick={() => setSubAtiva(subAtiva === s.id ? null : s.id)}
              className={`btn btn-sm btn-touch ${subAtiva === s.id ? 'btn-primary' : 'btn-ghost'}`}
            >
              {s.nome}
            </button>
          ))}
        </div>
      )}

      {/* Fichas técnicas (bar) */}
      {mostrarFichas && (
        <div className="pos-grid" style={{ marginBottom: '12px' }}>
          {fichasFiltradas.map(f => cartao({
            tipo: 'ficha', id: f.id, nome: f.nome, preco: f.precoVenda,
            categoriaLabel: '🍸 Bar', disponivel: f.disponivel,
          }))}
        </div>
      )}

      {/* Produtos */}
      <div className="pos-grid">
        {produtosFiltrados.map(p => cartao({
          tipo: 'produto', id: p.id, nome: p.nome, preco: Number(p.precoVenda),
          categoriaLabel: p.categoria.nome, imagemUrl: p.imagemUrl, disponivel: p.disponivel,
        }))}
      </div>

      {produtosFiltrados.length === 0 && !mostrarFichas && (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-muted)', fontSize: '14px' }}>
          Nenhum produto encontrado{pesquisa ? ` para "${pesquisa}"` : ''}
        </div>
      )}
    </>
  )
}
