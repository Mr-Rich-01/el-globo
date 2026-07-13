'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ProntoAlert } from '@/components/ProntoAlert'
import { CheckoutPanel } from '@/components/CheckoutPanel'
import { gerarTextoConsulta } from '@/lib/recibo'
import { imprimirTextoFisico } from '@/lib/imprimir-client'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { ScanToast, useScanToast } from '@/components/ScanToast'

interface Produto {
  id: string; nome: string; precoVenda: number
  stockAtual: number
  // Unidades vendáveis (inclui caixas do pai via auto-unboxing)
  disponivel: number
  codigoBarras: string | null
  categoria: { nome: string; icone: string | null; cor: string | null }
}
// disponivel: limitado pelo ingrediente mais escasso; null = sem receita (sem limite)
interface FichaTecnica { id: string; nome: string; precoVenda: number; disponivel: number | null }
interface ItemPedido {
  id: string; quantidade: number; precoUnitario: number; notas: string | null; estadoKDS: string
  produto: { nome: string } | null; fichaTecnica: { nome: string } | null
}
interface Pedido {
  id: string; estado: string; criadoEm: Date
  itens: ItemPedido[]
  user: { nome: string }
}
interface Aba {
  id: string; identificador: string; nomeCliente: string | null; estado: string
  pedidos: Pedido[]
}

interface ItemCarrinho { tipo: 'produto' | 'ficha'; id: string; nome: string; preco: number; quantidade: number; notas: string }

