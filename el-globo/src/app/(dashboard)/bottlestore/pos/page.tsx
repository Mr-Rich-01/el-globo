'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { ReciboTermico } from '@/components/ReciboTermico'
import { imprimirReciboFisico } from '@/lib/imprimir-client'
import { DadosRecibo } from '@/lib/recibo'

interface Categoria {
  id: string; nome: string; icone: string | null
  parentCategoryId: string | null
  parent: { id: string; nome: string } | null
}

interface Produto {
  id: string; nome: string; precoVenda: number; codigoBarras: string | null
  stockAtual: number; imagemUrl: string | null; categoria: Categoria
}

interface ItemCarrinho {
  produtoId: string; nome: string; preco: number; quantidade: number; codigoBarras: string | null
}

type MetodoPagamento = 'DINHEIRO' | 'CARTAO' | 'MOBILE_MONEY'

const NOTAS_RAPIDAS = [100, 200, 500, 1000, 2000]

export default function POSPage() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [pesquisa, setPesquisa] = useState('')
  // Filtro hierárquico: grupo pai → subcategorias (chips dependentes)
  const [grupoAtivo, setGrupoAtivo] = useState<string | null>(null)
  const [subAtiva, setSubAtiva] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [etapa, setEtapa] = useState<'venda' | 'pagamento' | 'sucesso'>('venda')
  const [metodoPag, setMetodoPag] = useState<MetodoPagamento>('DINHEIRO')
  const [valorRecebido, setValorRecebido] = useState('')
  const [ultimaVenda, setUltimaVenda] = useState<{ total: number; troco: number; numero: number; gaveta: boolean } | null>(null)
  const [recibo, setRecibo] = useState<DadosRecibo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const pesquisaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/produtos?canal=BOTTLESTORE')
      .then(r => r.json())
      .then(data => setProdutos(Array.isArray(data) ? data : []))
    // Auto-focus no campo de pesquisa (barcode scanner)
    pesquisaRef.current?.focus()
  }, [])

  // Barcode scanner: ao pressionar Enter no campo de pesquisa.
  // Match EXATO de código de barras primeiro — um scan nunca pode
  // adicionar o produto errado por coincidência parcial de nome.
  function handlePesquisaKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      const termo = pesquisa.trim()
      if (!termo) return
      const produto =
        produtos.find(p => p.codigoBarras === termo) ??
        produtos.find(p => p.nome.toLowerCase().includes(termo.toLowerCase()))
      if (produto) {
        adicionarProduto(produto)
        setPesquisa('')
        pesquisaRef.current?.focus()
      }
    }
  }

  function adicionarProduto(produto: Produto) {
    setCarrinho(prev => {
      const ex = prev.find(i => i.produtoId === produto.id)
      if (ex) return prev.map(i => i.produtoId === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { produtoId: produto.id, nome: produto.nome, preco: Number(produto.precoVenda), quantidade: 1, codigoBarras: produto.codigoBarras }]
    })
  }

  function ajustarQuantidade(id: string, delta: number) {
    setCarrinho(prev =>
      prev.map(i => i.produtoId === id ? { ...i, quantidade: Math.max(0, i.quantidade + delta) } : i)
          .filter(i => i.quantidade > 0)
    )
  }

  const totalCarrinho = carrinho.reduce((acc, i) => acc + i.preco * i.quantidade, 0)
  const troco = Number(valorRecebido) - totalCarrinho

  function finalizarVenda() {
    if (carrinho.length === 0) return
    setErro(null)
    startTransition(async () => {
      const res = await fetch('/api/vendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canal: 'BOTTLESTORE',
          metodoPagamento: metodoPag,
          valorRecebido: metodoPag === 'DINHEIRO' ? Number(valorRecebido) : totalCarrinho,
          itens: carrinho.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErro(data.erro ?? 'Erro ao processar a venda')
        return
      }

      const abrirGaveta = metodoPag === 'DINHEIRO'
      const dadosRecibo: DadosRecibo = {
        numero: data.venda.numero,
        criadoEm: data.venda.criadoEm ?? new Date(),
        canalLabel: 'Bottlestore',
        itens: carrinho.map(i => ({ nome: i.nome, quantidade: i.quantidade, precoUnitario: i.preco })),
        subtotal: totalCarrinho,
        desconto: 0,
        total: totalCarrinho,
        metodoPagamento: metodoPag,
        valorRecebido: abrirGaveta ? Number(valorRecebido) : null,
        troco: troco > 0 ? troco : null,
      }
      setRecibo(dadosRecibo)
      setUltimaVenda({ total: totalCarrinho, troco: troco > 0 ? troco : 0, numero: data.venda.numero, gaveta: abrirGaveta })
      setCarrinho([])
      setPesquisa('')
      setValorRecebido('')
      setEtapa('sucesso')

      // Imprimir talão; em dinheiro envia também o kick da gaveta
      await imprimirReciboFisico(dadosRecibo, abrirGaveta)
      setTimeout(() => { setEtapa('venda'); pesquisaRef.current?.focus() }, 4000)
    })
  }

  // Grupos pai presentes no catálogo (o grupo de um produto é o parent
  // da sua categoria, ou a própria categoria quando esta não tem pai)
  const grupoDe = (p: Produto) => p.categoria.parent ?? p.categoria
  const grupos = Array.from(
    new Map(produtos.map(p => [grupoDe(p).id, grupoDe(p)])).values()
  )
  // Subcategorias do grupo ativo — os chips só aparecem com grupo escolhido
  const subcategorias = grupoAtivo
    ? Array.from(
        new Map(
          produtos
            .filter(p => p.categoria.parentCategoryId === grupoAtivo)
            .map(p => [p.categoria.id, p.categoria])
        ).values()
      )
    : []

  const porCategoria = (p: Produto) => {
    if (!grupoAtivo) return true
    if (grupoDe(p).id !== grupoAtivo) return false
    return !subAtiva || p.categoria.id === subAtiva
  }

  const produtosFiltrados = pesquisa
    ? produtos.filter(p =>
        p.nome.toLowerCase().includes(pesquisa.toLowerCase()) ||
        p.codigoBarras?.includes(pesquisa)
      ).slice(0, 20)
    : produtos.filter(porCategoria).slice(0, 40)

  return (
    <div className="split-layout">
      {/* Recibo invisível — aparece apenas no @media print */}
      {recibo && <ReciboTermico dados={recibo} />}

      {/* ── Left: Produtos ─────────────────────────────── */}
      <div className="split-main" style={{ padding: '16px' }}>
        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 800 }}>🛒 POS — Bottlestore</h1>
          <span className="badge badge-success" style={{ marginLeft: 'auto' }}>Online</span>
        </div>

        {/* Campo de pesquisa / scanner */}
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px' }}>📷</span>
          <input
            ref={pesquisaRef}
            className="input"
            placeholder="Scanner ou pesquisa... (Enter para adicionar)"
            value={pesquisa}
            onChange={e => setPesquisa(e.target.value)}
            onKeyDown={handlePesquisaKeyDown}
            style={{ paddingLeft: '36px' }}
            autoFocus
          />
        </div>

        {/* Chips de grupo (categorias pai) */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <button
            onClick={() => { setGrupoAtivo(null); setSubAtiva(null) }}
            className={`btn btn-sm ${!grupoAtivo ? 'btn-primary' : 'btn-secondary'}`}
          >
            Tudo
          </button>
          {grupos.map(g => (
            <button
              key={g.id}
              onClick={() => { setGrupoAtivo(grupoAtivo === g.id ? null : g.id); setSubAtiva(null) }}
              className={`btn btn-sm ${grupoAtivo === g.id ? 'btn-primary' : 'btn-secondary'}`}
            >
              {g.nome}
            </button>
          ))}
        </div>

        {/* Chips de subcategoria — só aparecem com um grupo selecionado */}
        {subcategorias.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px', paddingLeft: '4px', borderLeft: '3px solid var(--color-accent-muted)' }}>
            <button
              onClick={() => setSubAtiva(null)}
              className={`btn btn-sm ${!subAtiva ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '12px' }}
            >
              Todas
            </button>
            {subcategorias.map(s => (
              <button
                key={s.id}
                onClick={() => setSubAtiva(subAtiva === s.id ? null : s.id)}
                className={`btn btn-sm ${subAtiva === s.id ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '12px' }}
              >
                {s.nome}
              </button>
            ))}
          </div>
        )}

        {/* Grid de produtos */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: '8px',
        }}>
          {produtosFiltrados.map(p => {
            const noCarrinho = carrinho.find(i => i.produtoId === p.id)
            const stockBaixo = p.stockAtual <= 5
            return (
              <button
                key={p.id}
                onClick={() => { adicionarProduto(p); pesquisaRef.current?.focus() }}
                style={{
                  padding: '12px', borderRadius: '10px', textAlign: 'left', cursor: 'pointer', border: 'none',
                  background: noCarrinho ? 'var(--color-accent-muted)' : 'var(--color-bg-elevated)',
                  borderWidth: '1px', borderStyle: 'solid',
                  borderColor: noCarrinho ? 'var(--color-accent)' : 'var(--color-border)',
                  position: 'relative', transition: 'all 0.1s',
                }}
              >
                {noCarrinho && (
                  <div style={{
                    position: 'absolute', top: '6px', right: '6px',
                    background: 'var(--color-accent)', color: '#000',
                    borderRadius: '50%', width: '20px', height: '20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 800,
                  }}>{noCarrinho.quantidade}</div>
                )}
                {p.imagemUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imagemUrl} alt={p.nome} loading="lazy"
                    style={{ width: '100%', height: '64px', objectFit: 'cover', borderRadius: '6px', marginBottom: '6px' }}
                  />
                )}
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                  {p.categoria.nome}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', lineHeight: 1.3 }}>{p.nome}</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-accent)' }}>
                  MT {Number(p.precoVenda).toFixed(2)}
                </div>
                {stockBaixo && (
                  <div style={{ fontSize: '10px', color: 'var(--color-danger)', marginTop: '4px' }}>
                    ⚠ Stock baixo ({p.stockAtual})
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right: Carrinho ────────────────────────────── */}
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

        {/* Carrinho header */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700 }}>Carrinho</h2>
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
        </div>

        {/* Itens */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {carrinho.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
              Use o scanner ou clique nos produtos
            </div>
          ) : (
            carrinho.map(item => (
              <div key={item.produtoId} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px', borderRadius: '8px', marginBottom: '6px',
                background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>MT {item.preco.toFixed(2)} un.</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button onClick={() => ajustarQuantidade(item.produtoId, -1)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>−</button>
                  <span style={{ fontSize: '14px', fontWeight: 700, minWidth: '20px', textAlign: 'center' }}>{item.quantidade}</span>
                  <button onClick={() => ajustarQuantidade(item.produtoId, +1)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>+</button>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-accent)', minWidth: '64px', textAlign: 'right' }}>
                  MT {(item.preco * item.quantidade).toFixed(2)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totais e pagamento */}
        <div style={{ borderTop: '1px solid var(--color-border)', padding: '16px' }}>
          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Total</span>
            <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-accent)' }}>
              MT {totalCarrinho.toFixed(2)}
            </span>
          </div>

          {etapa === 'venda' && (
            <>
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
                  {/* Teclas de valor rápido — a maioria das vendas fecha sem digitar */}
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
                </div>
              )}

              <button
                onClick={finalizarVenda}
                disabled={
                  carrinho.length === 0 || isPending ||
                  (metodoPag === 'DINHEIRO' && Number(valorRecebido) < totalCarrinho)
                }
                className="btn btn-primary btn-lg"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {isPending
                  ? <><div className="spinner" style={{ width: '16px', height: '16px' }} /> A processar...</>
                  : '✅ Finalizar Venda'
                }
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
