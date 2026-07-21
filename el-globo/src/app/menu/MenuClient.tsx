'use client'

import { useMemo, useState } from 'react'

// Cardápio digital mobile-first (lido por QR code na mesa).
// Consulta apenas — sem pedidos, sem login, zero botões de ação.
// Navegação hierárquica: chips de GRUPO; ao escolher um grupo surgem
// os chips de SUBCATEGORIA. A pesquisa mostra uma lista plana.

export type GrupoMenu = { id: string; nome: string }
export type ItemMenu = {
  id: string
  nome: string
  descricao: string | null
  preco: number
  imagemUrl: string | null
  grupo: GrupoMenu
  sub: GrupoMenu | null
}

const ICONE_GRUPO: Record<string, string> = {
  'Comidas': '🍽️', 'Comida': '🍽️',
  'Bebidas Alcoólicas': '🍺',
  'Bebidas Não Alcoólicas': '🥤',
  'Snacks': '🍟',
  'Cocktails & Bar': '🍸',
}

const fmtPreco = (v: number) => `MT ${v.toFixed(2)}`

// ─── Cartões (dois variantes) ────────────────────────────────
// Com imagem: cartão vertical com foto grande em destaque.
// Sem imagem: linha compacta full-width — evita placeholders gigantes
// (todos os cocktails do bar vêm sem foto).

