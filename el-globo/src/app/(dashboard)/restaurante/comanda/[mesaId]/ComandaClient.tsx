'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ProntoAlert } from '@/components/ProntoAlert'

interface Produto {
  id: string; nome: string; precoVenda: number
  categoria: { nome: string; icone: string | null; cor: string | null }
}
interface FichaTecnica { id: string; nome: string; precoVenda: number }
interface ItemPedido {
  id: string; quantidade: number; precoUnitario: number; notas: string | null; estadoKDS: string
  produto: Produto | null; fichaTecnica: FichaTecnica | null
}
interface Pedido {
  id: string; estado: string; criadoEm: Date
  itens: ItemPedido[]
  user: { nome: string }
}
interface Mesa {
  id: string; numero: number; nome: string | null; zona: string | null; estado: string
  pedidos: Pedido[]
}

interface ItemCarrinho { tipo: 'produto' | 'ficha'; id: string; nome: string; preco: number; quantidade: number; notas: string }

export function ComandaClient({ mesa, produtos, fichas }: { mesa: Mesa; produtos: Produto[]; fichas: FichaTecnica[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [pesquisa, setPesquisa] = useState('')
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>('Tudo')
  const [notaItem, setNotaItem] = useState('')
  const [abaAtiva, setAbaAtiva] = useState<'menu' | 'pedidos'>('menu')

  const categorias = ['Tudo', 'Fichas Técnicas', ...Array.from(new Set(produtos.map(p => p.categoria.nome)))]

  const produtosFiltrados = produtos.filter(p => {
    const matchPesquisa = p.nome.toLowerCase().includes(pesquisa.toLowerCase())
    const matchCategoria = categoriaAtiva === 'Tudo' || p.categoria.nome === categoriaAtiva
    return matchPesquisa && matchCategoria
  })

  const fichasFiltradas = fichas.filter(f =>
    f.nome.toLowerCase().includes(pesquisa.toLowerCase()) &&
    (categoriaAtiva === 'Tudo' || categoriaAtiva === 'Fichas Técnicas')
  )

  function adicionarAoCarrinho(tipo: 'produto' | 'ficha', id: string, nome: string, preco: number) {
    setCarrinho(prev => {
      const existente = prev.find(i => i.tipo === tipo && i.id === id)
      if (existente) return prev.map(i => i.tipo === tipo && i.id === id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { tipo, id, nome, preco, quantidade: 1, notas: '' }]
    })
  }

  function removerDoCarrinho(tipo: string, id: string) {
    setCarrinho(prev => prev.filter(i => !(i.tipo === tipo && i.id === id)))
  }

  function ajustarQuantidade(tipo: string, id: string, delta: number) {
    setCarrinho(prev => prev
      .map(i => i.tipo === tipo && i.id === id ? { ...i, quantidade: Math.max(0, i.quantidade + delta) } : i)
      .filter(i => i.quantidade > 0)
    )
  }

  const totalCarrinho = carrinho.reduce((acc, i) => acc + i.preco * i.quantidade, 0)

  function enviarPedido() {
    if (carrinho.length === 0) return
    startTransition(async () => {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canal: 'RESTAURANTE',
          mesaId: mesa.id,
          itens: carrinho.map(i => ({
            tipo: i.tipo,
            id: i.id,
            quantidade: i.quantidade,
            notas: i.notas || null,
          })),
        }),
      })
      if (res.ok) {
        setCarrinho([])
        router.refresh()
        setAbaAtiva('pedidos')
      }
    })
  }

  const totalMesa = mesa.pedidos
    .flatMap(p => p.itens)
    .reduce((acc, i) => acc + i.precoUnitario * i.quantidade, 0)

  return (
    <div className="split-layout">
      {/* Alerta em tempo real quando a cozinha marca um pedido como pronto */}
      <ProntoAlert />
      {/* Left: Menu */}
      <div className="split-main" style={{ padding: '20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <button onClick={() => router.back()} className="btn btn-ghost btn-sm">←</button>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 800 }}>
              Mesa {mesa.numero} {mesa.nome ? `— ${mesa.nome}` : ''}
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{mesa.zona}</p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button
              className={`btn btn-sm ${abaAtiva === 'menu' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAbaAtiva('menu')}
            >Menu</button>
            <button
              className={`btn btn-sm ${abaAtiva === 'pedidos' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAbaAtiva('pedidos')}
            >
              Pedidos {mesa.pedidos.length > 0 && `(${mesa.pedidos.length})`}
            </button>
          </div>
        </div>

        {abaAtiva === 'menu' ? (
          <>
            {/* Pesquisa */}
            <input
              className="input"
              placeholder="🔍 Pesquisar produto..."
              value={pesquisa}
              onChange={e => setPesquisa(e.target.value)}
              style={{ marginBottom: '12px' }}
            />

            {/* Categorias */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {categorias.map(cat => (
                <button
                  key={cat}
                  className={`btn btn-sm ${categoriaAtiva === cat ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCategoriaAtiva(cat)}
                  style={{ padding: '4px 12px' }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Fichas Técnicas */}
            {fichasFiltradas.length > 0 && (
              <>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  🍸 Fichas Técnicas (Bar)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                  {fichasFiltradas.map(f => (
                    <button
                      key={f.id}
                      onClick={() => adicionarAoCarrinho('ficha', f.id, f.nome, Number(f.precoVenda))}
                      className="card card-hover"
                      style={{ padding: '12px', textAlign: 'left', cursor: 'pointer', border: 'none', background: 'var(--color-bg-elevated)' }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{f.nome}</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-accent)' }}>
                        MT {Number(f.precoVenda).toFixed(2)}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Produtos */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
              {produtosFiltrados.map(p => {
                const noCarrinho = carrinho.find(i => i.tipo === 'produto' && i.id === p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => adicionarAoCarrinho('produto', p.id, p.nome, Number(p.precoVenda))}
                    className="card card-hover"
                    style={{
                      padding: '12px', textAlign: 'left', cursor: 'pointer', border: 'none',
                      background: noCarrinho ? 'var(--color-accent-muted)' : 'var(--color-bg-elevated)',
                      borderColor: noCarrinho ? 'var(--color-accent)' : undefined,
                      position: 'relative',
                    }}
                  >
                    {noCarrinho && (
                      <div style={{
                        position: 'absolute', top: '6px', right: '6px',
                        background: 'var(--color-accent)', color: '#000',
                        borderRadius: '50%', width: '18px', height: '18px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: 800,
                      }}>
                        {noCarrinho.quantidade}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                      {p.categoria.icone} {p.categoria.nome}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{p.nome}</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-accent)' }}>
                      MT {Number(p.precoVenda).toFixed(2)}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          /* Pedidos ativos */
          <div>
            {mesa.pedidos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-muted)' }}>
                Sem pedidos nesta mesa
              </div>
            ) : (
              mesa.pedidos.map(pedido => (
                <div key={pedido.id} className="card" style={{ padding: '16px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Pedido</span>
                    <span className={`badge ${pedido.estado === 'PENDENTE' ? 'badge-warning' : pedido.estado === 'PRONTO' ? 'badge-success' : 'badge-info'}`}>
                      {pedido.estado.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {pedido.itens.map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', borderBottom: '1px solid var(--color-border)' }}>
                      <span>{item.quantidade}× {item.produto?.nome ?? item.fichaTecnica?.nome}</span>
                      <span style={{ color: 'var(--color-text-secondary)' }}>MT {(item.precoUnitario * item.quantidade).toFixed(2)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    por {pedido.user.nome}
                  </div>
                </div>
              ))
            )}
            {mesa.pedidos.length > 0 && (
              <div style={{ padding: '16px', borderTop: '2px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700 }}>Total da Mesa</span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-accent)' }}>
                  MT {totalMesa.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Carrinho */}
      <div className="split-side">
        <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700 }}>🛒 Carrinho</h2>
          {carrinho.length > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{carrinho.length} item(ns) selecionado(s)</p>
          )}
        </div>

        {/* Itens do carrinho */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {carrinho.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
              Clique nos produtos para adicionar
            </div>
          ) : (
            carrinho.map(item => (
              <div key={`${item.tipo}-${item.id}`} style={{
                padding: '10px', borderRadius: '8px', marginBottom: '8px',
                background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, flex: 1, paddingRight: '8px' }}>{item.nome}</span>
                  <button onClick={() => removerDoCarrinho(item.tipo, item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: '16px' }}>×</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button onClick={() => ajustarQuantidade(item.tipo, item.id, -1)} className="btn btn-secondary btn-sm" style={{ width: '28px', height: '28px', padding: 0, justifyContent: 'center' }}>-</button>
                    <span style={{ fontSize: '15px', fontWeight: 700, minWidth: '20px', textAlign: 'center' }}>{item.quantidade}</span>
                    <button onClick={() => ajustarQuantidade(item.tipo, item.id, +1)} className="btn btn-secondary btn-sm" style={{ width: '28px', height: '28px', padding: 0, justifyContent: 'center' }}>+</button>
                  </div>
                  <span style={{ fontWeight: 700, color: 'var(--color-accent)' }}>MT {(item.preco * item.quantidade).toFixed(2)}</span>
                </div>
                <input
                  className="input"
                  placeholder="Nota (ex: sem sal)..."
                  value={item.notas}
                  onChange={e => setCarrinho(prev => prev.map(i => i.tipo === item.tipo && i.id === item.id ? { ...i, notas: e.target.value } : i))}
                  style={{ marginTop: '6px', fontSize: '12px', padding: '6px 10px' }}
                />
              </div>
            ))
          )}
        </div>

        {/* Footer do carrinho */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--color-border)' }}>
          {carrinho.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontWeight: 600 }}>Total do Pedido</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-accent)' }}>MT {totalCarrinho.toFixed(2)}</span>
            </div>
          )}
          <button
            onClick={enviarPedido}
            disabled={carrinho.length === 0 || isPending}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {isPending ? <><div className="spinner" style={{ width: '16px', height: '16px' }} /> A enviar...</> : '📤 Enviar para Cozinha/Bar'}
          </button>
          <button
            onClick={() => router.push(`/restaurante/checkout/${mesa.id}`)}
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
          >
            💳 Fechar Conta
          </button>
        </div>
      </div>
    </div>
  )
}
