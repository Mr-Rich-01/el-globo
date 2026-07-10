'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ProntoAlert } from '@/components/ProntoAlert'
import { CheckoutPanel, LinhaConta } from '@/components/CheckoutPanel'

// Ecrã fullscreen para os tablets dos garçons: escolher destino
// (mesa ou pedido volante) → lançar itens → ENVIAR À COZINHA.
// Todos os alvos de toque têm ≥48px (classe .btn-touch).

type Canal = 'RESTAURANTE' | 'PISCINA'

interface Mesa { id: string; numero: number; nome: string | null; zona: string | null; estado: string }
interface Volante {
  id: string
  identificadorCliente: string
  estado: string
  criadoEm: string
  linhas: LinhaConta[]
}
interface Categoria {
  id: string; nome: string; icone: string | null
  parentCategoryId: string | null
  parent: { id: string; nome: string } | null
}

interface Produto {
  id: string; nome: string; precoVenda: number
  imagemUrl: string | null
  categoria: Categoria
}
interface Ficha { id: string; nome: string; precoVenda: number }

type Destino =
  | { tipo: 'MESA'; mesaId: string; label: string }
  | { tipo: 'VOLANTE_NOVO'; ref: string }
  | { tipo: 'VOLANTE_EXISTENTE'; pedidoId: string; label: string }

interface ItemCarrinho {
  tipo: 'produto' | 'ficha'
  id: string
  nome: string
  preco: number
  quantidade: number
  notas: string
}

const NOTAS_RAPIDAS = ['sem gelo', 'bem passado', 'sem sal', 'para levar']

const MESA_CLASSE: Record<string, string> = {
  LIVRE: 'mesa-livre', OCUPADA: 'mesa-ocupada', CONTA_PEDIDA: 'mesa-conta', RESERVADA: 'mesa-reservada',
}

