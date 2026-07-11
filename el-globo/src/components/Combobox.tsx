'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export interface ComboboxOption {
  value: string
  label: string
  sublabel?: string // ex.: SKU — também entra no filtro de pesquisa
}

// Pesquisa insensível a acentos e maiúsculas ("acucar" encontra "Açúcar")
function normalizar(s: string): string {
  // remove diacríticos combinantes (U+0300–U+036F)
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

interface Props {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  // Opção com value='' no topo da lista (ex.: "Nenhum — produto independente")
  emptyOption?: string
  disabled?: boolean
  required?: boolean
}

// Select pesquisável no estilo do design system (.input/.card) — o projeto
// não usa shadcn/Radix, por isso o dropdown é feito à mão.
export function Combobox({ options, value, onChange, placeholder = 'Pesquisar...', emptyOption, disabled, required }: Props) {
  const [aberto, setAberto] = useState(false)
  const [query, setQuery] = useState('')
  const [ativo, setAtivo] = useState(0)
  const raizRef = useRef<HTMLDivElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  const selecionada = options.find(o => o.value === value)

  const filtradas = useMemo(() => {
    const base: ComboboxOption[] = emptyOption ? [{ value: '', label: emptyOption }, ...options] : options
    const q = normalizar(query.trim())
    if (!q) return base
    return base.filter(o => normalizar(`${o.label} ${o.sublabel ?? ''}`).includes(q))
  }, [options, query, emptyOption])

  useEffect(() => setAtivo(0), [query, aberto])

  // Fechar em click fora (sem selecionar → o input repõe o label atual)
  useEffect(() => {
    if (!aberto) return
    function onDown(e: MouseEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) {
        setAberto(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [aberto])

  // Manter a opção ativa visível ao navegar com as setas
  useEffect(() => {
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${ativo}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [ativo])

  function selecionar(v: string) {
    onChange(v)
    setAberto(false)
    setQuery('')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!aberto && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      e.preventDefault()
      setAberto(true)
      return
    }
    if (!aberto) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAtivo(i => Math.min(i + 1, filtradas.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAtivo(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtradas[ativo]
      if (opt) selecionar(opt.value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setAberto(false)
      setQuery('')
    }
  }

  return (
    <div ref={raizRef} style={{ position: 'relative' }}>
      <input
        className="input"
        disabled={disabled}
        required={required && !value}
        role="combobox"
        aria-expanded={aberto}
        aria-autocomplete="list"
        placeholder={selecionada ? selecionada.label : (emptyOption ?? placeholder)}
        value={aberto ? query : (selecionada?.label ?? '')}
        onFocus={() => setAberto(true)}
        onClick={() => setAberto(true)}
        onChange={e => { setQuery(e.target.value); setAberto(true) }}
        onKeyDown={onKeyDown}
      />
      <span style={{
        position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none', color: 'var(--color-text-muted)', fontSize: '11px',
      }}>
        {aberto ? '🔍' : '▾'}
      </span>

      {aberto && (
        <div
          ref={listaRef}
          className="card"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
            maxHeight: '240px', overflowY: 'auto', padding: '4px',
            border: '1px solid var(--color-border-strong)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
          }}
        >
          {filtradas.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
              Nenhum resultado para “{query}”
            </div>
          )}
          {filtradas.map((o, i) => (
            <div
              key={o.value || '__vazio__'}
              data-idx={i}
              onMouseDown={e => { e.preventDefault(); selecionar(o.value) }}
              onMouseEnter={() => setAtivo(i)}
              style={{
                padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                background: i === ativo ? 'var(--color-accent-muted)' : 'transparent',
                color: o.value === value
                  ? 'var(--color-accent)'
                  : o.value === '' ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                fontWeight: o.value === value ? 700 : 500,
              }}
            >
              {o.label}
              {o.sublabel && (
                <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  {o.sublabel}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