export function ComandaAbaClient({ aba, produtos, fichas, role = '' }: { aba: Aba; produtos: Produto[]; fichas: FichaTecnica[]; role?: string }) {
  const router = useRouter()
  const podeCancelar = role === 'ADMIN' || role === 'GERENTE'
  const [isPending, startTransition] = useTransition()
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [pesquisa, setPesquisa] = useState('')
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>('Tudo')
  const [abaAtiva, setAbaAtiva] = useState<'menu' | 'pedidos'>('menu')
  const [modalFechar, setModalFechar] = useState(false)

  const abaLabel = `Aba ${aba.identificador}${aba.nomeCliente ? ` — ${aba.nomeCliente}` : ''}`

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

  function qtdNoCarrinho(tipo: string, id: string) {
    return carrinho.find(i => i.tipo === tipo && i.id === id)?.quantidade ?? 0
  }

  // null = sem limite (ficha sem receita)
  function limiteDisponivel(tipo: string, id: string): number | null {
    if (tipo === 'produto') return produtos.find(p => p.id === id)?.disponivel ?? null
    return fichas.find(f => f.id === id)?.disponivel ?? null
  }

  function podeAdicionar(tipo: string, id: string) {
    const limite = limiteDisponivel(tipo, id)
    return limite === null || qtdNoCarrinho(tipo, id) < limite
  }

  function adicionarAoCarrinho(tipo: 'produto' | 'ficha', id: string, nome: string, preco: number) {
    if (!podeAdicionar(tipo, id)) return
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
    if (delta > 0 && !podeAdicionar(tipo, id)) return
    setCarrinho(prev => prev
      .map(i => i.tipo === tipo && i.id === id ? { ...i, quantidade: Math.max(0, i.quantidade + delta) } : i)
      .filter(i => i.quantidade > 0)
    )
  }

  // ── Leitor de código de barras (scan → carrinho) ──────────────
  const { msg: scanMsg, notificar: notificarScan } = useScanToast()

  function processarScan(codigo: string) {
    // O 1º caráter da rajada pode ter escapado para o campo de pesquisa antes
    // da interceção — limpamos para não deixar resíduo a filtrar o catálogo.
    setPesquisa('')
    const produto = produtos.find(p => p.codigoBarras === codigo)
    if (!produto) {
      notificarScan('erro', `Código não reconhecido: ${codigo}`)
      return
    }
    // Cruza com o helper de disponibilidade: bloqueia esgotado / acima do stock
    if (!podeAdicionar('produto', produto.id)) {
      notificarScan('erro', produto.disponivel <= 0
        ? `${produto.nome} está esgotado!`
        : `${produto.nome}: stock máximo atingido (${produto.disponivel})`)
      return
    }
    adicionarAoCarrinho('produto', produto.id, produto.nome, Number(produto.precoVenda))
    notificarScan('ok', `${produto.nome} adicionado`)
    // Um bip enquanto vê os pedidos deve trazer o menu/carrinho à frente
    if (abaAtiva !== 'menu') setAbaAtiva('menu')
  }

  useBarcodeScanner({ onScan: processarScan })

  const totalCarrinho = carrinho.reduce((acc, i) => acc + i.preco * i.quantidade, 0)

  function enviarPedido() {
    if (carrinho.length === 0) return
    startTransition(async () => {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canal: 'PISCINA',
          abaId: aba.id,
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

  function entregarPedido(pedidoId: string) {
    startTransition(async () => {
      await fetch(`/api/pedidos/${pedidoId}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'ENTREGUE' }),
      })
      router.refresh()
    })
  }

  function cancelarPedido(pedidoId: string) {
    if (!confirm('Cancelar este pedido? O stock será reposto.')) return
    startTransition(async () => {
      const res = await fetch(`/api/pedidos/${pedidoId}/cancelar`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.erro ?? 'Erro ao cancelar pedido')
        return
      }
      router.refresh()
    })
  }

  const totalAba = aba.pedidos
    .flatMap(p => p.itens)
    .reduce((acc, i) => acc + i.precoUnitario * i.quantidade, 0)

  // Linhas para o painel de checkout (fecho consolidado via /api/checkout,
  // que NÃO volta a descontar stock — foi descontado nos pedidos)
  const linhasConta = aba.pedidos.flatMap(p =>
    p.itens.map(i => ({
      id: i.id,
      nome: i.produto?.nome ?? i.fichaTecnica?.nome ?? 'Item',
      quantidade: i.quantidade,
      precoUnitario: Number(i.precoUnitario),
    }))
  )

  const [imprimindoConsulta, setImprimindoConsulta] = useState(false)

  // Pré-conta para o cliente conferir — só leitura: não fecha a aba,
  // não gera Venda nem altera o estado dos pedidos
  async function imprimirConsulta() {
    if (aba.pedidos.length === 0 || imprimindoConsulta) return
    setImprimindoConsulta(true)
    try {
      const itens = aba.pedidos.flatMap(p => p.itens.map(i => ({
        nome: i.produto?.nome ?? i.fichaTecnica?.nome ?? 'Item',
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
      })))
      const texto = gerarTextoConsulta({
        mesaLabel: abaLabel,
        criadoEm: new Date(),
        itens,
        total: totalAba,
      })
      const via = await imprimirTextoFisico(texto)
      if (via === 'nenhuma') alert('Impressora não disponível — emparelhe a impressora USB ou verifique a impressora de rede.')
    } finally {
      setImprimindoConsulta(false)
    }
  }

  return (
    <div className="split-layout">
      {/* Alerta em tempo real quando a cozinha marca um pedido como pronto */}
      <ProntoAlert />
      {/* Feedback do leitor de código de barras */}
      <ScanToast msg={scanMsg} />
      {/* Left: Menu */}
      <div className="split-main" style={{ padding: '20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <button onClick={() => router.push('/piscina/abas')} className="btn btn-ghost btn-sm">←</button>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 800 }}>
              🏷 {abaLabel}
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>🏊 Piscina</p>
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
              Pedidos {aba.pedidos.length > 0 && `(${aba.pedidos.length})`}
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
                  {fichasFiltradas.map(f => {
                    const esgotado = f.disponivel !== null && f.disponivel <= 0
                    const bloqueado = !podeAdicionar('ficha', f.id)
                    return (
                      <button
                        key={f.id}
                        onClick={() => adicionarAoCarrinho('ficha', f.id, f.nome, Number(f.precoVenda))}
                        disabled={bloqueado}
                        className="card card-hover"
                        style={{
                          padding: '12px', textAlign: 'left', border: 'none', background: 'var(--color-bg-elevated)',
                          cursor: bloqueado ? 'not-allowed' : 'pointer',
                          opacity: bloqueado ? 0.45 : 1,
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{f.nome}</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-accent)' }}>
                          MT {Number(f.precoVenda).toFixed(2)}
                        </div>
                        {esgotado ? (
                          <span className="badge badge-danger" style={{ marginTop: '4px' }}>Esgotado</span>
                        ) : f.disponivel !== null && f.disponivel <= 5 && (
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-danger)', marginTop: '4px' }}>
                            Restam {f.disponivel}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Produtos */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
              {produtosFiltrados.map(p => {
                const noCarrinho = carrinho.find(i => i.tipo === 'produto' && i.id === p.id)
                const esgotado = p.disponivel <= 0
                const bloqueado = !podeAdicionar('produto', p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => adicionarAoCarrinho('produto', p.id, p.nome, Number(p.precoVenda))}
                    disabled={bloqueado}
                    className="card card-hover"
                    style={{
                      padding: '12px', textAlign: 'left', border: 'none',
                      cursor: bloqueado ? 'not-allowed' : 'pointer',
                      opacity: bloqueado ? 0.45 : 1,
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
                    {esgotado ? (
                      <span className="badge badge-danger" style={{ marginTop: '4px' }}>Esgotado</span>
                    ) : (
                      <div style={{
                        fontSize: '11px', fontWeight: 700, marginTop: '4px',
                        color: p.disponivel <= 5 ? 'var(--color-danger)' : 'var(--color-text-muted)',
                      }}>
                        {p.disponivel} disp.
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          /* Pedidos ativos */
          <div>
            {aba.pedidos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-muted)' }}>
                Sem pedidos nesta aba
              </div>
            ) : (
              aba.pedidos.map(pedido => (
                <div key={pedido.id} className="card" style={{ padding: '16px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Pedido</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {pedido.estado === 'PRONTO' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={isPending}
                          onClick={() => entregarPedido(pedido.id)}
                        >
                          📦 Entregar
                        </button>
                      )}
                      {podeCancelar && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--color-danger)' }}
                          disabled={isPending}
                          onClick={() => cancelarPedido(pedido.id)}
                        >
                          ❌ Cancelar
                        </button>
                      )}
                      <span className={`badge ${pedido.estado === 'PENDENTE' ? 'badge-warning' : pedido.estado === 'PRONTO' || pedido.estado === 'ENTREGUE' ? 'badge-success' : 'badge-info'}`}>
                        {pedido.estado.replace(/_/g, ' ')}
                      </span>
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
            {aba.pedidos.length > 0 && (
              <div style={{ padding: '16px', borderTop: '2px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700 }}>Total da Aba</span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-accent)' }}>
                  MT {totalAba.toFixed(2)}
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
                  placeholder="Nota (ex: sem gelo)..."
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
            onClick={imprimirConsulta}
            disabled={aba.pedidos.length === 0 || imprimindoConsulta}
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
          >
            {imprimindoConsulta ? 'A imprimir...' : '🖨️ Imprimir Conta'}
          </button>
          <button
            onClick={() => setModalFechar(true)}
            disabled={aba.pedidos.length === 0}
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
          >
            💳 Fechar Conta
          </button>
        </div>
      </div>

      {/* ─── Modal: Fechar Conta (mesmo fluxo do ecrã de abas) ── */}
      {modalFechar && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}>
          <div className="card animate-fade-in" style={{ padding: '28px', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <CheckoutPanel
              tipo="ABA"
              alvoId={aba.id}
              titulo={abaLabel}
              canalLabel={`Piscina — Aba ${aba.identificador}`}
              linhas={linhasConta}
              onCancelar={() => setModalFechar(false)}
              onSucesso={() => { setModalFechar(false); router.push('/piscina/abas') }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
