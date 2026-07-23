'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

// ============================================================
// Toolbar da listagem de Produtos: pesquisa (nome/SKU/código de barras),
// filtros de canal e estado, e botão de exportação.
// O estado dos filtros vive na URL (q/canal/ativo) — a listagem e a
// exportação leem daí; não há useState de filtro isolado. Os valores
// actuais chegam por prop `filtros` (o Server Component lê searchParams).
// ============================================================

type Canal = 'RESTAURANTE' | 'BOTTLESTORE' | 'PISCINA'

const CANAL_LABEL: Record<Canal, string> = {
  RESTAURANTE: '🍽️ Restaurante',
  BOTTLESTORE: '🛒 Bottlestore',
  PISCINA: '🏊 Piscina',
}

// Tab A8: alvos de toque ≥ 44px.
const ALTURA_TOQUE = { minHeight: '44px' }

interface Filtros {
  q: string
  canal: string
  ativo: string
}

interface Props {
  canais: Canal[]
  filtros: Filtros
}

export function ProdutosToolbar({ canais, filtros }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [texto, setTexto] = useState(filtros.q)

  // Sincroniza o input com o `q` da URL apenas quando este muda por FORA
  // (voltar/avançar do browser), nunca com o eco do nosso próprio
  // router.replace. `ultimoQ` significa "último `q` que SEI estar reflectido
  // no URL" — actualizado NOS DOIS lados: no push (em `aplicar`) e aqui, ao
  // sincronizar a partir da prop. Se só fosse actualizado no push, o forward
  // do browser para um termo já enviado (prop === ref) não re-sincronizava e
  // o input ficava dessincronizado do URL. E como o push pré-regista o valor,
  // um round-trip lento do debounce (prop chega com o valor antigo) não
  // sobrescreve o que o utilizador escreveu entretanto (reversão de caracteres).
  const ultimoQ = useRef(filtros.q)
  if (filtros.q !== ultimoQ.current) {
    ultimoQ.current = filtros.q
    setTexto(filtros.q)
  }

  // Limpa o debounce pendente ao desmontar.
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current) }, [])

  // Monta a query a partir dos filtros actuais + overrides. 'ativo=true' é
  // o default e omite-se da URL. Reset da paginação a cada alteração.
  function queryString(overrides: Partial<Filtros>): string {
    const q = (overrides.q ?? filtros.q).trim()
    const canal = overrides.canal ?? filtros.canal
    const ativo = overrides.ativo ?? filtros.ativo
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (canal) p.set('canal', canal)
    if (ativo && ativo !== 'true') p.set('ativo', ativo)
    p.delete('page')
    return p.toString()
  }

  function aplicar(overrides: Partial<Filtros>) {
    // Regista o `q` que vamos empurrar: quando a prop regressar com este
    // mesmo valor (eco do router.replace), o bloco de sincronização acima
    // não re-sincroniza e não pisa o texto entretanto digitado.
    ultimoQ.current = (overrides.q ?? filtros.q).trim()
    const qs = queryString(overrides)
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function onChange(v: string) {
    setTexto(v)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => aplicar({ q: v }), 300)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      // Dispara já e volta a selecionar: os leitores de código de barras
      // emitem Enter no fim da leitura — sem isto o operador teria de
      // limpar o campo à mão entre leituras.
      e.preventDefault()
      if (debounce.current) clearTimeout(debounce.current)
      aplicar({ q: texto })
      inputRef.current?.select()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      limpar()
    }
  }

  function limpar() {
    if (debounce.current) clearTimeout(debounce.current)
    setTexto('')
    aplicar({ q: '' })
    inputRef.current?.focus()
  }

  const exportQs = queryString({})
  const exportHref = `/api/produtos/export${exportQs ? `?${exportQs}` : ''}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      {/* Linha 1: pesquisa a toda a largura. */}
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          ref={inputRef}
          className="input"
          value={texto}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Pesquisar por nome, SKU ou código de barras…"
          aria-label="Pesquisar produtos"
          style={{ ...ALTURA_TOQUE, width: '100%', paddingRight: texto ? '44px' : undefined }}
        />
        {texto && (
          <button
            type="button"
            onClick={limpar}
            aria-label="Limpar pesquisa"
            className="btn btn-ghost"
            style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', minHeight: '36px', padding: '0 10px' }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Linha 2: filtros de canal/estado + exportação, por baixo da pesquisa. */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {canais.length > 1 && (
          <select
            className="input"
            value={filtros.canal}
            onChange={e => aplicar({ canal: e.target.value })}
            aria-label="Filtrar por canal"
            style={{ ...ALTURA_TOQUE, width: 'auto' }}
          >
            <option value="">Todos os canais</option>
            {canais.map(c => <option key={c} value={c}>{CANAL_LABEL[c]}</option>)}
          </select>
        )}

        <select
          className="input"
          value={filtros.ativo}
          onChange={e => aplicar({ ativo: e.target.value })}
          aria-label="Filtrar por estado"
          style={{ ...ALTURA_TOQUE, width: 'auto' }}
        >
          <option value="true">Só ativos</option>
          <option value="false">Só inativos</option>
          <option value="todos">Todos</option>
        </select>

        <a
          href={exportHref}
          className="btn btn-secondary"
          style={{ ...ALTURA_TOQUE, display: 'inline-flex', alignItems: 'center' }}
        >
          ⬇️ Exportar Excel
        </a>
      </div>
    </div>
  )
}
