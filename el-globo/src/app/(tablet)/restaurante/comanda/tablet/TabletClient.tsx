'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ProntoAlert } from '@/components/ProntoAlert'
import { CheckoutPanel, LinhaConta } from '@/components/CheckoutPanel'
import { gerarTextoConsulta } from '@/lib/recibo'
import { imprimirTextoFisico } from '@/lib/imprimir-client'
import { CatalogoPos, Produto, Ficha } from './CatalogoPos'

// Ecrã fullscreen para os tablets dos garçons: escolher destino
// (mesa ou pedido volante) → lançar itens → ENVIAR À COZINHA.
// Todos os alvos de toque têm ≥48px (classe .btn-touch).
// Layout .pos-* (globals.css): paisagem = carrinho lateral fixo 380px;
// retrato (≤900px) = carrinho em bottom-sheet + cartbar fixa.

type Canal = 'RESTAURANTE' | 'PISCINA'

interface Mesa { id: string; numero: number; nome: string | null; zona: string | null; estado: string }
interface Volante {
  id: string
  identificadorCliente: string
  estado: string
  criadoEm: string
  linhas: LinhaConta[]
}

// Pedidos abertos da mesa (aba "Pedidos", pré-conta e checkout).
// Vêm de GET /api/pedidos?mesaId= — o MESMO predicado da cobrança.
interface ItemPedidoMesa {
  id: string; quantidade: number; precoUnitario: number; estadoKDS: string
  produto: { nome: string } | null; fichaTecnica: { nome: string } | null
}
interface PedidoMesa { id: string; estado: string; criadoEm: string; itens: ItemPedidoMesa[] }

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

