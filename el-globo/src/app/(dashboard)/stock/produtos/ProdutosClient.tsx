'use client'

import { useState, useEffect, useRef } from 'react'
import { stockAbaixoMinimo } from '@/lib/stock-alerta'
import { Combobox } from '@/components/Combobox'

type Canal = 'RESTAURANTE' | 'BOTTLESTORE' | 'PISCINA'
const CANAIS: { id: Canal; label: string; icone: string }[] = [
  { id: 'RESTAURANTE', label: 'Restaurante', icone: '🍽️' },
  { id: 'BOTTLESTORE', label: 'Bottlestore', icone: '🛒' },
  { id: 'PISCINA', label: 'Piscina', icone: '🏊' },
]

type Categoria = { id: string; nome: string; parentCategoryId: string | null }
type StockCanal = {
  canal: Canal
  precoVenda: number
  precoCusto: number | null
  stockAtual: number
  stockMinimo: number
}
type Produto = {
  id: string
  nome: string
  descricao: string | null
  sku: string
  codigoBarras: string | null
  categoriaId: string
  unidadeMedida: string
  parentProductId: string | null
  fatorConversao: number | null
  ativo: boolean
  isIngrediente: boolean
  imagemUrl: string | null
  categoria: Categoria
  stockCanais: StockCanal[]
  parent: { id: string; nome: string; sku: string } | null
  filhos: { id: string; nome: string; sku: string; fatorConversao: number | null }[]
}

type StockForm = { ativo: boolean; precoVenda: string; precoCusto: string; stockAtual: string; stockMinimo: string }
type FormState = {
  nome: string; descricao: string; sku: string; codigoBarras: string
  // grupoId = categoria PAI; categoriaId = subcategoria (ou o próprio pai
  // quando o grupo não tem subcategorias / o produto é genérico do grupo)
  grupoId: string; categoriaId: string
  unidadeMedida: string; parentProductId: string; fatorConversao: string
  isIngrediente: boolean
  imagemUrl: string | null
  stocks: Record<Canal, StockForm>
}

const stockVazio = (): StockForm => ({ ativo: false, precoVenda: '', precoCusto: '', stockAtual: '0', stockMinimo: '0' })
const formVazio = (): FormState => ({
  nome: '', descricao: '', sku: '', codigoBarras: '', grupoId: '', categoriaId: '', unidadeMedida: 'UNIDADE',
  parentProductId: '', fatorConversao: '', isIngrediente: false, imagemUrl: null,
  stocks: { RESTAURANTE: stockVazio(), BOTTLESTORE: stockVazio(), PISCINA: stockVazio() },
})

type DesmancheState = { produto: Produto; canal: Canal; quantidade: string }
// Ajustes rápidos de inventário por linha: entrada (compra/reposição) soma
// ao stock; saída regista uma quebra com motivo (ledger unificado).
type EntradaState = { produto: Produto; canal: Canal; quantidade: string; precoCusto: string; notas: string }
type SaidaState = { produto: Produto; canal: Canal; quantidade: string; motivo: string; notas: string }
// produto null = modal aberto pelo botão geral da página (escolhe-se no dropdown)
type TransferenciaState = { produto: Produto | null; origem: Canal; destino: Canal; quantidade: string; preco: string }

interface Props {
  role: string
  canais: Canal[]
}