function CartaoComImagem({ item }: { item: ItemMenu }) {
  return (
    <article className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.imagemUrl!} alt={item.nome} loading="lazy" decoding="async"
        width={400} height={300}
        style={{ width: '100%', height: 'auto', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }}
      />
      <div style={{ padding: '12px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1.3 }}>{item.nome}</div>
        {item.descricao && (
          <p style={{
            fontSize: '13px', color: 'var(--color-text-secondary)', margin: '4px 0 0', lineHeight: 1.45,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {item.descricao}
          </p>
        )}
        <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--color-accent)', marginTop: 'auto', paddingTop: '10px' }}>
          {fmtPreco(item.preco)}
        </div>
      </div>
    </article>
  )
}

function CartaoCompacto({ item }: { item: ItemMenu }) {
  return (
    <article className="card" style={{
      display: 'flex', gap: '12px', padding: '12px', alignItems: 'center', gridColumn: '1 / -1',
    }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: '12px', flexShrink: 0,
        background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', opacity: 0.55,
      }}>
        {ICONE_GRUPO[item.grupo.nome] ?? '🍽️'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.3 }}>{item.nome}</div>
        {item.descricao && (
          <p style={{
            fontSize: '12px', color: 'var(--color-text-secondary)', margin: '3px 0 0', lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {item.descricao}
          </p>
        )}
      </div>
      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-accent)', whiteSpace: 'nowrap' }}>
        {fmtPreco(item.preco)}
      </div>
    </article>
  )
}

const renderItem = (item: ItemMenu) =>
  item.imagemUrl
    ? <CartaoComImagem key={item.id} item={item} />
    : <CartaoCompacto key={item.id} item={item} />

// ─── Página ──────────────────────────────────────────────────

export function MenuClient({ itens }: { itens: ItemMenu[] }) {
  const [pesquisa, setPesquisa] = useState('')
  // Navegação hierárquica: grupo → subcategoria (chips dependentes).
  // grupoAtivo = null → mostra todos os grupos empilhados.
  const [grupoAtivo, setGrupoAtivo] = useState<string | null>(null)
  const [subAtiva, setSubAtiva] = useState<string | null>(null)

  const termo = pesquisa.trim().toLowerCase()

  // Grupos únicos na ordem do servidor (grupos contíguos, Bar no fim)
  const grupos = useMemo(
    () => Array.from(new Map(itens.map(i => [i.grupo.id, i.grupo])).values()),
    [itens]
  )

  // Subcategorias do grupo ativo — só aparecem depois de escolher o grupo
  const subcategorias = useMemo(
    () => grupoAtivo
      ? Array.from(new Map(
          itens
            .filter(i => i.grupo.id === grupoAtivo && i.sub)
            .map(i => [i.sub!.id, i.sub!])
        ).values())
      : [],
    [itens, grupoAtivo]
  )

  // Itens visíveis (fora da pesquisa), respeitando grupo/subcategoria
  const itensVisiveis = useMemo(
    () => itens.filter(i => {
      if (grupoAtivo && i.grupo.id !== grupoAtivo) return false
      if (subAtiva && i.sub?.id !== subAtiva) return false
      return true
    }),
    [itens, grupoAtivo, subAtiva]
  )

  // Agrupa os itens visíveis por grupo → subsecções (subcategorias como
  // subtítulos). Com um grupo escolhido, fica só uma secção.
  const seccoesPorGrupo = useMemo(() => {
    const visiveis = grupoAtivo ? grupos.filter(g => g.id === grupoAtivo) : grupos
    return visiveis.map(g => {
      const doGrupo = itensVisiveis.filter(i => i.grupo.id === g.id)
      const subMap = new Map<string, { sub: GrupoMenu | null; itens: ItemMenu[] }>()
      for (const i of doGrupo) {
        const k = i.sub?.id ?? '__sem-sub'
        if (!subMap.has(k)) subMap.set(k, { sub: i.sub, itens: [] })
        subMap.get(k)!.itens.push(i)
      }
      return { grupo: g, subseccoes: Array.from(subMap.values()) }
    }).filter(s => s.subseccoes.length > 0)
  }, [grupos, itensVisiveis, grupoAtivo])

  const resultados = useMemo(
    () => termo
      ? itens.filter(i =>
          i.nome.toLowerCase().includes(termo) || (i.descricao?.toLowerCase().includes(termo) ?? false))
      : [],
    [itens, termo]
  )

  function escolherGrupo(id: string | null) {
    setGrupoAtivo(id)
    setSubAtiva(null)
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-bg-base)', paddingBottom: '48px' }}>
      {/* ─── Cabeçalho sticky: brand + pesquisa + chips ───────── */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 20,
          background: 'rgba(10, 15, 30, 0.92)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--color-border)',
          padding: '14px 16px 12px',
        }}
      >
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '13px', flexShrink: 0,
              background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-dark))',
              boxShadow: 'var(--shadow-glow-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '23px',
            }}>
              🌍
            </div>
            <div>
              <div style={{ fontSize: '19px', fontWeight: 800, letterSpacing: '0.03em' }}>EL GLOBO</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Restaurante · Bar · Piscina
              </div>
            </div>
          </div>

          {/* Pesquisa */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '15px', opacity: 0.6 }}>🔍</span>
            <input
              className="input"
              placeholder="Pesquisar pratos e bebidas..."
              value={pesquisa}
              onChange={e => setPesquisa(e.target.value)}
              style={{ width: '100%', paddingLeft: '40px', minHeight: '48px', borderRadius: '12px', fontSize: '15px' }}
            />
          </div>

          {/* Chips de GRUPO — escondidos durante a pesquisa. As subcategorias
              só aparecem depois de escolher um grupo. */}
          {!termo && grupos.length > 0 && (
            <>
              <nav className="chips-scroll" style={{ marginTop: '10px' }} aria-label="Categorias">
                <button
                  onClick={() => escolherGrupo(null)}
                  className={`btn btn-sm btn-touch ${!grupoAtivo ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ borderRadius: '999px', whiteSpace: 'nowrap' }}
                >
                  Tudo
                </button>
                {grupos.map(g => (
                  <button
                    key={g.id}
                    onClick={() => escolherGrupo(grupoAtivo === g.id ? null : g.id)}
                    className={`btn btn-sm btn-touch ${grupoAtivo === g.id ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ borderRadius: '999px', whiteSpace: 'nowrap' }}
                  >
                    {ICONE_GRUPO[g.nome] ?? ''} {g.nome}
                  </button>
                ))}
              </nav>

              {subcategorias.length > 0 && (
                <nav
                  className="chips-scroll"
                  style={{ marginTop: '8px', paddingLeft: '8px', borderLeft: '3px solid var(--color-accent-muted)' }}
                  aria-label="Subcategorias"
                >
                  <button
                    onClick={() => setSubAtiva(null)}
                    className={`btn btn-sm btn-touch ${!subAtiva ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: '999px', whiteSpace: 'nowrap' }}
                  >
                    Todas
                  </button>
                  {subcategorias.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSubAtiva(subAtiva === s.id ? null : s.id)}
                      className={`btn btn-sm btn-touch ${subAtiva === s.id ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ borderRadius: '999px', whiteSpace: 'nowrap' }}
                    >
                      {s.nome}
                    </button>
                  ))}
                </nav>
              )}
            </>
          )}
        </div>
      </header>

      {/* ─── Conteúdo ─────────────────────────────────────────── */}
      <main style={{ padding: '16px', maxWidth: '720px', margin: '0 auto' }}>
        {termo ? (
          /* Modo pesquisa: lista plana */
          resultados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--color-text-muted)' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>🔍</div>
              Nenhum item encontrado para &quot;{pesquisa}&quot;.
            </div>
          ) : (
            <div className="menu-grid">
              {resultados.map(renderItem)}
            </div>
          )
        ) : (
          seccoesPorGrupo.map(({ grupo, subseccoes }) => (
            <section key={grupo.id} style={{ marginBottom: '32px' }}>
              <h2 style={{
                fontSize: '18px', fontWeight: 800, letterSpacing: '-0.01em',
                margin: '8px 0 14px', display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <span>{ICONE_GRUPO[grupo.nome] ?? '•'}</span>
                {grupo.nome}
                <span style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
              </h2>

              {subseccoes.map(({ sub, itens: itensSub }) => (
                <div key={sub?.id ?? '__sem-sub'} style={{ marginBottom: '18px' }}>
                  {sub && (
                    <h3 style={{
                      fontSize: '12px', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.08em', color: 'var(--color-accent)', margin: '0 0 10px',
                    }}>
                      {sub.nome}
                    </h3>
                  )}
                  <div className="menu-grid">
                    {itensSub.map(renderItem)}
                  </div>
                </div>
              ))}
            </section>
          ))
        )}

        <footer style={{ textAlign: 'center', fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '32px', lineHeight: 1.8 }}>
          🌍 EL Globo — chame o garçom para fazer o seu pedido.
          <br />Preços em Meticais (MT), IVA incluído.
        </footer>
      </main>
    </div>
  )
}