const ESTADO_BADGE: Record<string, string> = {
  PENDENTE: 'badge-warning', EM_PREPARACAO: 'badge-info', PARCIALMENTE_PRONTO: 'badge-info',
  PRONTO: 'badge-success', ENTREGUE: 'badge-info',
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
  const [abaAtiva, setAbaAtiva] = useState<'menu' | 'pedidos'>('menu')
  const [pedidosMesa, setPedidosMesa] = useState<PedidoMesa[]>([])
  const [modalVolante, setModalVolante] = useState(false)
  const [volanteRef, setVolanteRef] = useState('')
  const [volanteDetalhe, setVolanteDetalhe] = useState<Volante | null>(null)
  const [checkoutVolante, setCheckoutVolante] = useState<Volante | null>(null)
  const [checkoutMesa, setCheckoutMesa] = useState<{ mesaId: string; label: string; linhas: LinhaConta[] } | null>(null)
  const [notasAbertas, setNotasAbertas] = useState<string | null>(null) // chave do item com painel de notas aberto
  // Retrato: o carrinho é um bottom-sheet; true = aberto
  const [carrinhoAberto, setCarrinhoAberto] = useState(false)
  const [imprimindo, setImprimindo] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Catálogo por canal (Restaurante ↔ Piscina)
  const carregarCatalogo = useCallback(async (c: Canal) => {
    const [resProd, resFichas] = await Promise.all([
      fetch(`/api/produtos?canal=${c}`),
      c === 'RESTAURANTE' ? fetch('/api/fichas-tecnicas?ativo=true&canal=RESTAURANTE') : Promise.resolve(null),
    ])
    const prod = await resProd.json()
    // Produtos com preço 0 são internos (caixas de armazém, garrafas de
    // bar a granel) — não aparecem no catálogo do garçom.
    setProdutos(Array.isArray(prod) ? prod.filter((p: Produto) => Number(p.precoVenda) > 0) : [])
    if (resFichas) {
      const f = await resFichas.json()
      setFichas(Array.isArray(f) ? f.map((x: { id: string; nome: string; precoVenda: unknown; disponivel?: number | null }) => ({
        id: x.id, nome: x.nome, precoVenda: Number(x.precoVenda), disponivel: x.disponivel ?? null,
      })) : [])
    } else {
      setFichas([])
    }
  }, [])

  useEffect(() => { carregarCatalogo(canal) }, [canal, carregarCatalogo])

  // Pedidos por faturar da mesa — fonte fresca do servidor, usada pela
  // aba Pedidos e como base de exibição do checkout/pré-conta.
  const carregarPedidosMesa = useCallback(async (mesaId: string): Promise<PedidoMesa[]> => {
    const res = await fetch(`/api/pedidos?mesaId=${mesaId}`)
    const data = await res.json()
    const lista: PedidoMesa[] = res.ok && Array.isArray(data) ? data : []
    setPedidosMesa(lista)
    return lista
  }, [])

  const totalCarrinho = carrinho.reduce((acc, i) => acc + i.preco * i.quantidade, 0)
  const chave = (i: { tipo: string; id: string }) => `${i.tipo}-${i.id}`

  // ── Guardas de stock (advisory — a guarda real é o decremento
  //    condicional do envio; espelham o POS do dashboard) ──────────
  const qtdDe = useCallback((tipo: 'produto' | 'ficha', id: string) =>
    carrinho.find(i => i.tipo === tipo && i.id === id)?.quantidade ?? 0, [carrinho])

  // null = sem limite (ficha sem receita)
  function limiteDisponivel(tipo: string, id: string): number | null {
    if (tipo === 'produto') return produtos.find(p => p.id === id)?.disponivel ?? null
    return fichas.find(f => f.id === id)?.disponivel ?? null
  }

  function podeAdicionar(tipo: 'produto' | 'ficha', id: string) {
    const limite = limiteDisponivel(tipo, id)
    return limite === null || qtdDe(tipo, id) < limite
  }

  function adicionar(tipo: 'produto' | 'ficha', id: string, nome: string, preco: number) {
    if (!podeAdicionar(tipo, id)) return
    setCarrinho(prev => {
      const ex = prev.find(i => i.tipo === tipo && i.id === id)
      if (ex) return prev.map(i => i.tipo === tipo && i.id === id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { tipo, id, nome, preco, quantidade: 1, notas: '' }]
    })
  }

  function ajustar(tipo: 'produto' | 'ficha', id: string, delta: number) {
    if (delta > 0 && !podeAdicionar(tipo, id)) return
    setCarrinho(prev => prev
      .map(i => i.tipo === tipo && i.id === id ? { ...i, quantidade: Math.max(0, i.quantidade + delta) } : i)
      .filter(i => i.quantidade > 0))
  }

  function remover(tipo: string, id: string) {
    setCarrinho(prev => prev.filter(i => !(i.tipo === tipo && i.id === id)))
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

  function sairDoDestino() {
    setDestino(null)
    setCarrinho([])
    setCarrinhoAberto(false)
    setAbaAtiva('menu')
    setPedidosMesa([])
    setErro(null)
  }

  function escolherMesa(mesa: Mesa) {
    if (mesa.estado === 'LIVRE') {
      // Abre a mesa em background (mesmo padrão do MesasClient)
      fetch(`/api/mesas/${mesa.id}/abrir`, { method: 'POST' })
    }
    setDestino({ tipo: 'MESA', mesaId: mesa.id, label: `Mesa ${mesa.numero}` })
    setCarrinho([])
    setAbaAtiva('menu')
    setErro(null)
    carregarPedidosMesa(mesa.id)
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
        // Envio falhou (ex.: stock insuficiente na corrida do decremento):
        // o carrinho fica INTACTO e o sheet abre para o erro ser visível.
        setErro(data.erro ?? 'Erro ao enviar o pedido')
        setCarrinhoAberto(true)
        return
      }

      // Reset SÓ no caminho de sucesso
      const label = destino.tipo === 'MESA' ? destino.label : destino.tipo === 'VOLANTE_NOVO' ? destino.ref : destino.label
      setToast(`✅ ${label} — pedido enviado à cozinha!`)
      setTimeout(() => setToast(null), 4000)
      setCarrinho([])
      setCarrinhoAberto(false)
      setDestino(null)
      setPedidosMesa([])
      setAbaAtiva('menu')
      router.refresh()
    })
  }

  // ── Pré-conta e fecho de conta da mesa ─────────────────────────
  // Ambos partem de um fetch FRESCO a /api/pedidos?mesaId= (mesmo
  // predicado da cobrança) — nunca do estado local, que pode estar
  // desatualizado se outro dispositivo lançou pedidos entretanto.
  const linhasDe = (pedidos: PedidoMesa[]): LinhaConta[] =>
    pedidos.flatMap(p => p.itens.map(i => ({
      id: i.id,
      nome: i.produto?.nome ?? i.fichaTecnica?.nome ?? 'Item',
      quantidade: i.quantidade,
      precoUnitario: Number(i.precoUnitario),
    })))

  async function imprimirConta() {
    if (destino?.tipo !== 'MESA' || imprimindo) return
    setImprimindo(true)
    setErro(null)
    try {
      const pedidos = await carregarPedidosMesa(destino.mesaId)
      if (pedidos.length === 0) {
        setErro('Mesa sem pedidos por faturar')
        return
      }
      const itens = linhasDe(pedidos)
      const texto = gerarTextoConsulta({
        mesaLabel: destino.label,
        criadoEm: new Date(),
        operador: garcom.nome,
        itens,
        total: itens.reduce((acc, l) => acc + l.precoUnitario * l.quantidade, 0),
      })
      const via = await imprimirTextoFisico(texto)
      if (via === 'nenhuma') alert('Impressora não disponível — emparelhe a impressora USB ou verifique a impressora de rede.')
    } finally {
      setImprimindo(false)
    }
  }

  async function fecharContaMesa() {
    if (destino?.tipo !== 'MESA') return
    setErro(null)
    const pedidos = await carregarPedidosMesa(destino.mesaId)
    if (pedidos.length === 0) {
      setErro('Mesa sem pedidos por faturar')
      return
    }
    // As linhas são só para exibição — o total cobrado é recalculado
    // server-side pelo /api/checkout a partir dos pedidos da mesa.
    setCheckoutMesa({ mesaId: destino.mesaId, label: destino.label, linhas: linhasDe(pedidos) })
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const zonas = Array.from(new Set(mesas.map(m => m.zona ?? 'Sem Zona')))
  const totalConta = pedidosMesa.flatMap(p => p.itens).reduce((acc, i) => acc + Number(i.precoUnitario) * i.quantidade, 0)
  const qtdCarrinho = carrinho.reduce((a, i) => a + i.quantidade, 0)

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
                onClick={() => setCanal(c)}
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
        <div className="pos-layout">
          {/* Esquerda: catálogo / pedidos da mesa */}
          <div className="pos-main">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <button onClick={sairDoDestino} className="btn btn-secondary btn-sm btn-touch">←</button>
              <div style={{ fontWeight: 800, fontSize: '16px' }}>
                {destino.tipo === 'MESA' ? `🍽️ ${destino.label}` : destino.tipo === 'VOLANTE_NOVO' ? `🧍 ${destino.ref}` : `🧍 ${destino.label} (adicionar)`}
              </div>
              {destino.tipo === 'MESA' && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => setAbaAtiva('menu')}
                    className={`btn btn-sm btn-touch ${abaAtiva === 'menu' ? 'btn-primary' : 'btn-secondary'}`}
                  >Menu</button>
                  <button
                    onClick={() => { setAbaAtiva('pedidos'); carregarPedidosMesa(destino.mesaId) }}
                    className={`btn btn-sm btn-touch ${abaAtiva === 'pedidos' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Pedidos {pedidosMesa.length > 0 && `(${pedidosMesa.length})`}
                  </button>
                </div>
              )}
            </div>

            {abaAtiva === 'menu' ? (
              // key={canal}: trocar de canal repõe pesquisa e navegação
              <CatalogoPos key={canal} produtos={produtos} fichas={fichas} qtdDe={qtdDe} onAdicionar={adicionar} />
            ) : (
              // Aba Pedidos: conta aberta da mesa (pedidos por faturar)
              <div>
                {pedidosMesa.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                    Mesa sem pedidos por faturar
                  </div>
                ) : (
                  <>
                    {pedidosMesa.map(p => (
                      <div key={p.id} className="card" style={{ padding: '14px', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            {new Date(p.criadoEm).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className={`badge ${ESTADO_BADGE[p.estado] ?? 'badge-info'}`}>
                            {p.estado === 'ENTREGUE' ? 'POR PAGAR' : p.estado.replace(/_/g, ' ')}
                          </span>
                        </div>
                        {p.itens.map(i => (
                          <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', borderTop: '1px solid var(--color-border)' }}>
                            <span>{i.quantidade}× {i.produto?.nome ?? i.fichaTecnica?.nome ?? 'Item'}</span>
                            <span style={{ color: 'var(--color-text-secondary)' }}>MT {(Number(i.precoUnitario) * i.quantidade).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 4px', fontWeight: 800, fontSize: '15px' }}>
                      <span>Total da Conta</span>
                      <span style={{ color: 'var(--color-accent)' }}>MT {totalConta.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Direita: carrinho / comanda (retrato: bottom-sheet) */}
          <div className={`pos-side${carrinhoAberto ? ' pos-side--open' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 16px', borderBottom: '1px solid var(--color-border)', fontWeight: 700, fontSize: '15px' }}>
              🛒 Comanda {qtdCarrinho > 0 && `(${qtdCarrinho})`}
              <button
                onClick={() => setCarrinhoAberto(false)}
                className="btn btn-secondary btn-sm btn-touch pos-portrait-only"
                style={{ marginLeft: 'auto' }}
              >
                ▼ Fechar
              </button>
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
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 600 }}>{item.nome}</div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>MT {item.preco.toFixed(2)} un.</div>
                        </div>
                        <button
                          onClick={() => remover(item.tipo, item.id)}
                          className="btn btn-ghost btn-sm"
                          aria-label={`Remover ${item.nome}`}
                          style={{ color: 'var(--color-danger)', padding: '4px 8px' }}
                        >✕</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {/* Botões gigantes +/− */}
                        <button onClick={() => ajustar(item.tipo, item.id, -1)} className="btn btn-secondary btn-touch" style={{ padding: 0, width: '48px', justifyContent: 'center', fontSize: '22px' }}>−</button>
                        <span style={{ fontSize: '18px', fontWeight: 800, minWidth: '28px', textAlign: 'center' }}>{item.quantidade}</span>
                        <button onClick={() => ajustar(item.tipo, item.id, +1)} className="btn btn-secondary btn-touch" style={{ padding: 0, width: '48px', justifyContent: 'center', fontSize: '22px' }}>+</button>
                        <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 800, color: 'var(--color-accent)' }}>
                          MT {(item.preco * item.quantidade).toFixed(2)}
                        </span>
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

            {/* Rodapé fixo: total + ENVIAR + conta (mesa) */}
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
                  : '🍳 Enviar para Cozinha/Bar'}
              </button>
              {destino.tipo === 'MESA' && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    onClick={imprimirConta}
                    disabled={imprimindo}
                    className="btn btn-secondary btn-touch"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    {imprimindo ? 'A imprimir...' : '🖨 Imprimir'}
                  </button>
                  <button
                    onClick={fecharContaMesa}
                    className="btn btn-secondary btn-touch"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    💳 Fechar Conta
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Retrato: barra fixa com total + Enviar (o CSS esconde em paisagem) */}
          <div className="pos-cartbar">
            <div style={{ position: 'relative', width: '44px', height: '44px', borderRadius: '11px', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '19px', flexShrink: 0 }}>
              🛒
              {qtdCarrinho > 0 && (
                <div style={{ position: 'absolute', top: '-7px', right: '-7px', width: '22px', height: '22px', borderRadius: '50%', background: 'var(--color-accent)', color: '#000', fontWeight: 800, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{qtdCarrinho}</div>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Total do Pedido</div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--color-accent)' }}>MT {totalCarrinho.toFixed(2)}</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setCarrinhoAberto(true)}
                className="btn btn-secondary btn-touch"
              >
                Ver carrinho ▲
              </button>
              <button
                onClick={enviarCozinha}
                disabled={carrinho.length === 0 || isPending}
                className="btn btn-primary btn-touch"
              >
                {isPending ? 'A enviar...' : '🍳 Enviar'}
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

      {/* ─── Modal: checkout da mesa (divisão + recibo) ────── */}
      {checkoutMesa && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}>
          <div className="card animate-fade-in" style={{ padding: '28px', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <CheckoutPanel
              tipo="MESA"
              alvoId={checkoutMesa.mesaId}
              titulo={checkoutMesa.label}
              canalLabel={`Restaurante — ${checkoutMesa.label}`}
              linhas={checkoutMesa.linhas}
              operador={garcom.nome}
              onCancelar={() => setCheckoutMesa(null)}
              onSucesso={() => { setCheckoutMesa(null); sairDoDestino(); router.refresh() }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
