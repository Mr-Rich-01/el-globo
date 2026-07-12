'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ProntoAlert } from '@/components/ProntoAlert'

type EstadoMesa = 'LIVRE' | 'OCUPADA' | 'CONTA_PEDIDA' | 'RESERVADA'

interface MesaData {
  id: string
  numero: number
  nome: string | null
  zona: string | null
  estado: EstadoMesa
  lugares: number
  posX: number | null
  posY: number | null
  pedidos: { id: string; criadoEm: Date; estado: string }[]
}

const ESTADO_CONFIG: Record<EstadoMesa, { label: string; badgeClass: string; cardClass: string; icon: string }> = {
  LIVRE:        { label: 'Livre',       badgeClass: 'badge-success', cardClass: 'mesa-livre',    icon: '✓' },
  OCUPADA:      { label: 'Ocupada',     badgeClass: 'badge-warning', cardClass: 'mesa-ocupada',  icon: '👥' },
  CONTA_PEDIDA: { label: 'Conta',       badgeClass: 'badge-danger',  cardClass: 'mesa-conta',    icon: '💳' },
  RESERVADA:    { label: 'Reservada',   badgeClass: 'badge-info',    cardClass: 'mesa-reservada', icon: '🔒' },
}

export interface VolanteData {
  id: string
  identificadorCliente: string
  garcom: string
  estado: string
  pago: boolean
  criadoEm: Date | string
  nrItens: number
  total: number
}

type NovaMesaForm = { numero: string; nome: string; zona: string; lugares: string }

