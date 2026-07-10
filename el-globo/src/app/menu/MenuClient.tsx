'use client'

import { useMemo, useState } from 'react'

// Cardápio digital mobile-first (lido por QR code na mesa).
// Consulta apenas — sem pedidos, sem login. Fotos WebP ≤50KB.

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

export function MenuClient({ itens }: { itens: ItemMenu[] }) {
  const [pesquisa, setPesquisa] = useState('')
  const [grupoAtivo, setGrupoAtivo] = useState<string | null>(null)
  const [subAtiva, setSubAtiva] = useState<string | null>(null)

  const grupos = useMemo(
    () => Array.from(new Map(itens.map(i => [i.grupo.id, i.grupo])).values()),
    [itens]
  )
  // Chips de subcategoria: só existem depois de escolher um grupo
  const subcategorias = useMemo(
    () => grupoAtivo
      ? Array.from(new Map(
          itens.filter(i => i.grupo.id === grupoAtivo && i.sub).map(i => [i.sub!.id, i.sub!])
        ).values())
      : [],
    [itens, grupoAtivo]
  )

  const termo = pesquisa.trim().toLowerCase()
  const filtrados = itens.filter(i => {
    if (termo) {
      return i.nome.toLowerCase().includes(termo) || (i.descricao?.toLowerCase().includes(termo) ?? false)
    }
    if (grupoAtivo && i.grupo.id !== grupoAtivo) return false
    if (subAtiva && i.sub?.id !== subAtiva) return false
    return true
  })

  // Secções: agrupa por "grupo — subcategoria" para leitura natural do menu
  const seccoes = useMemo(() => {
    const map = new Map<string, { titulo: string; itens: ItemMenu[] }>()
    for (const i of filtrados) {
      const chaveSec = i.sub ? `${i.grupo.id}:${i.sub.id}` : i.grupo.id
      const titulo = i.sub ? i.sub.nome : i.grupo.nome
      if (!map.has(chaveSec)) map.set(chaveSec, { titulo: `${ICONE_GRUPO[i.grupo.nome] ?? '•'} ${titulo}`, itens: [] })
      map.get(chaveSec)!.itens.push(i)
    }
    return Array.from(map.values())
  }, [filtrados])

  function escolherGrupo(id: string | null) {
    setGrupoAtivo(id)
    setSubAtiva(null)
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-bg-base)', paddingBottom: '48px' }}>
      {/* ─── Cabeçalho fixo: logo + pesquisa + chips ──────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--color-bg-base)',
        borderBottom: '1px solid var(--color-border)',
        padding: '16px 16px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-dark))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
          }}>
            🌍
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.02em' }}>EL GLOBO</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Restaurante · Bar · Piscina</div>
          </div>
        </div>

        {/* Pesquisa */}
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '15px', opacity: 0.6 }}>🔍</span>
          <input
            className="input"
            placeholder="Pesquisar pratos e bebidas..."
            value={pesquisa}
            onChange={e => setPesquisa(e.target.value)}
            style={{ paddingLeft: '40px', minHeight: '48px', borderRadius: '12px', fontSize: '15px' }}
          />
        </div>

        {/* Chips de grupo (scroll horizontal) */}
        <div className="chips-scroll">
          <button
            onClick={() => escolherGrupo(null)}
            className={`btn btn-sm btn-touch ${!grupoAtivo ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '999px' }}
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
        </div>

        {/* Chips de subcategoria — aparecem só com grupo escolhido */}
        {subcategorias.length > 0 && (
          <div className="chips-scroll" style={{ marginTop: '8px' }}>
            <button
              onClick={() => setSubAtiva(null)}
              className={`btn btn-sm btn-touch ${!subAtiva ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: '999px' }}
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
          </div>
        )}
      </header>

      {/* ─── Lista do cardápio ────────────────────────────────── */}
      <main style={{ padding: '16px', maxWidth: '720px', margin: '0 auto' }}>
        {seccoes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--color-text-muted)' }}>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>🔍</div>
            Nenhum item encontrado{termo ? ` para "${pesquisa}"` : ''}.
          </div>
        )}

        {seccoes.map(sec => (
          <section key={sec.titulo} style={{ marginBottom: '24px' }}>
            <h2 style={{
              fontSize: '13px', fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--color-accent)',
              margin: '4px 0 10px', display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              {sec.titulo}
              <span style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
            </h2>

            <div style={{ display: 'grid', gap: '10px' }}>
              {sec.itens.map(item => (
                <article key={item.id} className="card" style={{
                  display: 'flex', gap: '12px', padding: '12px', alignItems: 'center',
                }}>
                  {item.imagemUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imagemUrl} alt={item.nome} loading="lazy" width={84} height={84}
                      style={{ width: '84px', height: '84px', objectFit: 'cover', borderRadius: '10px', flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{
                      width: '84px', height: '84px', borderRadius: '10px', flexShrink: 0,
                      background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px', opacity: 0.55,
                    }}>
                      {ICONE_GRUPO[item.grupo.nome] ?? '🍽️'}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.3 }}>{item.nome}</div>
                    {item.descricao && (
                      <p style={{
                        fontSize: '12px', color: 'var(--color-text-secondary)', margin: '4px 0 0', lineHeight: 1.4,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {item.descricao}
                      </p>
                    )}
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-accent)', marginTop: '6px' }}>
                      MT {item.preco.toFixed(2)}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}

        <footer style={{ textAlign: 'center', fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '32px' }}>
          🌍 EL Globo — chame o garçom para fazer o seu pedido.
          <br />Preços em Meticais (MT), IVA incluído.
        </footer>
      </main>
    </div>
  )
}
