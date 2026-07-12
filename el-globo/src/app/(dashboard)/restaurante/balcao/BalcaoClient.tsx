'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ReciboTermico } from '@/components/ReciboTermico'
import { ImpressoraConfig } from '@/components/ImpressoraConfig'
import { imprimirReciboFisico } from '@/lib/imprimir-client'
import { DadosRecibo } from '@/lib/recibo'

interface Produto {
  id: string; nome: string; precoVenda: number; stockAtual: number
  // Unidades vendáveis (inclui caixas do pai via auto-unboxing)
  disponivel: number
  imagemUrl: string | null
  categoria: { id: string; nome: string; icone: string | null }
}
// disponivel: limitado pelo ingrediente mais escasso; null = sem receita (sem limite)
interface FichaTecnica { id: string; nome: string; precoVenda: number; disponivel: number | null }

interface ItemCarrinho {
  tipo: 'produto' | 'ficha'; id: string; nome: string
  preco: number; quantidade: number; notas: string
}

type MetodoPagamento = 'DINHEIRO' | 'CARTAO' | 'MOBILE_MONEY'

const NOTAS_RAPIDAS = [100, 200, 500, 1000, 2000]

export function BalcaoClient({ produtos, fichas, operador }: {
  produtos: Produto[]; fichas: FichaTecnica[]; operador: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [pesquisa, setPesquisa] = useState('')
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>('Tudo')
  const [nomeCliente, setNomeCliente] = useState('')
  const [metodoPag, setMetodoPag] = useState<MetodoPagamento>('DINHEIRO')
  const [valorRecebido, setValorRecebido] = useState('')
  const [etapa, setEtapa] = useState<'venda' | 'sucesso'>('venda')
  const [ultimaVenda, setUltimaVenda] = useState<{ total: number; troco: number; numero: number; gaveta: boolean } | null>(null)
  const [recibo, setRecibo] = useState<DadosRecibo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // Pedido criado mas pagamento falhou — recuperável no checkout de volante
  const [pedidoPorCobrar, setPedidoPorCobrar] = useState<string | null>(null)
  const pesquisaRef = useRef<HTMLInputElement>(null)

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

  function ajustarQuantidade(tipo: string, id: string, delta: number) {
    if (delta > 0 && !podeAdicionar(tipo, id)) return
    setCarrinho(prev => prev
      .map(i => i.tipo === tipo && i.id === id ? { ...i, quantidade: Math.max(0, i.quantidade + delta) } : i)
      .filter(i => i.quantidade > 0)
    )
  }

  const totalCarrinho = carrinho.reduce((acc, i) => acc + i.preco * i.quantidade, 0)
  const troco = Number(valorRecebido) - totalCarrinho

  function finalizarVendaBalcao() {
    if (carrinho.length === 0) return
    setErro(null)
    startTransition(async () => {
      // 1) Criar o pedido volante — desconta stock e envia os itens
      //    para a Cozinha/Bar via SSE
      let pedidoId = pedidoPorCobrar
      if (!pedidoId) {
        const resPedido = await fetch('/api/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canal: 'RESTAURANTE',
            identificadorCliente: nomeCliente.trim() ? `Balcão — ${nomeCliente.trim()}` : 'Balcão',
            itens: carrinho.map(i => ({
              tipo: i.tipo, id: i.id, quantidade: i.quantidade, notas: i.notas || null,
            })),
          }),
        })
        const dataPedido = await resPedido.json()
        if (!resPedido.ok) {
          setErro(dataPedido.erro ?? 'Erro ao criar o pedido')
          return
        }
        pedidoId = dataPedido.pedido.id as string
      }

      // 2) Faturar imediatamente (o pedido continua no KDS até "Entregar")
      const resCheckout = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'PEDIDO',
          id: pedidoId,
          metodoPagamento: metodoPag,
          valorRecebido: metodoPag === 'DINHEIRO' ? Number(valorRecebido) : totalCarrinho,
        }),
      })
      const dataCheckout = await resCheckout.json()
      if (!resCheckout.ok) {
        // Pedido já foi criado — não repetir o passo 1 (duplicaria stock/KDS)
        setPedidoPorCobrar(pedidoId)
        setErro(dataCheckout.erro ?? 'Pedido criado mas o pagamento falhou — tente cobrar de novo')
        return
      }
      setPedidoPorCobrar(null)

      // 3) Recibo + impressão (gaveta abre em dinheiro). Os itens vêm da
      //    venda devolvida pelo servidor — fonte de verdade mesmo num
      //    retry em que o carrinho local já não corresponda ao pedido.
      const venda = dataCheckout.venda
      const abrirGaveta = metodoPag === 'DINHEIRO'
      const trocoVenda = venda.troco != null ? Number(venda.troco) : 0
      const dadosRecibo: DadosRecibo = {
        numero: venda.numero,
        criadoEm: venda.criadoEm ?? new Date(),
        canalLabel: venda.identificadorCliente
          ? `Restaurante — ${venda.identificadorCliente}`
          : 'Restaurante — Balcão',
        operador,
        itens: (venda.itens ?? []).map((i: { nomeProduto: string; quantidade: number; precoUnitario: unknown }) => ({
          nome: i.nomeProduto, quantidade: i.quantidade, precoUnitario: Number(i.precoUnitario),
        })),
        subtotal: Number(venda.subtotal),
        desconto: Number(venda.desconto ?? 0),
        total: Number(venda.total),
        metodoPagamento: metodoPag,
        valorRecebido: venda.valorRecebido != null ? Number(venda.valorRecebido) : null,
        troco: trocoVenda > 0 ? trocoVenda : null,
      }
      setRecibo(dadosRecibo)
      setUltimaVenda({
        total: Number(venda.total),
        troco: trocoVenda,
        numero: venda.numero,
        gaveta: abrirGaveta,
      })
      setCarrinho([])
      setPesquisa('')
      setNomeCliente('')
      setValorRecebido('')
      setEtapa('sucesso')

      await imprimirReciboFisico(dadosRecibo, abrirGaveta)
      setTimeout(() => { setEtapa('venda'); pesquisaRef.current?.focus() }, 4000)
    })
  }

  return (
    <div className="split-layout">
      {/* Recibo invisível — aparece apenas no @media print */}
      {recibo && <ReciboTermico dados={recibo} />}

      {/* ── Left: Produtos ─────────────────────────────── */}
      <div className="split-main" style={{ padding: '16px' }}>
        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => router.push('/restaurante/mesas')} className="btn btn-ghost btn-sm">←</button>
          <h1 style={{ fontSize: '18px', fontWeight: 800 }}>🥡 Venda ao Balcão</h1>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--color-text-muted)' }}>
            Takeaway · sem mesa
          </span>
          <ImpressoraConfig />
        </div>

        <input
          ref={pesquisaRef}
          className="input"
          placeholder="🔍 Pesquisar produto..."
          value={pesquisa}
          onChange={e => setPesquisa(e.target.value)}
          style={{ marginBottom: '12px' }}
          autoFocus
        />

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
                    onClick={() => adicionarAoCarrinho('ficha', f.id, f.nome, f.precoVenda)}
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
                      MT {f.precoVenda.toFixed(2)}
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
          {produtosFiltrados.map(p => {
            const noCarrinho = carrinho.find(i => i.tipo === 'produto' && i.id === p.id)
            const esgotado = p.disponivel <= 0
            const bloqueado = !podeAdicionar('produto', p.id)
            return (
              <button
                key={p.id}
                onClick={() => adicionarAoCarrinho('produto', p.id, p.nome, p.precoVenda)}
                disabled={bloqueado}
                className="card card-hover"
                style={{
                  padding: '12px', textAlign: 'left', border: 'none',
                  cursor: bloqueado ? 'not-allowed' : 'pointer',
                  opacity: bloqueado ? 0.45 : 1,
                  background: noCarrinho ? 'var(--color-accent-muted)' : 'var(--color-bg-elevated)',
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
                {p.imagemUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imagemUrl} alt={p.nome} loading="lazy"
                    style={{ width: '100%', height: '64px', objectFit: 'cover', borderRadius: '6px', marginBottom: '6px' }}
                  />
                )}
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                  {p.categoria.icone} {p.categoria.nome}
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{p.nome}</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-accent)' }}>
                  MT {p.precoVenda.toFixed(2)}
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
      </div>

      {/* ── Right: Carrinho + Pagamento ────────────────── */}
      <div className="split-side">

        {/* Sucesso overlay */}
        {etapa === 'sucesso' && ultimaVenda && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '12px',
          }}>
            <div style={{ fontSize: '72px' }}>✅</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-success)' }}>Venda Efetuada!</div>
            <div style={{ fontSize: '24px', fontWeight: 800 }}>MT {ultimaVenda.total.toFixed(2)}</div>
            {ultimaVenda.troco > 0 && (
              <div style={{
                padding: '12px 24px', borderRadius: '10px',
                background: 'var(--color-warning-muted)', color: 'var(--color-warning)',
                fontSize: '18px', fontWeight: 700,
              }}>
                Troco: MT {ultimaVenda.troco.toFixed(2)}
              </div>
            )}
            {ultimaVenda.gaveta && (
              <div style={{ fontSize: '13px', color: 'var(--color-info)' }}>💰 Gaveta de dinheiro aberta</div>
            )}
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Nº {ultimaVenda.numero}</div>
            <button onClick={() => window.print()} className="btn btn-secondary btn-sm">🖨 Reimprimir Recibo</button>
          </div>
        )}

        <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700 }}>🛒 Carrinho</h2>
            {carrinho.length > 0 && (
              <button
                onClick={() => setCarrinho([])}
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-danger)', fontSize: '12px' }}
              >
                Limpar
              </button>
            )}
          </div>
          <input
            className="input"
            placeholder="Nome do cliente (opcional)"
            value={nomeCliente}
            onChange={e => setNomeCliente(e.target.value)}
            maxLength={60}
            style={{ fontSize: '13px' }}
          />
        </div>

        {/* Itens */}
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
                  <button
                    onClick={() => setCarrinho(prev => prev.filter(i => !(i.tipo === item.tipo && i.id === item.id)))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: '16px' }}
                  >×</button>
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

        {/* Totais e pagamento */}
        <div style={{ borderTop: '1px solid var(--color-border)', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Total</span>
            <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-accent)' }}>
              MT {totalCarrinho.toFixed(2)}
            </span>
          </div>

          {/* Método de pagamento */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '12px' }}>
            {([
              { id: 'DINHEIRO', label: '💵 Dinheiro' },
              { id: 'CARTAO', label: '💳 Cartão' },
              { id: 'MOBILE_MONEY', label: '📱 Mobile' },
            ] as const).map(m => (
              <button
                key={m.id}
                onClick={() => setMetodoPag(m.id)}
                className={`btn btn-sm ${metodoPag === m.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ justifyContent: 'center', fontSize: '11px' }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Valor recebido (só para dinheiro) */}
          {metodoPag === 'DINHEIRO' && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
                <button className="btn btn-secondary btn-sm" style={{ justifyContent: 'center' }} onClick={() => setValorRecebido(totalCarrinho.toFixed(2))}>
                  Exato
                </button>
                {NOTAS_RAPIDAS.map(n => (
                  <button key={n} className="btn btn-secondary btn-sm" style={{ justifyContent: 'center' }} onClick={() => setValorRecebido(String(n))}>
                    {n} MT
                  </button>
                ))}
              </div>
              <input
                className="input"
                type="number"
                placeholder="Valor recebido (MT)"
                value={valorRecebido}
                onChange={e => setValorRecebido(e.target.value)}
                style={{ fontSize: '18px', fontWeight: 700, textAlign: 'right' }}
              />
              {Number(valorRecebido) >= totalCarrinho && Number(valorRecebido) > 0 && (
                <div style={{
                  marginTop: '8px', padding: '10px 14px', borderRadius: '8px',
                  background: 'var(--color-success-muted)', color: 'var(--color-success)',
                  fontSize: '16px', fontWeight: 700, textAlign: 'center',
                }}>
                  Troco: MT {(Number(valorRecebido) - totalCarrinho).toFixed(2)}
                </div>
              )}
            </div>
          )}

          {erro && (
            <div style={{
              padding: '10px 14px', borderRadius: '8px', marginBottom: '12px',
              background: 'var(--color-danger-muted)', color: 'var(--color-danger)',
              fontSize: '13px', fontWeight: 600,
            }}>
              ⚠ {erro}
              {pedidoPorCobrar && (
                <div style={{ marginTop: '6px' }}>
                  O pedido já está na cozinha e na lista de Volantes.{' '}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => router.push(`/restaurante/checkout/pedido/${pedidoPorCobrar}`)}
                    style={{ textDecoration: 'underline', padding: 0 }}
                  >
                    Cobrar no checkout →
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={finalizarVendaBalcao}
            disabled={
              (carrinho.length === 0 && !pedidoPorCobrar) || isPending ||
              (metodoPag === 'DINHEIRO' && Number(valorRecebido) < totalCarrinho)
            }
            className="btn btn-primary btn-lg"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {isPending
              ? <><div className="spinner" style={{ width: '16px', height: '16px' }} /> A processar...</>
              : pedidoPorCobrar ? '💳 Tentar Cobrar de Novo' : '✅ Pagar e Enviar'
            }
          </button>
        </div>
      </div>
    </div>
  )
}