export function ProdutosClient({ role, canais }: Props) {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(formVazio())
  const [aGuardar, setAGuardar] = useState(false)

  // Foto do produto: File pendente + preview local (URL.createObjectURL)
  const [imagemFicheiro, setImagemFicheiro] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const imagemInputRef = useRef<HTMLInputElement>(null)

  // Ações de stock (desmanche / transferência)
  const podeGerirStock = role === 'ADMIN' || role === 'GERENTE'
  const podeTransferir = role === 'ADMIN' || role === 'GERENTE'
  const [desmanche, setDesmanche] = useState<DesmancheState | null>(null)
  const [transferencia, setTransferencia] = useState<TransferenciaState | null>(null)
  const [entrada, setEntrada] = useState<EntradaState | null>(null)
  const [saida, setSaida] = useState<SaidaState | null>(null)
  const [acaoErro, setAcaoErro] = useState<string | null>(null)
  const [aExecutar, setAExecutar] = useState(false)
  const [sucesso, setSucesso] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [resProd, resCat] = await Promise.all([
        fetch('/api/produtos'),
        fetch('/api/categorias'),
      ])
      const prod = await resProd.json()
      const cat = await resCat.json()
      setProdutos(Array.isArray(prod) ? prod : [])
      setCategorias(Array.isArray(cat) ? cat : [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  function limparImagemPendente() {
    if (imagemPreview) URL.revokeObjectURL(imagemPreview)
    setImagemFicheiro(null)
    setImagemPreview(null)
    if (imagemInputRef.current) imagemInputRef.current.value = ''
  }

  function escolherImagem(f: File | undefined) {
    if (!f) return
    if (imagemPreview) URL.revokeObjectURL(imagemPreview)
    setImagemFicheiro(f)
    setImagemPreview(URL.createObjectURL(f))
  }

  function abrirNovo() {
    setEditandoId(null)
    setForm(formVazio())
    limparImagemPendente()
    setErro(null)
    setModalAberto(true)
  }

  function abrirEdicao(p: Produto) {
    const stocks = { RESTAURANTE: stockVazio(), BOTTLESTORE: stockVazio(), PISCINA: stockVazio() }
    for (const sc of p.stockCanais) {
      stocks[sc.canal] = {
        ativo: true,
        precoVenda: String(sc.precoVenda),
        precoCusto: sc.precoCusto != null ? String(sc.precoCusto) : '',
        stockAtual: String(sc.stockAtual),
        stockMinimo: String(sc.stockMinimo),
      }
    }
    setEditandoId(p.id)
    // Deriva o grupo pai a partir da categoria atual do produto
    const grupoId = p.categoria.parentCategoryId ?? p.categoriaId
    setForm({
      nome: p.nome, descricao: p.descricao ?? '', sku: p.sku, codigoBarras: p.codigoBarras ?? '',
      grupoId, categoriaId: p.categoriaId, unidadeMedida: p.unidadeMedida,
      parentProductId: p.parentProductId ?? '',
      fatorConversao: p.fatorConversao != null ? String(p.fatorConversao) : '',
      isIngrediente: p.isIngrediente,
      imagemUrl: p.imagemUrl,
      stocks,
    })
    limparImagemPendente()
    setErro(null)
    setModalAberto(true)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    const stocks = CANAIS.filter(c => form.stocks[c.id].ativo).map(c => {
      const s = form.stocks[c.id]
      return {
        canal: c.id,
        precoVenda: Number(s.precoVenda) || 0,
        precoCusto: s.precoCusto ? Number(s.precoCusto) : null,
        stockAtual: Number(s.stockAtual) || 0,
        stockMinimo: Number(s.stockMinimo) || 0,
      }
    })
    if (stocks.length === 0) {
      setErro('Ative o produto em pelo menos um canal (Restaurante, Bottlestore ou Piscina).')
      return
    }
    if (!form.categoriaId) {
      setErro('Escolha o grupo e a subcategoria do produto.')
      return
    }

    setAGuardar(true)
    try {
      // 1) Se há foto nova, envia primeiro — o servidor converte para
      //    WebP ≤400×400 (<50KB) e devolve o URL final.
      let imagemUrl = form.imagemUrl
      if (imagemFicheiro) {
        const fd = new FormData()
        fd.append('ficheiro', imagemFicheiro)
        const resImg = await fetch('/api/produtos/imagem', { method: 'POST', body: fd })
        const dataImg = await resImg.json()
        if (!resImg.ok) {
          setErro(dataImg.erro ?? 'Erro ao enviar a foto')
          return
        }
        imagemUrl = dataImg.url
      }

      const payload = {
        nome: form.nome,
        descricao: form.descricao || null,
        sku: form.sku,
        codigoBarras: form.codigoBarras || null,
        categoriaId: form.categoriaId,
        unidadeMedida: form.unidadeMedida,
        parentProductId: form.parentProductId || null,
        fatorConversao: form.fatorConversao ? Number(form.fatorConversao) : null,
        isIngrediente: form.isIngrediente,
        imagemUrl,
        stocks,
      }

      const res = await fetch(editandoId ? `/api/produtos/${editandoId}` : '/api/produtos', {
        method: editandoId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setErro(data.erro ?? 'Erro ao guardar produto')
        return
      }
      limparImagemPendente()
      setModalAberto(false)
      fetchData()
    } finally {
      setAGuardar(false)
    }
  }

  function stockDoCanal(p: Produto, canal: Canal): StockCanal | undefined {
    return p.stockCanais.find(s => s.canal === canal)
  }

  // Stock equivalente total em unidades (unidades soltas + caixas × fator)
  function equivalenteTotal(p: Produto, canal: Canal): string | null {
    if (!p.parent || !p.fatorConversao) return null
    const pai = produtos.find(x => x.id === p.parentProductId)
    const scPai = pai ? stockDoCanal(pai, canal) : undefined
    const scEu = stockDoCanal(p, canal)
    if (!scPai || !scEu) return null
    const total = Number(scEu.stockAtual) + Number(scPai.stockAtual) * p.fatorConversao
    return `${scPai.stockAtual} cx + ${scEu.stockAtual} un (${total} un)`
  }

  // Alerta de stock mínimo pelo equivalente total da família caixa/unidade:
  // 2 caixas cheias e 0 unidades soltas não disparam alerta.
  function abaixoMinimo(p: Produto, canal: Canal): boolean {
    const sc = stockDoCanal(p, canal)
    if (!sc) return false

    const pai = p.parentProductId ? produtos.find(x => x.id === p.parentProductId) : undefined
    const scPai = pai ? stockDoCanal(pai, canal) : undefined

    const filhoRef = p.filhos.find(f => f.fatorConversao)
    const filho = filhoRef ? produtos.find(x => x.id === filhoRef.id) : undefined
    const scFilho = filho ? stockDoCanal(filho, canal) : undefined

    return stockAbaixoMinimo({
      stockAtual: Number(sc.stockAtual),
      stockMinimo: Number(sc.stockMinimo),
      stockPai: scPai ? Number(scPai.stockAtual) : null,
      fatorProprio: p.fatorConversao,
      stockFilho: scFilho ? Number(scFilho.stockAtual) : null,
      fatorFilho: filhoRef?.fatorConversao ?? null,
    })
  }

  // ─── Desmanche manual de caixa ───────────────────────────────
  function abrirDesmanche(p: Produto) {
    // Canais onde a caixa tem linha de stock E o utilizador tem acesso
    const opcoes = canais.filter(c => stockDoCanal(p, c))
    setAcaoErro(null)
    setDesmanche({ produto: p, canal: opcoes[0] ?? canais[0], quantidade: '1' })
  }

  async function confirmarDesmanche(e: React.FormEvent) {
    e.preventDefault()
    if (!desmanche) return
    setAcaoErro(null)
    setAExecutar(true)
    try {
      const res = await fetch('/api/stock/desmanchar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produtoId: desmanche.produto.id,
          quantidade: Number(desmanche.quantidade),
          canal: desmanche.canal,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAcaoErro(data.erro ?? 'Erro ao desmanchar caixa')
        return
      }
      setDesmanche(null)
      setSucesso(data.mensagem ?? 'Caixa desmanchada')
      setTimeout(() => setSucesso(null), 5000)
      fetchData()
    } catch {
      setAcaoErro('Erro de ligação — tente novamente')
    } finally {
      setAExecutar(false)
    }
  }

  // ─── Transferência entre canais ──────────────────────────────
  // Sem produto = aberto pelo botão geral "Transferir Stock" do topo;
  // o produto escolhe-se no dropdown do modal.
  function abrirTransferencia(p?: Produto) {
    const origens = p ? canais.filter(c => stockDoCanal(p, c)) : canais
    const origem = origens[0] ?? canais[0]
    const destino = canais.find(c => c !== origem) ?? origem
    setAcaoErro(null)
    setTransferencia({ produto: p ?? null, origem, destino, quantidade: '1', preco: '' })
  }

  function escolherProdutoTransferencia(produtoId: string) {
    const p = produtos.find(x => x.id === produtoId) ?? null
    setTransferencia(t => {
      if (!t) return t
      const origens = p ? canais.filter(c => stockDoCanal(p, c)) : canais
      const origem = origens[0] ?? canais[0]
      const destino = canais.find(c => c !== origem) ?? origem
      return { ...t, produto: p, origem, destino }
    })
  }

  async function confirmarTransferencia(e: React.FormEvent) {
    e.preventDefault()
    if (!transferencia?.produto) return
    setAcaoErro(null)
    setAExecutar(true)
    try {
      const res = await fetch('/api/stock/transferir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produtoId: transferencia.produto!.id,
          canalOrigem: transferencia.origem,
          canalDestino: transferencia.destino,
          quantidade: Number(transferencia.quantidade),
          ...(transferencia.preco ? { precoVendaDestino: Number(transferencia.preco) } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAcaoErro(data.erro ?? 'Erro ao transferir stock')
        return
      }
      setTransferencia(null)
      setSucesso(data.mensagem ?? 'Stock transferido')
      setTimeout(() => setSucesso(null), 5000)
      fetchData()
    } catch {
      setAcaoErro('Erro de ligação — tente novamente')
    } finally {
      setAExecutar(false)
    }
  }

  // ─── Entrada / Saída rápida de stock ─────────────────────────
  function abrirEntrada(p: Produto) {
    const opcoes = canais.filter(c => stockDoCanal(p, c))
    setAcaoErro(null)
    setEntrada({ produto: p, canal: opcoes[0] ?? canais[0], quantidade: '', precoCusto: '', notas: '' })
  }

  async function confirmarEntrada(e: React.FormEvent) {
    e.preventDefault()
    if (!entrada) return
    setAcaoErro(null)
    setAExecutar(true)
    try {
      const res = await fetch('/api/stock/entrada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produtoId: entrada.produto.id,
          canal: entrada.canal,
          quantidade: Number(entrada.quantidade),
          ...(entrada.precoCusto ? { precoCusto: Number(entrada.precoCusto) } : {}),
          ...(entrada.notas.trim() ? { notas: entrada.notas.trim() } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAcaoErro(data.erro ?? 'Erro ao registar entrada')
        return
      }
      setEntrada(null)
      setSucesso(data.mensagem ?? 'Entrada registada')
      setTimeout(() => setSucesso(null), 5000)
      fetchData()
    } catch {
      setAcaoErro('Erro de ligação — tente novamente')
    } finally {
      setAExecutar(false)
    }
  }

  function abrirSaida(p: Produto) {
    const opcoes = canais.filter(c => stockDoCanal(p, c))
    setAcaoErro(null)
    setSaida({ produto: p, canal: opcoes[0] ?? canais[0], quantidade: '', motivo: 'Ajuste manual de inventário', notas: '' })
  }

  async function confirmarSaida(e: React.FormEvent) {
    e.preventDefault()
    if (!saida) return
    setAcaoErro(null)
    setAExecutar(true)
    try {
      // Saída manual = quebra: ledger unificado (SAIDA_QUEBRA) e visível
      // no relatório de quebras, que é onde se procura stock desaparecido.
      const res = await fetch('/api/quebras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produtoId: saida.produto.id,
          canal: saida.canal,
          quantidade: Number(saida.quantidade),
          motivo: saida.motivo.trim(),
          ...(saida.notas.trim() ? { notas: saida.notas.trim() } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAcaoErro(data.erro ?? 'Erro ao registar saída')
        return
      }
      setSaida(null)
      setSucesso('Saída de stock registada como quebra')
      setTimeout(() => setSucesso(null), 5000)
      fetchData()
    } catch {
      setAcaoErro('Erro de ligação — tente novamente')
    } finally {
      setAExecutar(false)
    }
  }

  // Possíveis "pais" (caixas): mesma categoria, sem parent próprio
  const possiveisPais = produtos.filter(p => !p.parentProductId && p.id !== editandoId)

  // Hierarquia de categorias: grupos (pais) → subcategorias dependentes
  const grupos = categorias.filter(c => !c.parentCategoryId)
  const subcategoriasDoGrupo = categorias.filter(c => c.parentCategoryId === form.grupoId)

  return (
    <div style={{ padding: '24px', maxWidth: '1400px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800 }}>📦 Produtos & Stock por Canal</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Cada canal tem o seu próprio preço e stock — o restaurante pode vender mais caro que a loja.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {podeTransferir && canais.length >= 2 && (
            <button onClick={() => abrirTransferencia()} className="btn btn-secondary">🔁 Transferir Stock</button>
          )}
          <button onClick={abrirNovo} className="btn btn-primary">+ Novo Produto</button>
        </div>
      </div>

      {sucesso && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-success-muted, rgba(16,185,129,0.15))', color: 'var(--color-success, #10b981)', fontSize: '13px', marginBottom: '16px' }}>
          ✓ {sucesso}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="spinner" /></div>
      ) : (
        <div className="card" style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-strong)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Produto</th>
                <th style={{ padding: '12px 8px', fontWeight: 700 }}>Categoria</th>
                {CANAIS.map(c => (
                  <th key={c.id} style={{ padding: '12px 8px', fontWeight: 700, textAlign: 'center' }}>
                    {c.icone} {c.label}
                  </th>
                ))}
                <th style={{ padding: '12px 8px' }} />
              </tr>
            </thead>
            <tbody>
              {produtos.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ fontWeight: 600 }}>
                      {p.nome}
                      {p.isIngrediente && (
                        <span className="badge badge-warning" style={{ marginLeft: '8px', fontSize: '10px' }} title="Ingrediente de preparação — não aparece nas listagens de venda">
                          🧂 Ingrediente
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {p.sku}{p.codigoBarras ? ` · ${p.codigoBarras}` : ''}
                      {p.parent && p.fatorConversao && (
                        <span style={{ color: 'var(--color-info)' }}> · 📦 1 cx {p.parent.nome} = {p.fatorConversao} un</span>
                      )}
                      {p.filhos.length > 0 && (
                        <span style={{ color: 'var(--color-accent)' }}> · Caixa de {p.filhos[0].nome}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px', color: 'var(--color-text-secondary)' }}>{p.categoria.nome}</td>
                  {CANAIS.map(c => {
                    const sc = stockDoCanal(p, c.id)
                    if (!sc) return <td key={c.id} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--color-text-muted)' }}>—</td>
                    const baixo = abaixoMinimo(p, c.id)
                    const equiv = equivalenteTotal(p, c.id)
                    return (
                      <td key={c.id} style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-accent)' }}>MT {sc.precoVenda.toFixed(2)}</div>
                        <div style={{ fontSize: '11px', color: baixo ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                          {baixo ? '⚠ ' : ''}{equiv ?? `${sc.stockAtual} em stock`}
                        </div>
                      </td>
                    )
                  })}
                  <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {podeGerirStock && p.stockCanais.length > 0 && (
                      <>
                        <button onClick={() => abrirEntrada(p)} className="btn btn-ghost btn-sm" title="Registar entrada de stock (compra/reposição)" style={{ color: 'var(--color-success, #10b981)' }}>➕ Entrada</button>
                        <button onClick={() => abrirSaida(p)} className="btn btn-ghost btn-sm" title="Registar saída manual (quebra/ajuste)" style={{ color: 'var(--color-danger)' }}>➖ Saída</button>
                      </>
                    )}
                    {podeGerirStock && p.filhos.some(f => f.fatorConversao) && (
                      <button onClick={() => abrirDesmanche(p)} className="btn btn-ghost btn-sm" title="Desmanchar caixa em unidades">📦 Desmanchar</button>
                    )}
                    {podeTransferir && canais.length >= 2 && p.stockCanais.length > 0 && (
                      <button onClick={() => abrirTransferencia(p)} className="btn btn-ghost btn-sm" title="Transferir stock entre canais">🔁 Transferir</button>
                    )}
                    <button onClick={() => abrirEdicao(p)} className="btn btn-ghost btn-sm">✏️ Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Modal Produto ─────────────────────────────────── */}
      {modalAberto && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }} onClick={() => setModalAberto(false)}>
          <form
            onSubmit={guardar}
            onClick={e => e.stopPropagation()}
            className="card animate-fade-in"
            style={{ padding: '28px', maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>
              {editandoId ? '✏️ Editar Produto' : '📦 Novo Produto'}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Nome *</label>
                <input className="input" required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>SKU *</label>
                <input className="input" required value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Código de Barras</label>
                <input className="input" value={form.codigoBarras} onChange={e => setForm(f => ({ ...f, codigoBarras: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Grupo / Categoria Pai *</label>
                <select
                  className="input" required value={form.grupoId}
                  onChange={e => {
                    const grupoId = e.target.value
                    const temSubs = categorias.some(c => c.parentCategoryId === grupoId)
                    // Sem subcategorias → o próprio grupo é a categoria final;
                    // com subcategorias → obriga a escolher no 2º dropdown.
                    setForm(f => ({ ...f, grupoId, categoriaId: temSubs ? '' : grupoId }))
                  }}
                >
                  <option value="">Selecionar grupo...</option>
                  {grupos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                  Subcategoria {subcategoriasDoGrupo.length > 0 ? '*' : ''}
                </label>
                {/* Dropdown dependente: só ativa depois de escolher o grupo */}
                <select
                  className="input"
                  required={subcategoriasDoGrupo.length > 0}
                  disabled={!form.grupoId || subcategoriasDoGrupo.length === 0}
                  value={subcategoriasDoGrupo.some(c => c.id === form.categoriaId) ? form.categoriaId : ''}
                  onChange={e => setForm(f => ({ ...f, categoriaId: e.target.value || f.grupoId }))}
                >
                  <option value="">
                    {!form.grupoId
                      ? 'Escolha primeiro o grupo'
                      : subcategoriasDoGrupo.length === 0
                        ? 'Sem subcategorias'
                        : `— Geral (${grupos.find(g => g.id === form.grupoId)?.nome ?? 'grupo'})`}
                  </option>
                  {subcategoriasDoGrupo.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Descrição (aparece no cardápio digital)</label>
                <textarea
                  className="input" rows={2}
                  placeholder="Ex: Bifana de porco marinada, servida no pão com molho da casa."
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Unidade de Medida</label>
                <select className="input" value={form.unidadeMedida} onChange={e => setForm(f => ({ ...f, unidadeMedida: e.target.value }))}>
                  <option value="UNIDADE">Unidade</option>
                  <option value="LITRO">Litro</option>
                  <option value="MILILITRO">Mililitro</option>
                  <option value="KG">Kg</option>
                  <option value="GRAMA">Grama</option>
                  <option value="PORCAO">Porção</option>
                </select>
              </div>
            </div>

            {/* Foto do produto (cardápio digital) */}
            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>📷 Foto do produto</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '88px', height: '88px', borderRadius: '10px', flexShrink: 0, overflow: 'hidden',
                  background: 'var(--color-bg-card)', border: '1px dashed var(--color-border-strong)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {imagemPreview || form.imagemUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imagemPreview ?? form.imagemUrl ?? ''}
                      alt="Foto do produto"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: '28px', opacity: 0.4 }}>🍽️</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    ref={imagemInputRef}
                    type="file"
                    accept="image/*"
                    onChange={e => escolherImagem(e.target.files?.[0])}
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => imagemInputRef.current?.click()}>
                      {imagemPreview || form.imagemUrl ? '🔄 Trocar foto' : '⬆️ Carregar foto'}
                    </button>
                    {(imagemPreview || form.imagemUrl) && (
                      <button
                        type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }}
                        onClick={() => { limparImagemPendente(); setForm(f => ({ ...f, imagemUrl: null })) }}
                      >
                        🗑 Remover
                      </button>
                    )}
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
                    Convertida automaticamente para WebP 400×400 (&lt;50KB) — otimizada para o cardápio digital no telemóvel.
                  </p>
                </div>
              </div>
            </div>

            {/* Ingrediente de preparação */}
            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.isIngrediente}
                  onChange={e => setForm(f => ({ ...f, isIngrediente: e.target.checked }))}
                  style={{ marginTop: '2px' }}
                />
                <span>
                  <span style={{ fontSize: '13px', fontWeight: 700, display: 'block' }}>🧂 Ingrediente de preparação</span>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    Usado em fichas técnicas/receitas (frango, cebola, alho…). O stock é controlado por canal,
                    mas o produto nunca aparece no POS, na comanda nem no tablet.
                  </span>
                </span>
              </label>
            </div>

            {/* Caixa → Unidade */}
            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>📦 Vendido à unidade a partir de uma caixa?</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Produto "Caixa" (pai)</label>
                  <Combobox
                    options={possiveisPais.map(p => ({ value: p.id, label: p.nome, sublabel: p.sku }))}
                    value={form.parentProductId}
                    onChange={v => setForm(f => ({ ...f, parentProductId: v }))}
                    emptyOption="Nenhum — produto independente"
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Unidades por caixa</label>
                  <input className="input" type="number" min="2" placeholder="Ex: 24" value={form.fatorConversao} onChange={e => setForm(f => ({ ...f, fatorConversao: e.target.value }))} />
                </div>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
                Quando as unidades acabam, o sistema desmancha uma caixa automaticamente na venda.
              </p>
            </div>

            {/* Stock por canal */}
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>Disponibilidade, preço e stock por canal</div>
            {CANAIS.map(c => {
              const s = form.stocks[c.id]
              return (
                <div key={c.id} style={{
                  padding: '12px', borderRadius: '10px', marginBottom: '8px',
                  background: s.ativo ? 'var(--color-bg-elevated)' : 'transparent',
                  border: `1px solid ${s.ativo ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={s.ativo}
                      onChange={e => setForm(f => ({ ...f, stocks: { ...f.stocks, [c.id]: { ...s, ativo: e.target.checked } } }))}
                    />
                    {c.icone} {c.label}
                  </label>
                  {s.ativo && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '10px' }}>
                      {([
                        ['precoVenda', 'Preço Venda *'],
                        ['precoCusto', 'Preço Custo'],
                        ['stockAtual', 'Stock Atual'],
                        ['stockMinimo', 'Stock Mínimo'],
                      ] as const).map(([campo, label]) => (
                        <div key={campo}>
                          <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>{label}</label>
                          <input
                            className="input"
                            type="number" step="0.01" min="0"
                            required={campo === 'precoVenda'}
                            value={s[campo]}
                            onChange={e => setForm(f => ({ ...f, stocks: { ...f.stocks, [c.id]: { ...s, [campo]: e.target.value } } }))}
                            style={{ padding: '6px 10px', fontSize: '13px' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {erro && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>
                ⚠ {erro}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button type="button" onClick={() => setModalAberto(false)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
              <button type="submit" disabled={aGuardar} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                {aGuardar ? 'A guardar...' : editandoId ? 'Guardar Alterações' : 'Criar Produto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Modal Entrada de Stock ────────────────────────── */}
      {entrada && (() => {
        const canaisComStock = canais.filter(c => stockDoCanal(entrada.produto, c))
        const sc = stockDoCanal(entrada.produto, entrada.canal)
        const qtd = Number(entrada.quantidade) || 0
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          }} onClick={() => setEntrada(null)}>
            <form
              onSubmit={confirmarEntrada}
              onClick={e => e.stopPropagation()}
              className="card animate-fade-in"
              style={{ padding: '28px', maxWidth: '440px', width: '100%' }}
            >
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>➕ Entrada de Stock</h3>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                {entrada.produto.nome} ({entrada.produto.sku}) — a quantidade soma ao stock existente.
              </p>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Canal</label>
                <select className="input" value={entrada.canal} onChange={e => setEntrada(s => s && { ...s, canal: e.target.value as Canal })}>
                  {canaisComStock.map(c => {
                    const cfg = CANAIS.find(x => x.id === c)!
                    return <option key={c} value={c}>{cfg.icone} {cfg.label} ({stockDoCanal(entrada.produto, c)?.stockAtual ?? 0} em stock)</option>
                  })}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Quantidade *</label>
                  <input
                    className="input" type="number" min="0.001" step="any" required autoFocus
                    value={entrada.quantidade}
                    onChange={e => setEntrada(s => s && { ...s, quantidade: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Preço custo (un.)</label>
                  <input
                    className="input" type="number" min="0" step="0.01"
                    placeholder={sc?.precoCusto != null ? `Atual: MT ${sc.precoCusto.toFixed(2)}` : 'Opcional'}
                    value={entrada.precoCusto}
                    onChange={e => setEntrada(s => s && { ...s, precoCusto: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Notas</label>
                <input
                  className="input" placeholder="Ex: Fatura FN-1234, fornecedor..."
                  value={entrada.notas}
                  onChange={e => setEntrada(s => s && { ...s, notas: e.target.value })}
                />
              </div>

              {sc && qtd > 0 && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', fontSize: '13px', marginBottom: '12px' }}>
                  Stock passa de <b>{sc.stockAtual}</b> para <b>{Number(sc.stockAtual) + qtd}</b>.
                </div>
              )}

              {acaoErro && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>
                  ⚠ {acaoErro}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setEntrada(null)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
                <button type="submit" disabled={aExecutar || qtd <= 0} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  {aExecutar ? 'A registar...' : 'Registar Entrada'}
                </button>
              </div>
            </form>
          </div>
        )
      })()}

      {/* ─── Modal Saída Manual (quebra) ───────────────────── */}
      {saida && (() => {
        const canaisComStock = canais.filter(c => stockDoCanal(saida.produto, c))
        const sc = stockDoCanal(saida.produto, saida.canal)
        const qtd = Number(saida.quantidade) || 0
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          }} onClick={() => setSaida(null)}>
            <form
              onSubmit={confirmarSaida}
              onClick={e => e.stopPropagation()}
              className="card animate-fade-in"
              style={{ padding: '28px', maxWidth: '440px', width: '100%' }}
            >
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>➖ Saída Manual de Stock</h3>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                {saida.produto.nome} ({saida.produto.sku}) — registada como quebra, visível no relatório de quebras.
              </p>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Canal</label>
                <select className="input" value={saida.canal} onChange={e => setSaida(s => s && { ...s, canal: e.target.value as Canal })}>
                  {canaisComStock.map(c => {
                    const cfg = CANAIS.find(x => x.id === c)!
                    return <option key={c} value={c}>{cfg.icone} {cfg.label} ({stockDoCanal(saida.produto, c)?.stockAtual ?? 0} em stock)</option>
                  })}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Quantidade *</label>
                  <input
                    className="input" type="number" min="0.001" step="any" required autoFocus
                    value={saida.quantidade}
                    onChange={e => setSaida(s => s && { ...s, quantidade: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Motivo *</label>
                  <input
                    className="input" required maxLength={120}
                    value={saida.motivo}
                    onChange={e => setSaida(s => s && { ...s, motivo: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Notas</label>
                <input
                  className="input" placeholder="Detalhes adicionais (opcional)"
                  value={saida.notas}
                  onChange={e => setSaida(s => s && { ...s, notas: e.target.value })}
                />
              </div>

              {sc && qtd > Number(sc.stockAtual) && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>
                  ⚠ Só há {sc.stockAtual} em stock neste canal.
                </div>
              )}

              {acaoErro && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>
                  ⚠ {acaoErro}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setSaida(null)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
                <button type="submit" disabled={aExecutar || qtd <= 0} className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }}>
                  {aExecutar ? 'A registar...' : 'Registar Saída'}
                </button>
              </div>
            </form>
          </div>
        )
      })()}

      {/* ─── Modal Desmanchar Caixa ────────────────────────── */}
      {desmanche && (() => {
        const filhoRef = desmanche.produto.filhos.find(f => f.fatorConversao)
        const fator = filhoRef?.fatorConversao ?? 0
        const nrCaixas = Number(desmanche.quantidade) || 0
        const canaisComStock = canais.filter(c => stockDoCanal(desmanche.produto, c))
        const scCaixa = stockDoCanal(desmanche.produto, desmanche.canal)
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          }} onClick={() => setDesmanche(null)}>
            <form
              onSubmit={confirmarDesmanche}
              onClick={e => e.stopPropagation()}
              className="card animate-fade-in"
              style={{ padding: '28px', maxWidth: '440px', width: '100%' }}
            >
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>📦 Desmanchar Caixa</h3>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                {desmanche.produto.nome} → {filhoRef?.nome}
              </p>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Canal</label>
                <select className="input" value={desmanche.canal} onChange={e => setDesmanche(d => d && { ...d, canal: e.target.value as Canal })}>
                  {canaisComStock.map(c => {
                    const cfg = CANAIS.find(x => x.id === c)!
                    return <option key={c} value={c}>{cfg.icone} {cfg.label} ({stockDoCanal(desmanche.produto, c)?.stockAtual ?? 0} caixas)</option>
                  })}
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Quantidade de caixas</label>
                <input
                  className="input" type="number" min="1" step="1" required
                  value={desmanche.quantidade}
                  onChange={e => setDesmanche(d => d && { ...d, quantidade: e.target.value })}
                />
              </div>

              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', fontSize: '13px', marginBottom: '12px' }}>
                {nrCaixas > 0 && fator > 0
                  ? <>Vai converter <b>{nrCaixas} caixa(s)</b> em <b>{nrCaixas * fator} unidades</b> de {filhoRef?.nome}.</>
                  : 'Indique a quantidade de caixas a desmanchar.'}
                {scCaixa && nrCaixas > Number(scCaixa.stockAtual) && (
                  <div style={{ color: 'var(--color-danger)', marginTop: '4px' }}>
                    ⚠ Só há {scCaixa.stockAtual} caixa(s) neste canal.
                  </div>
                )}
              </div>

              {acaoErro && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>
                  ⚠ {acaoErro}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setDesmanche(null)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
                <button type="submit" disabled={aExecutar || nrCaixas < 1} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  {aExecutar ? 'A desmanchar...' : 'Confirmar Desmanche'}
                </button>
              </div>
            </form>
          </div>
        )
      })()}

      {/* ─── Modal Transferir Stock ────────────────────────── */}
      {transferencia && (() => {
        const prod = transferencia.produto
        const canaisComStock = prod ? canais.filter(c => stockDoCanal(prod, c)) : canais
        const scOrigem = prod ? stockDoCanal(prod, transferencia.origem) : undefined
        const destinoSemLinha = prod ? !stockDoCanal(prod, transferencia.destino) : false
        const qtd = Number(transferencia.quantidade) || 0
        // Só produtos com stock em pelo menos um canal acessível podem ser transferidos
        const produtosTransferiveis = produtos.filter(p => canais.some(c => stockDoCanal(p, c)))
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          }} onClick={() => setTransferencia(null)}>
            <form
              onSubmit={confirmarTransferencia}
              onClick={e => e.stopPropagation()}
              className="card animate-fade-in"
              style={{ padding: '28px', maxWidth: '440px', width: '100%' }}
            >
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>🔁 Transferir Stock</h3>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                {prod ? `${prod.nome} (${prod.sku})` : 'Mover stock de um canal para outro (ex.: da Bottlestore para o Restaurante).'}
              </p>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Produto</label>
                <Combobox
                  options={produtosTransferiveis.map(p => ({ value: p.id, label: p.nome, sublabel: p.sku }))}
                  value={prod?.id ?? ''}
                  onChange={v => escolherProdutoTransferencia(v)}
                  placeholder="Pesquisar produto..."
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Canal de origem</label>
                  <select
                    className="input"
                    value={transferencia.origem}
                    onChange={e => {
                      const origem = e.target.value as Canal
                      setTransferencia(t => t && {
                        ...t,
                        origem,
                        // O destino não pode ficar igual à nova origem
                        destino: t.destino === origem ? (canais.find(c => c !== origem) ?? origem) : t.destino,
                      })
                    }}
                  >
                    {canaisComStock.map(c => {
                      const cfg = CANAIS.find(x => x.id === c)!
                      const stockLabel = prod ? ` (${stockDoCanal(prod, c)?.stockAtual ?? 0})` : ''
                      return <option key={c} value={c}>{cfg.icone} {cfg.label}{stockLabel}</option>
                    })}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Canal de destino</label>
                  <select className="input" value={transferencia.destino} onChange={e => setTransferencia(t => t && { ...t, destino: e.target.value as Canal })}>
                    {canais.filter(c => c !== transferencia.origem).map(c => {
                      const cfg = CANAIS.find(x => x.id === c)!
                      return <option key={c} value={c}>{cfg.icone} {cfg.label}</option>
                    })}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                  Quantidade ({prod?.filhos.some(f => f.fatorConversao) ? 'caixas' : 'unidades deste SKU'})
                </label>
                <input
                  className="input" type="number" min="0.001" step="any" required
                  value={transferencia.quantidade}
                  onChange={e => setTransferencia(t => t && { ...t, quantidade: e.target.value })}
                />
                {scOrigem && qtd > Number(scOrigem.stockAtual) && (
                  <div style={{ color: 'var(--color-danger)', fontSize: '12px', marginTop: '4px' }}>
                    ⚠ Só há {scOrigem.stockAtual} em stock na origem.
                  </div>
                )}
              </div>

              {destinoSemLinha && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Preço de venda no destino (novo canal)
                  </label>
                  <input
                    className="input" type="number" min="0" step="0.01"
                    placeholder={`Vazio = herda o preço da origem (MT ${scOrigem?.precoVenda.toFixed(2) ?? '0.00'})`}
                    value={transferencia.preco}
                    onChange={e => setTransferencia(t => t && { ...t, preco: e.target.value })}
                  />
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    O produto ainda não existe no canal de destino — será criada uma linha de stock nova.
                  </p>
                </div>
              )}

              {acaoErro && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>
                  ⚠ {acaoErro}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setTransferencia(null)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
                <button
                  type="submit"
                  disabled={aExecutar || !prod || qtd <= 0 || transferencia.origem === transferencia.destino}
                  className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                >
                  {aExecutar ? 'A transferir...' : 'Confirmar Transferência'}
                </button>
              </div>
            </form>
          </div>
        )
      })()}
    </div>
  )
}
