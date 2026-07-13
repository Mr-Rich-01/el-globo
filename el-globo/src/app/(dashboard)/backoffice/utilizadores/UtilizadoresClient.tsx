'use client'

import { useState, useEffect } from 'react'

type Role = 'ADMIN' | 'GERENTE' | 'EMPREGADO_MESA' | 'OPERADOR_BALCAO' | 'OPERADOR_BOTTLESTORE' | 'COZINHEIRO' | 'GESTOR_STOCK'
type Canal = 'RESTAURANTE' | 'BOTTLESTORE' | 'PISCINA'

interface Utilizador {
  id: string
  nome: string
  email: string
  role: Role
  canal: Canal | null
  ativo: boolean
}

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  GERENTE: 'Gerente',
  EMPREGADO_MESA: 'Empregado de Mesa',
  OPERADOR_BALCAO: 'Operador de Balcão',
  OPERADOR_BOTTLESTORE: 'Operador Bottlestore',
  COZINHEIRO: 'Cozinheiro',
  GESTOR_STOCK: 'Gestor de Stock',
}

const CANAL_LABEL: Record<Canal, string> = {
  RESTAURANTE: '🍽️ Restaurante',
  BOTTLESTORE: '🛒 Bottlestore',
  PISCINA: '🏊 Piscina',
}

interface FormState {
  nome: string
  email: string
  senha: string
  role: Role
  canal: Canal | ''
  ativo: boolean
}

const formVazio = (): FormState => ({
  nome: '', email: '', senha: '', role: 'EMPREGADO_MESA', canal: 'RESTAURANTE', ativo: true,
})

export function UtilizadoresClient() {
  const [users, setUsers] = useState<Utilizador[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(formVazio())
  const [erro, setErro] = useState<string | null>(null)
  const [aGuardar, setAGuardar] = useState(false)

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    setLoading(true)
    try {
      const res = await fetch('/api/utilizadores')
      const data = await res.json()
      setUsers(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  function abrirNovo() {
    setEditandoId(null)
    setForm(formVazio())
    setErro(null)
    setModalAberto(true)
  }

  function abrirEdicao(u: Utilizador) {
    setEditandoId(u.id)
    setForm({ nome: u.nome, email: u.email, senha: '', role: u.role, canal: u.canal ?? '', ativo: u.ativo })
    setErro(null)
    setModalAberto(true)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (form.role !== 'ADMIN' && !form.canal) {
      setErro('Escolha o canal do utilizador — é o que separa os painéis dos gestores.')
      return
    }

    const payload = editandoId
      ? {
          nome: form.nome,
          role: form.role,
          canal: form.role === 'ADMIN' ? null : (form.canal || null),
          ativo: form.ativo,
          ...(form.senha ? { senha: form.senha } : {}),
        }
      : {
          nome: form.nome,
          email: form.email,
          senha: form.senha,
          role: form.role,
          canal: form.role === 'ADMIN' ? null : (form.canal || null),
        }

    setAGuardar(true)
    try {
      const res = await fetch(editandoId ? `/api/utilizadores/${editandoId}` : '/api/utilizadores', {
        method: editandoId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setErro(data.erro ?? 'Erro ao guardar utilizador')
        return
      }
      setModalAberto(false)
      fetchUsers()
    } finally {
      setAGuardar(false)
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800 }}>👥 Utilizadores</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Cada gestor/funcionário pertence a um canal — o Restaurante e a Bottlestore não se cruzam.
          </p>
        </div>
        <button onClick={abrirNovo} className="btn btn-primary">+ Novo Utilizador</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="spinner" /></div>
      ) : (
        <div className="card table-scroll">
          <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-strong)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Nome</th>
                <th style={{ padding: '12px 8px', fontWeight: 700 }}>Função</th>
                <th style={{ padding: '12px 8px', fontWeight: 700 }}>Canal</th>
                <th style={{ padding: '12px 8px', fontWeight: 700 }}>Estado</th>
                <th style={{ padding: '12px 8px' }} />
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)', opacity: u.ativo ? 1 : 0.5 }}>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ fontWeight: 600 }}>{u.nome}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{u.email}</div>
                  </td>
                  <td style={{ padding: '10px 8px' }}>{ROLE_LABEL[u.role]}</td>
                  <td style={{ padding: '10px 8px' }}>
                    {u.canal
                      ? CANAL_LABEL[u.canal]
                      : <span className="badge badge-warning">🌐 Global</span>}
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <span className={`badge ${u.ativo ? 'badge-success' : 'badge-danger'}`}>
                      {u.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                    <button onClick={() => abrirEdicao(u)} className="btn btn-ghost btn-sm">✏️ Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Modal ─────────────────────────────────────────── */}
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
            style={{ padding: '28px', maxWidth: '440px', width: '100%' }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>
              {editandoId ? '✏️ Editar Utilizador' : '👥 Novo Utilizador'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Nome *</label>
                <input className="input" required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </div>

              {!editandoId && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Email *</label>
                  <input className="input" type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                  {editandoId ? 'Nova password (deixar vazio para manter)' : 'Password *'}
                </label>
                <input
                  className="input"
                  type="password"
                  required={!editandoId}
                  minLength={6}
                  value={form.senha}
                  onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Função *</label>
                  <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}>
                    {(Object.keys(ROLE_LABEL) as Role[]).map(r => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Canal {form.role !== 'ADMIN' ? '*' : ''}</label>
                  {form.role === 'ADMIN' ? (
                    <div className="input" style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)' }}>🌐 Global (todos)</div>
                  ) : (
                    <select className="input" value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value as Canal }))}>
                      <option value="">Selecionar...</option>
                      {(Object.keys(CANAL_LABEL) as Canal[]).map(c => (
                        <option key={c} value={c}>{CANAL_LABEL[c]}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {editandoId && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} />
                  Conta ativa
                </label>
              )}

              {form.role !== 'ADMIN' && (
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  💡 O canal define o que este utilizador vê: stock, vendas, caixa e ecrãs apenas do seu espaço.
                  Alterações têm efeito no próximo login.
                </p>
              )}

              {erro && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px' }}>
                  ⚠ {erro}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setModalAberto(false)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
                <button type="submit" disabled={aGuardar} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  {aGuardar ? 'A guardar...' : editandoId ? 'Guardar' : 'Criar'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
