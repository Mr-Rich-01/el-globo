'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [isPending, startTransition] = useTransition()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, senha }),
        })
        const data = await res.json()
        if (!res.ok) {
          setErro(data.erro ?? 'Credenciais inválidas.')
          return
        }
        router.push(data.redirect)
        router.refresh()
      } catch {
        setErro('Erro de conexão. Tente novamente.')
      }
    })
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at 20% 50%, rgba(245,158,11,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(16,185,129,0.05) 0%, transparent 50%), var(--color-bg-base)',
      padding: '24px',
    }}>
      {/* Decorative orbs */}
      <div style={{
        position: 'fixed', top: '-20%', left: '-10%',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', bottom: '-20%', right: '-10%',
        width: '600px', height: '600px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="animate-fade-in" style={{ width: '100%', maxWidth: '420px', position: 'relative', zIndex: 1 }}>
        {/* Logo / Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '20px',
            background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-dark))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', fontSize: '32px',
            boxShadow: 'var(--shadow-glow-accent)',
          }}>
            🌐
          </div>
          <h1 style={{
            fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px',
            background: 'linear-gradient(135deg, #fff, #94a3b8)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            EL Globo
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '6px' }}>
            Sistema de Gestão Integrado
          </p>
        </div>

        {/* Form Card */}
        <div className="glass-strong" style={{ borderRadius: '20px', padding: '36px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>
            Bem-vindo de volta
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: '28px' }}>
            Aceda à sua área com as credenciais fornecidas.
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="utilizador@elglobo.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                Senha
              </label>
              <input
                id="senha"
                type="password"
                className="input"
                placeholder="••••••••"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {erro && (
              <div style={{
                padding: '12px 16px', borderRadius: '8px',
                background: 'var(--color-danger-muted)', color: 'var(--color-danger)',
                fontSize: '13px', border: '1px solid rgba(239,68,68,0.3)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span>⚠</span> {erro}
              </div>
            )}

            <button
              type="submit"
              id="btn-login"
              className="btn btn-primary btn-lg"
              disabled={isPending}
              style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}
            >
              {isPending ? (
                <>
                  <div className="spinner" style={{ width: '16px', height: '16px' }} />
                  A entrar...
                </>
              ) : 'Entrar no Sistema'}
            </button>
          </form>

          {/* Role hints */}
          <div style={{
            marginTop: '28px', padding: '16px',
            background: 'rgba(255,255,255,0.02)', borderRadius: '10px',
            border: '1px solid var(--color-border)',
          }}>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Credenciais de Demonstração
            </p>
            {[
              { role: 'Admin', email: 'admin@elglobo.com' },
              { role: 'Empregado', email: 'mesa@elglobo.com' },
              { role: 'Bottlestore', email: 'bottlestore@elglobo.com' },
              { role: 'Cozinheiro', email: 'cozinha@elglobo.com' },
            ].map(({ role, email: demoEmail }) => (
              <button
                key={demoEmail}
                type="button"
                onClick={() => { setEmail(demoEmail); setSenha('elglobo123') }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-secondary)', fontSize: '12px',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
              >
                <span style={{ color: 'var(--color-text-muted)' }}>→</span>{' '}
                <strong>{role}</strong>: {demoEmail}
              </button>
            ))}
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '24px' }}>
          EL Globo © {new Date().getFullYear()} — Sistema Interno
        </p>
      </div>
    </div>
  )
}
