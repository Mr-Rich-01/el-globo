'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import type { JWTPayload } from '@/lib/auth'
import { canaisPermitidos } from '@/lib/canais'
import type { CanalVenda } from '@prisma/client'

interface NavItem {
  href: string
  label: string
  icon: string
  roles: string[]
  canal?: CanalVenda // se definido, só aparece a quem tem acesso ao canal
  section?: string
}

const NAV_ITEMS: NavItem[] = [
  // Dashboard
  { href: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['ADMIN', 'GERENTE'], section: 'Principal' },

  // Restaurante
  { href: '/restaurante/mesas', label: 'Mesas', icon: '🍽️', roles: ['ADMIN', 'GERENTE', 'EMPREGADO_MESA', 'OPERADOR_BALCAO'], canal: 'RESTAURANTE', section: 'Restaurante' },
  { href: '/restaurante/balcao', label: 'Venda ao Balcão', icon: '🥡', roles: ['ADMIN', 'GERENTE', 'OPERADOR_BALCAO'], canal: 'RESTAURANTE', section: 'Restaurante' },
  { href: '/restaurante/kds', label: 'Cozinha (KDS)', icon: '👨‍🍳', roles: ['ADMIN', 'GERENTE', 'COZINHEIRO', 'EMPREGADO_MESA', 'OPERADOR_BALCAO'], canal: 'RESTAURANTE', section: 'Restaurante' },
  { href: '/restaurante/bar', label: 'Bar (BDS)', icon: '🍹', roles: ['ADMIN', 'GERENTE', 'COZINHEIRO', 'EMPREGADO_MESA', 'OPERADOR_BALCAO'], canal: 'RESTAURANTE', section: 'Restaurante' },

  // Bottlestore
  { href: '/bottlestore/pos', label: 'POS Loja', icon: '🛒', roles: ['ADMIN', 'GERENTE', 'OPERADOR_BOTTLESTORE'], canal: 'BOTTLESTORE', section: 'Bottlestore' },

  // Piscina
  { href: '/piscina/abas', label: 'Abas Piscina', icon: '🏊', roles: ['ADMIN', 'GERENTE', 'EMPREGADO_MESA'], canal: 'PISCINA', section: 'Piscina' },

  // Stock
  { href: '/stock/produtos', label: 'Produtos', icon: '📦', roles: ['ADMIN', 'GERENTE', 'OPERADOR_BOTTLESTORE'], section: 'Stock' },
  { href: '/stock/fichas-tecnicas', label: 'Fichas Técnicas', icon: '📋', roles: ['ADMIN', 'GERENTE'], canal: 'RESTAURANTE', section: 'Stock' },
  { href: '/stock/categorias', label: 'Categorias', icon: '🏷️', roles: ['ADMIN', 'GERENTE'], section: 'Stock' },
  { href: '/stock/quebras', label: 'Quebras', icon: '🗑️', roles: ['ADMIN', 'GERENTE'], section: 'Stock' },

  // Backoffice
  { href: '/backoffice/relatorios', label: 'Relatórios', icon: '📈', roles: ['ADMIN', 'GERENTE'], section: 'Backoffice' },
  { href: '/backoffice/caixa', label: 'Fecho de Caixa', icon: '💰', roles: ['ADMIN', 'GERENTE'], section: 'Backoffice' },
  { href: '/backoffice/utilizadores', label: 'Utilizadores', icon: '👥', roles: ['ADMIN'], section: 'Backoffice' },
]

export function Sidebar({ user }: { user: JWTPayload }) {
  const pathname = usePathname()
  const router = useRouter()

  // Drawer em tablet/mobile (<1024px); em desktop o CSS ignora o estado.
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [pathname])

  // Filtro duplo: role E canal — o gerente da Bottlestore não vê
  // "Mesas" nem "Abas Piscina"; o do restaurante não vê "POS Loja".
  const canais = canaisPermitidos({ role: user.role, canal: user.canal ?? null })
  const filteredItems = NAV_ITEMS.filter(item =>
    item.roles.includes(user.role) && (!item.canal || canais.includes(item.canal))
  )
  const sections = [...new Set(filteredItems.map(i => i.section))]

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        className="sidebar-fab"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={open}
      >
        {open ? <X size={26} strokeWidth={2.5} /> : <Menu size={26} strokeWidth={2.5} />}
      </button>

      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}

      <aside className={`sidebar ${open ? 'open' : ''}`}>
      {/* Logo */}
      <div style={{
        padding: '20px 16px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-dark))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px', flexShrink: 0,
          boxShadow: '0 4px 12px rgba(245,158,11,0.4)',
        }}>
          🌐
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '15px', letterSpacing: '-0.3px' }}>EL Globo</div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Gestão Integrada</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {sections.map(section => {
          const sectionItems = filteredItems.filter(i => i.section === section)
          return (
            <div key={section}>
              <div style={{
                padding: '8px 24px 4px',
                fontSize: '10px', fontWeight: 700,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                {section}
              </div>
              {sectionItems.map(item => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-link ${isActive ? 'active' : ''}`}
                  >
                    <span style={{ fontSize: '16px' }}>{item.icon}</span>
                    <span>{item.label}</span>
                    {isActive && (
                      <div style={{
                        marginLeft: 'auto', width: '6px', height: '6px',
                        borderRadius: '50%', background: 'var(--color-accent)',
                      }} />
                    )}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* User info + Logout */}
      <div style={{
        borderTop: '1px solid var(--color-border)',
        padding: '12px 16px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px', borderRadius: '8px',
          background: 'var(--color-bg-elevated)',
          marginBottom: '8px',
        }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'var(--color-accent-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', flexShrink: 0,
          }}>
            {user.nome.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: '13px', fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{user.nome}</div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
              {user.role.replace('_', ' ')}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', justifyContent: 'center', color: 'var(--color-text-muted)' }}
        >
          Sair
        </button>
      </div>
      </aside>
    </>
  )
}