export function MesasClient({ mesas, volantes = [], role = '' }: { mesas: MesaData[]; volantes?: VolanteData[]; role?: string }) {
  const router = useRouter()
  const [zonaAtiva, setZonaAtiva] = useState<string>('Todas')
  const [isPending, startTransition] = useTransition()
  const [mesaSelecionada, setMesaSelecionada] = useState<MesaData | null>(null)

  // Gestão de mesas (criar/apagar) — só ADMIN e GERENTE
  const podeGerir = role === 'ADMIN' || role === 'GERENTE'
  const [novaMesa, setNovaMesa] = useState<NovaMesaForm | null>(null)
  const [gestaoErro, setGestaoErro] = useState<string | null>(null)
  const [aGuardar, setAGuardar] = useState(false)

  function abrirNovaMesa() {
    const maiorNumero = mesas.reduce((max, m) => Math.max(max, m.numero), 0)
    setGestaoErro(null)
    setNovaMesa({ numero: String(maiorNumero + 1), nome: '', zona: '', lugares: '4' })
  }

  async function criarMesa(e: React.FormEvent) {
    e.preventDefault()
    if (!novaMesa) return
    setGestaoErro(null)
    setAGuardar(true)
    try {
      const res = await fetch('/api/mesas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero: Number(novaMesa.numero),
          nome: novaMesa.nome.trim() || null,
          zona: novaMesa.zona.trim() || null,
          lugares: Number(novaMesa.lugares) || 4,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGestaoErro(data.erro ?? 'Erro ao criar mesa')
        return
      }
      setNovaMesa(null)
      router.refresh()
    } catch {
      setGestaoErro('Erro de ligação — tente novamente')
    } finally {
      setAGuardar(false)
    }
  }

  async function apagarMesa(mesa: MesaData, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Apagar a mesa ${mesa.numero}${mesa.nome ? ` (${mesa.nome})` : ''}?`)) return
    const res = await fetch(`/api/mesas/${mesa.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      alert(data.erro ?? 'Erro ao apagar mesa')
      return
    }
    router.refresh()
  }

  const zonas = ['Todas', ...Array.from(new Set(mesas.map(m => m.zona ?? 'Sem Zona')))]
  const mesasFiltradas = zonaAtiva === 'Todas'
    ? mesas
    : mesas.filter(m => (m.zona ?? 'Sem Zona') === zonaAtiva)

  // Stats
  const stats = {
    total: mesas.length,
    livres: mesas.filter(m => m.estado === 'LIVRE').length,
    ocupadas: mesas.filter(m => m.estado === 'OCUPADA').length,
    conta: mesas.filter(m => m.estado === 'CONTA_PEDIDA').length,
  }

  function entregarPedido(pedidoId: string) {
    startTransition(async () => {
      await fetch(`/api/pedidos/${pedidoId}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'ENTREGUE' }),
      })
      router.refresh()
    })
  }

  function cancelarPedido(pedidoId: string) {
    if (!confirm('Cancelar este pedido? O stock será reposto.')) return
    startTransition(async () => {
      const res = await fetch(`/api/pedidos/${pedidoId}/cancelar`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.erro ?? 'Erro ao cancelar pedido')
        return
      }
      router.refresh()
    })
  }

  function handleMesaClick(mesa: MesaData) {
    if (mesa.estado === 'LIVRE') {
      // Abrir mesa e ir para comanda
      startTransition(async () => {
        await fetch(`/api/mesas/${mesa.id}/abrir`, { method: 'POST' })
        router.push(`/restaurante/comanda/${mesa.id}`)
      })
    } else {
      setMesaSelecionada(mesa)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px' }}>
      {/* Alerta em tempo real quando a cozinha marca um pedido como pronto */}
      <ProntoAlert />
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px' }}>🍽️ Mapa de Mesas</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Clique numa mesa livre para abrir comanda · Numa ocupada para ver detalhes
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={() => router.refresh()} className="btn btn-secondary btn-sm">
            🔄 Atualizar
          </button>
          {['ADMIN', 'GERENTE', 'OPERADOR_BALCAO'].includes(role) && (
            <button onClick={() => router.push('/restaurante/balcao')} className="btn btn-primary">
              🥡 Nova Venda ao Balcão
            </button>
          )}
          {podeGerir && (
            <button onClick={abrirNovaMesa} className="btn btn-primary btn-sm">
              ➕ Nova Mesa
            </button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total', value: stats.total, color: '#94a3b8' },
          { label: 'Livres', value: stats.livres, color: '#10b981' },
          { label: 'Ocupadas', value: stats.ocupadas, color: '#f59e0b' },
          { label: 'Com Conta', value: stats.conta, color: '#ef4444' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            padding: '12px 20px', borderRadius: '10px',
            background: `${color}10`, border: `1px solid ${color}30`,
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{ fontSize: '22px', fontWeight: 800, color }}>{value}</span>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Zona Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {zonas.map(zona => (
          <button
            key={zona}
            onClick={() => setZonaAtiva(zona)}
            className={`btn btn-sm ${zonaAtiva === zona ? 'btn-primary' : 'btn-secondary'}`}
          >
            {zona}
          </button>
        ))}
      </div>

      {/* Mesa Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '16px',
      }}>
        {mesasFiltradas.map(mesa => {
          const cfg = ESTADO_CONFIG[mesa.estado]
          const pedidoAtivo = mesa.pedidos[0]
          const tempoAberta = pedidoAtivo
            ? formatDistanceToNow(new Date(pedidoAtivo.criadoEm), { locale: ptBR, addSuffix: false })
            : null

          return (
            <button
              key={mesa.id}
              onClick={() => handleMesaClick(mesa)}
              disabled={isPending}
              className={`mesa-card ${cfg.cardClass}`}
              style={{ border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%' }}
            >
              {/* Mesa numero */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{
                  fontSize: '22px', fontWeight: 800,
                  color: mesa.estado === 'LIVRE' ? 'var(--color-success)' :
                         mesa.estado === 'OCUPADA' ? 'var(--color-warning)' :
                         mesa.estado === 'CONTA_PEDIDA' ? 'var(--color-danger)' : '#8b5cf6',
                }}>
                  {mesa.numero}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {podeGerir && mesa.estado === 'LIVRE' && (
                    // span clicável (não <button>): o card já é um botão e
                    // botões aninhados são HTML inválido
                    <span
                      role="button"
                      title="Apagar mesa"
                      onClick={e => apagarMesa(mesa, e)}
                      style={{ fontSize: '14px', opacity: 0.55, padding: '2px 4px' }}
                    >
                      🗑
                    </span>
                  )}
                  <span style={{ fontSize: '20px' }}>{cfg.icon}</span>
                </span>
              </div>

              {/* Nome */}
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-primary)' }}>
                {mesa.nome ?? `Mesa ${mesa.numero}`}
              </div>

              {/* Zona */}
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                {mesa.zona ?? ''} · {mesa.lugares} lugares
              </div>

              {/* Estado badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className={`badge ${cfg.badgeClass}`}>{cfg.label}</span>
                {tempoAberta && (
                  <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                    {tempoAberta}
                  </span>
                )}
              </div>

              {/* Pedidos pendentes */}
              {mesa.pedidos.length > 0 && (
                <div style={{
                  marginTop: '8px', padding: '4px 8px', borderRadius: '6px',
                  background: 'rgba(0,0,0,0.2)', fontSize: '11px', color: 'var(--color-text-secondary)',
                }}>
                  {mesa.pedidos.length} pedido{mesa.pedidos.length > 1 ? 's' : ''} ativo{mesa.pedidos.length > 1 ? 's' : ''}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* ─── Pedidos Volantes (clientes de pé / balcão) ────── */}
      {volantes.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 800, marginBottom: '4px' }}>🧍 Pedidos Volantes</h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
            Clientes sem mesa (balcão, de pé) — lançados pelos garçons no tablet ou aqui.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
            {volantes.map(v => (
              <div key={v.id} className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700 }}>🧍 {v.identificadorCliente}</div>
                  <span style={{ display: 'flex', gap: '4px' }}>
                    {v.pago && <span className="badge badge-success">PAGO</span>}
                    <span className={`badge ${v.estado === 'PRONTO' ? 'badge-success' : v.estado === 'EM_PREPARACAO' || v.estado === 'PARCIALMENTE_PRONTO' ? 'badge-info' : 'badge-warning'}`}>
                      {v.estado === 'ENTREGUE' ? 'POR PAGAR' : v.estado.replace(/_/g, ' ')}
                    </span>
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
                  Garçom: {v.garcom} · {v.nrItens} {v.nrItens === 1 ? 'item' : 'itens'} · há {formatDistanceToNow(new Date(v.criadoEm), { locale: ptBR })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-accent)' }}>MT {v.total.toFixed(2)}</span>
                  <span style={{ display: 'flex', gap: '6px' }}>
                    {v.estado === 'PRONTO' && (
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={isPending}
                        onClick={() => entregarPedido(v.id)}
                      >
                        📦 Entregar
                      </button>
                    )}
                    {!v.pago && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => router.push(`/restaurante/checkout/pedido/${v.id}`)}
                      >
                        💳 Fechar Conta
                      </button>
                    )}
                    {podeGerir && !v.pago && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--color-danger)' }}
                        disabled={isPending}
                        onClick={() => cancelarPedido(v.id)}
                      >
                        ❌ Cancelar
                      </button>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Modal Nova Mesa ───────────────────────────────── */}
      {novaMesa && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }} onClick={() => setNovaMesa(null)}>
          <form
            onSubmit={criarMesa}
            onClick={e => e.stopPropagation()}
            className="card animate-fade-in"
            style={{ padding: '28px', maxWidth: '400px', width: '100%' }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>➕ Nova Mesa</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Número *</label>
                <input
                  className="input" type="number" min="1" step="1" required autoFocus
                  value={novaMesa.numero}
                  onChange={e => setNovaMesa(f => f && { ...f, numero: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Lugares</label>
                <input
                  className="input" type="number" min="1" max="50" step="1"
                  value={novaMesa.lugares}
                  onChange={e => setNovaMesa(f => f && { ...f, lugares: e.target.value })}
                />
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Nome</label>
              <input
                className="input" placeholder="Ex: Mesa VIP 1 (opcional)" maxLength={60}
                value={novaMesa.nome}
                onChange={e => setNovaMesa(f => f && { ...f, nome: e.target.value })}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Zona</label>
              <input
                className="input" placeholder="Ex: Interior, Esplanada, Varanda" maxLength={60}
                list="zonas-existentes"
                value={novaMesa.zona}
                onChange={e => setNovaMesa(f => f && { ...f, zona: e.target.value })}
              />
              <datalist id="zonas-existentes">
                {zonas.filter(z => z !== 'Todas' && z !== 'Sem Zona').map(z => <option key={z} value={z} />)}
              </datalist>
            </div>

            {gestaoErro && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>
                ⚠ {gestaoErro}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => setNovaMesa(null)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
              <button type="submit" disabled={aGuardar} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                {aGuardar ? 'A criar...' : 'Criar Mesa'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de mesa ocupada */}
      {mesaSelecionada && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }} onClick={() => setMesaSelecionada(null)}>
          <div className="card animate-fade-in" onClick={e => e.stopPropagation()} style={{
            padding: '28px', maxWidth: '360px', width: '100%',
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>
              Mesa {mesaSelecionada.numero}
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
              {mesaSelecionada.zona} · {mesaSelecionada.lugares} lugares
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="btn btn-primary"
                style={{ justifyContent: 'center' }}
                onClick={() => { setMesaSelecionada(null); router.push(`/restaurante/comanda/${mesaSelecionada.id}`) }}
              >
                🧾 Ver / Adicionar Pedidos
              </button>
              {mesaSelecionada.estado === 'OCUPADA' && (
                <button
                  className="btn btn-secondary"
                  style={{ justifyContent: 'center' }}
                  onClick={async () => {
                    await fetch(`/api/mesas/${mesaSelecionada.id}/pedir-conta`, { method: 'POST' })
                    setMesaSelecionada(null)
                    router.refresh()
                  }}
                >
                  💳 Pedir Conta
                </button>
              )}
              {(mesaSelecionada.estado === 'CONTA_PEDIDA' || mesaSelecionada.estado === 'OCUPADA') && (
                <button
                  className="btn btn-secondary"
                  style={{ justifyContent: 'center' }}
                  onClick={() => { setMesaSelecionada(null); router.push(`/restaurante/checkout/${mesaSelecionada.id}`) }}
                >
                  ✅ Fechar Conta
                </button>
              )}
              <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'center' }} onClick={() => setMesaSelecionada(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: '32px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {Object.entries(ESTADO_CONFIG).map(([estado, cfg]) => (
          <div key={estado} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className={`mesa-card ${cfg.cardClass}`} style={{
              width: '16px', height: '16px', padding: 0, borderRadius: '4px',
            }} />
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{cfg.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