export function TabletClient({
  garcom,
  canais,
  mesas,
  volantes,
}: {
  garcom: { id: string; nome: string }
  canais: Canal[]
  mesas: Mesa[]
  volantes: Volante[]
}) {
  const router = useRouter()
  const [canal, setCanal] = useState<Canal>(canais[0])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [destino, setDestino] = useState<Destino | null>(null)
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  // Navegação hierárquica: grupo pai ('BAR' = fichas técnicas) → subcategoria.
  // Os chips de subcategoria só aparecem depois de escolher um grupo.
  const [grupoAtivo, setGrupoAtivo] = useState<string | null>(null)
  const [subAtiva, setSubAtiva] = useState<string | null>(null)
  const [modalVolante, setModalVolante] = useState(false)
  const [volanteRef, setVolanteRef] = useState('')
  const [volanteDetalhe, setVolanteDetalhe] = useState<Volante | null>(null)
  const [checkoutVolante, setCheckoutVolante] = useState<Volante | null>(null)
  const [notasAbertas, setNotasAbertas] = useState<string | null>(null) // chave do item com painel de notas aberto
  const [toast, setToast] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Catálogo por canal (Restaurante ↔ Piscina)
  const carregarCatalogo = useCallback(async (c: Canal) => {
    const [resProd, resFichas] = await Promise.all([
      fetch(`/api/produtos?canal=${c}`),
      c === 'RESTAURANTE' ? fetch('/api/fichas-tecnicas?ativo=true') : Promise.resolve(null),
    ])
    const prod = await resProd.json()
    // Produtos com preço 0 são internos (caixas de armazém, garrafas de
    // bar a granel) — não aparecem no catálogo do garçom.
    setProdutos(Array.isArray(prod) ? prod.filter((p: Produto) => Number(p.precoVenda) > 0) : [])
    if (resFichas) {
      const f = await resFichas.json()
      setFichas(Array.isArray(f) ? f.map((x: { id: string; nome: string; precoVenda: unknown }) => ({ id: x.id, nome: x.nome, precoVenda: Number(x.precoVenda) })) : [])
    } else {
      setFichas([])
    }
  }, [])

  useEffect(() => { carregarCatalogo(canal) }, [canal, carregarCatalogo])

  // Grupo de um produto = parent da categoria (ou a própria, se for pai)
  const grupoDe = (p: Produto) => p.categoria.parent ?? p.categoria
  const grupos = Array.from(new Map(produtos.map(p => [grupoDe(p).id, grupoDe(p)])).values())
  const subcategorias = grupoAtivo && grupoAtivo !== 'BAR'
    ? Array.from(new Map(
        produtos.filter(p => p.categoria.parentCategoryId === grupoAtivo).map(p => [p.categoria.id, p.categoria])
      ).values())
    : []

  const produtosFiltrados = produtos.filter(p => {
    if (!grupoAtivo) return true
    if (grupoAtivo === 'BAR') return false
    if (grupoDe(p).id !== grupoAtivo) return false
    return !subAtiva || p.categoria.id === subAtiva
  })
  const mostrarFichas = fichas.length > 0 && (!grupoAtivo || grupoAtivo === 'BAR')

  function escolherGrupo(id: string | null) {
    setGrupoAtivo(id)
    setSubAtiva(null)
  }

  const totalCarrinho = carrinho.reduce((acc, i) => acc + i.preco * i.quantidade, 0)
  const chave = (i: { tipo: string; id: string }) => `${i.tipo}-${i.id}`

  function adicionar(tipo: 'produto' | 'ficha', id: string, nome: string, preco: number) {
    setCarrinho(prev => {
      const ex = prev.find(i => i.tipo === tipo && i.id === id)
      if (ex) return prev.map(i => i.tipo === tipo && i.id === id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { tipo, id, nome, preco, quantidade: 1, notas: '' }]
    })
  }

  function ajustar(tipo: string, id: string, delta: number) {
    setCarrinho(prev => prev
      .map(i => i.tipo === tipo && i.id === id ? { ...i, quantidade: Math.max(0, i.quantidade + delta) } : i)
      .filter(i => i.quantidade > 0))
  }

  function toggleNotaRapida(itemChave: string, nota: string) {
    setCarrinho(prev => prev.map(i => {
      if (chave(i) !== itemChave) return i
      const partes = i.notas.split(',').map(s => s.trim()).filter(Boolean)
      const idx = partes.indexOf(nota)
      if (idx >= 0) partes.splice(idx, 1)
      else partes.push(nota)
      return { ...i, notas: partes.join(', ') }
    }))
  }

  function escolherMesa(mesa: Mesa) {
    if (mesa.estado === 'LIVRE') {
      // Abre a mesa em background (mesmo padrão do MesasClient)
      fetch(`/api/mesas/${mesa.id}/abrir`, { method: 'POST' })
    }
    setDestino({ tipo: 'MESA', mesaId: mesa.id, label: `Mesa ${mesa.numero}` })
    setCarrinho([])
    setErro(null)
  }

  function abrirVolanteNovo() {
    const ref = volanteRef.trim() || 'Balcão'
    setDestino({ tipo: 'VOLANTE_NOVO', ref })
    setModalVolante(false)
    setVolanteRef('')
    setCarrinho([])
    setErro(null)
  }

  function retomarVolante(v: Volante) {
    setDestino({ tipo: 'VOLANTE_EXISTENTE', pedidoId: v.id, label: v.identificadorCliente })
    setVolanteDetalhe(null)
    setCarrinho([])
    setErro(null)
  }

  function enviarCozinha() {
    if (!destino || carrinho.length === 0) return
    setErro(null)
    startTransition(async () => {
      const itens = carrinho.map(i => ({ tipo: i.tipo, id: i.id, quantidade: i.quantidade, notas: i.notas || null }))

      const res = destino.tipo === 'VOLANTE_EXISTENTE'
        ? await fetch(`/api/pedidos/${destino.pedidoId}/itens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itens }),
          })
        : await fetch('/api/pedidos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              canal,
              ...(destino.tipo === 'MESA' ? { mesaId: destino.mesaId } : { identificadorCliente: destino.ref }),
              itens,
            }),
          })

      const data = await res.json()
      if (!res.ok) {
        setErro(data.erro ?? 'Erro ao enviar o pedido')
        return
      }

      const label = destino.tipo === 'MESA' ? destino.label : destino.tipo === 'VOLANTE_NOVO' ? destino.ref : destino.label
      setToast(`✅ ${label} — pedido enviado à cozinha!`)
      setTimeout(() => setToast(null), 4000)
      setCarrinho([])
      setDestino(null)
      router.refresh()
    })
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const zonas = Array.from(new Set(mesas.map(m => m.zona ?? 'Sem Zona')))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      {/* Alerta SSE: só os pedidos lançados por ESTE garçom */}
      <ProntoAlert apenasGarconId={garcom.id} />

      {/* ─── Topbar ───────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 16px', borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-bg-surface)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
            background: 'var(--color-accent-muted)', color: 'var(--color-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800,
          }}>
            {garcom.nome.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>👤 {garcom.nome}</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Comanda Tablet</div>
          </div>
        </div>

        {/* Toggle de canal */}
        {canais.length > 1 && (
          <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
            {canais.map(c => (
              <button
                key={c}
                onClick={() => { setCanal(c); escolherGrupo(null) }}
                className={`btn btn-sm btn-touch ${canal === c ? 'btn-primary' : 'btn-secondary'}`}
              >
                {c === 'RESTAURANTE' ? '🍽️ Restaurante' : '🏊 Piscina'}
              </button>
            ))}
          </div>
        )}
        {canais.length === 1 && (
          <span className="badge badge-info" style={{ marginLeft: 'auto' }}>
            {canal === 'RESTAURANTE' ? '🍽️ Restaurante' : '🏊 Piscina'}
          </span>
        )}

        <button onClick={handleLogout} className="btn btn-ghost btn-sm btn-touch" style={{ flexShrink: 0 }}>
          🔄 Sair / Trocar
        </button>
      </header>

      {/* Toast de envio */}
      {toast && (
        <div className="toast-pronto" style={{ background: 'var(--color-success-muted)' }}>
          {toast}
        </div>
      )}

      {/* ─── Etapa 1: escolher destino ────────────────────── */}
      {!destino && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 800 }}>Escolha a mesa ou abra um pedido volante</h1>
            <button
              onClick={() => setModalVolante(true)}
              className="btn btn-primary btn-touch"
              style={{ marginLeft: 'auto' }}
            >
              🧍 ➕ Pedido Volante / Balcão
            </button>
          </div>

          {/* Volantes abertos deste garçom */}
          {volantes.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                🧍 Os meus pedidos volantes
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                {volantes.map(v => {
                  const total = v.linhas.reduce((acc, l) => acc + l.precoUnitario * l.quantidade, 0)
                  return (
                    <div key={v.id} className="card" style={{ padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 700, fontSize: '14px' }}>🧍 {v.identificadorCliente}</span>
                        <span className={`badge ${v.estado === 'PRONTO' ? 'badge-success' : v.estado === 'PARCIALMENTE_PRONTO' ? 'badge-info' : 'badge-warning'}`}>{v.estado === 'ENTREGUE' ? 'POR PAGAR' : v.estado.replace(/_/g, ' ')}</span>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-accent)', marginBottom: '10px' }}>MT {total.toFixed(2)}</div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => setVolanteDetalhe(v)} className="btn btn-secondary btn-sm btn-touch" style={{ flex: 1, justifyContent: 'center' }}>Ver</button>
                        <button onClick={() => retomarVolante(v)} className="btn btn-secondary btn-sm btn-touch" style={{ flex: 1, justifyContent: 'center' }}>➕ Itens</button>
                        <button onClick={() => setCheckoutVolante(v)} className="btn btn-primary btn-sm btn-touch" style={{ flex: 1, justifyContent: 'center' }}>💳</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Grelha de mesas por zona */}
          {zonas.map(zona => (
            <div key={zona} style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                {zona}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '10px' }}>
                {mesas.filter(m => (m.zona ?? 'Sem Zona') === zona).map(mesa => (
                  <button
                    key={mesa.id}
                    onClick={() => escolherMesa(mesa)}
                    className={`mesa-card ${MESA_CLASSE[mesa.estado] ?? 'mesa-livre'} btn-touch`}
                    style={{ border: 'none', cursor: 'pointer', textAlign: 'center', minHeight: '72px' }}
                  >
                    <div style={{ fontSize: '22px', fontWeight: 800 }}>{mesa.numero}</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                      {mesa.estado === 'LIVRE' ? 'Livre' : mesa.estado === 'OCUPADA' ? 'Ocupada' : mesa.estado === 'CONTA_PEDIDA' ? 'Conta' : 'Reservada'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Etapa 2: lançar itens ────────────────────────── */}
      {destino && (
        <div className="split-layout" style={{ flex: 1, minHeight: 0, height: 'auto' }}>
          {/* Esquerda: catálogo */}
          <div className="split-main" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <button onClick={() => { setDestino(null); setCarrinho([]) }} className="btn btn-secondary btn-sm btn-touch">←</button>
              <div style={{ fontWeight: 800, fontSize: '16px' }}>
                {destino.tipo === 'MESA' ? `🍽️ ${destino.label}` : destino.tipo === 'VOLANTE_NOVO' ? `🧍 ${destino.ref}` : `🧍 ${destino.label} (adicionar)`}
              </div>
            </div>

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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                {fichas.map(f => {
                  const noCarrinho = carrinho.find(i => i.tipo === 'ficha' && i.id === f.id)
                  return (
                    <button
                      key={f.id}
                      onClick={() => adicionar('ficha', f.id, f.nome, f.precoVenda)}
                      className="card btn-touch"
                      style={{
                        padding: '14px', textAlign: 'left', cursor: 'pointer', border: 'none', position: 'relative',
                        background: noCarrinho ? 'var(--color-accent-muted)' : 'var(--color-bg-elevated)',
                      }}
                    >
                      {noCarrinho && (
                        <div style={{ position: 'absolute', top: '6px', right: '6px', background: 'var(--color-accent)', color: '#000', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800 }}>{noCarrinho.quantidade}</div>
                      )}
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>🍸 Bar</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>{f.nome}</div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-accent)' }}>MT {f.precoVenda.toFixed(2)}</div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Produtos */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
              {produtosFiltrados.map(p => {
                const noCarrinho = carrinho.find(i => i.tipo === 'produto' && i.id === p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => adicionar('produto', p.id, p.nome, Number(p.precoVenda))}
                    className="card btn-touch"
                    style={{
                      padding: '14px', textAlign: 'left', cursor: 'pointer', border: 'none', position: 'relative',
                      background: noCarrinho ? 'var(--color-accent-muted)' : 'var(--color-bg-elevated)',
                    }}
                  >
                    {noCarrinho && (
                      <div style={{ position: 'absolute', top: '6px', right: '6px', background: 'var(--color-accent)', color: '#000', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800 }}>{noCarrinho.quantidade}</div>
                    )}
                    {p.imagemUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imagemUrl} alt={p.nome} loading="lazy"
                        style={{ width: '100%', height: '72px', objectFit: 'cover', borderRadius: '8px', marginBottom: '8px' }}
                      />
                    )}
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                      {p.categoria.nome}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px', lineHeight: 1.3 }}>{p.nome}</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-accent)' }}>MT {Number(p.precoVenda).toFixed(2)}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Direita: carrinho / comanda */}
          <div className="split-side">
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', fontWeight: 700, fontSize: '15px' }}>
              🛒 Comanda {carrinho.length > 0 && `(${carrinho.reduce((a, i) => a + i.quantidade, 0)})`}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {carrinho.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                  Toque nos produtos para adicionar
                </div>
              ) : (
                carrinho.map(item => {
                  const k = chave(item)
                  return (
                    <div key={k} style={{
                      padding: '12px', borderRadius: '10px', marginBottom: '8px',
                      background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 600 }}>{item.nome}</div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>MT {item.preco.toFixed(2)} un.</div>
                        </div>
                        {/* Botões gigantes +/− */}
                        <button onClick={() => ajustar(item.tipo, item.id, -1)} className="btn btn-secondary btn-touch" style={{ padding: 0, width: '48px', justifyContent: 'center', fontSize: '22px' }}>−</button>
                        <span style={{ fontSize: '18px', fontWeight: 800, minWidth: '28px', textAlign: 'center' }}>{item.quantidade}</span>
                        <button onClick={() => ajustar(item.tipo, item.id, +1)} className="btn btn-secondary btn-touch" style={{ padding: 0, width: '48px', justifyContent: 'center', fontSize: '22px' }}>+</button>
                      </div>

                      {/* Notas rápidas */}
                      <button
                        onClick={() => setNotasAbertas(notasAbertas === k ? null : k)}
                        className="btn btn-ghost btn-sm"
                        style={{ marginTop: '6px', fontSize: '12px', padding: '4px 8px' }}
                      >
                        📝 {item.notas ? item.notas : 'Adicionar nota...'}
                      </button>
                      {notasAbertas === k && (
                        <div style={{ marginTop: '6px' }}>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                            {NOTAS_RAPIDAS.map(n => {
                              const ativa = item.notas.split(',').map(s => s.trim()).includes(n)
                              return (
                                <button
                                  key={n}
                                  onClick={() => toggleNotaRapida(k, n)}
                                  className={`btn btn-sm btn-touch ${ativa ? 'btn-primary' : 'btn-secondary'}`}
                                  style={{ fontSize: '12px' }}
                                >
                                  {n}
                                </button>
                              )
                            })}
                          </div>
                          <input
                            className="input"
                            placeholder="Nota livre..."
                            value={item.notas}
                            onChange={e => setCarrinho(prev => prev.map(i => chave(i) === k ? { ...i, notas: e.target.value } : i))}
                            style={{ fontSize: '13px' }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Rodapé fixo: total + ENVIAR */}
            <div style={{ padding: '14px 16px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
              {carrinho.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontWeight: 600 }}>Total</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-accent)' }}>MT {totalCarrinho.toFixed(2)}</span>
                </div>
              )}
              {erro && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '10px' }}>
                  ⚠ {erro}
                </div>
              )}
              <button
                onClick={enviarCozinha}
                disabled={carrinho.length === 0 || isPending}
                className="btn btn-primary btn-xl btn-touch"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {isPending
                  ? <><div className="spinner" style={{ width: '18px', height: '18px' }} /> A enviar...</>
                  : '📤 ENVIAR À COZINHA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: novo pedido volante ───────────────────── */}
      {modalVolante && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }} onClick={() => setModalVolante(false)}>
          <div className="card animate-fade-in" onClick={e => e.stopPropagation()} style={{ padding: '28px', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>🧍 Pedido Volante / Balcão</h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Cliente sem mesa. Dê uma referência para identificar (opcional).
            </p>
            <input
              className="input"
              placeholder='Ex: "Balcão — João", "Grupo de pé"'
              value={volanteRef}
              onChange={e => setVolanteRef(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') abrirVolanteNovo() }}
              autoFocus
              style={{ marginBottom: '14px', minHeight: '48px', fontSize: '15px' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setModalVolante(false)} className="btn btn-secondary btn-touch" style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
              <button onClick={abrirVolanteNovo} className="btn btn-primary btn-touch" style={{ flex: 2, justifyContent: 'center' }}>
                Continuar →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: detalhe do volante ────────────────────── */}
      {volanteDetalhe && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }} onClick={() => setVolanteDetalhe(null)}>
          <div className="card animate-fade-in" onClick={e => e.stopPropagation()} style={{ padding: '24px', maxWidth: '420px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '12px' }}>🧍 {volanteDetalhe.identificadorCliente}</h3>
            {volanteDetalhe.linhas.map(l => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', borderBottom: '1px solid var(--color-border)' }}>
                <span>{l.quantidade}× {l.nome}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>MT {(l.precoUnitario * l.quantidade).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 800 }}>
              <span>Total</span>
              <span style={{ color: 'var(--color-accent)' }}>
                MT {volanteDetalhe.linhas.reduce((a, l) => a + l.precoUnitario * l.quantidade, 0).toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setVolanteDetalhe(null)} className="btn btn-secondary btn-touch" style={{ flex: 1, justifyContent: 'center' }}>Fechar</button>
              <button onClick={() => retomarVolante(volanteDetalhe)} className="btn btn-primary btn-touch" style={{ flex: 1, justifyContent: 'center' }}>➕ Adicionar Itens</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: checkout do volante (divisão + recibo) ─── */}
      {checkoutVolante && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}>
          <div className="card animate-fade-in" style={{ padding: '28px', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <CheckoutPanel
              tipo="PEDIDO"
              alvoId={checkoutVolante.id}
              titulo={checkoutVolante.identificadorCliente}
              canalLabel={`${canal === 'PISCINA' ? 'Piscina' : 'Restaurante'} — ${checkoutVolante.identificadorCliente}`}
              linhas={checkoutVolante.linhas}
              operador={garcom.nome}
              onCancelar={() => setCheckoutVolante(null)}
              onSucesso={() => { setCheckoutVolante(null); router.refresh() }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
