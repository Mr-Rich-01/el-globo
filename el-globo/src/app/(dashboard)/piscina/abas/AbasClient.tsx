'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CheckoutPanel } from '@/components/CheckoutPanel'

interface ItemPedido {
  id: string; quantidade: number; precoUnitario: number
  produto: { nome: string } | null
  fichaTecnica: { nome: string } | null
}
interface Pedido { id: string; criadoEm: string; itens: ItemPedido[] }
interface Aba {
  id: string; identificador: string; nomeCliente: string | null; estado: string
  abertaEm: string; pedidos: Pedido[]
}

export function AbasClient({ abas: abasIniciais }: { abas: Aba[] }) {
  const router = useRouter()
  const [abas] = useState(abasIniciais)
  const [isPending, startTransition] = useTransition()
  const [modalNovaAba, setModalNovaAba] = useState(false)
  const [abaDetalhe, setAbaDetalhe] = useState<Aba | null>(null)
  const [novaId, setNovaId] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [modalFechar, setModalFechar] = useState<Aba | null>(null)

  function totalAba(aba: Aba) {
    return aba.pedidos.flatMap(p => p.itens).reduce((acc, i) => acc + i.precoUnitario * i.quantidade, 0)
  }

  // Linhas para o painel de checkout (fecho consolidado via /api/checkout,
  // que NÃO volta a descontar stock — foi descontado nos pedidos)
  function linhasAba(aba: Aba) {
    return aba.pedidos.flatMap(p =>
      p.itens.map(i => ({
        id: i.id,
        nome: i.produto?.nome ?? i.fichaTecnica?.nome ?? 'Item',
        quantidade: i.quantidade,
        precoUnitario: Number(i.precoUnitario),
      }))
    )
  }

  async function criarAba() {
    if (!novaId.trim()) return
    startTransition(async () => {
      const res = await fetch('/api/abas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificador: novaId.trim(), nomeCliente: novoNome.trim() || null }),
      })
      if (res.ok) {
        setModalNovaAba(false); setNovaId(''); setNovoNome('')
        router.refresh()
      }
    })
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800 }}>🏊 Zona de Piscina — Abas</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            {abas.length} cliente{abas.length !== 1 ? 's' : ''} com conta aberta
          </p>
        </div>
        <button onClick={() => setModalNovaAba(true)} className="btn btn-primary">
          + Nova Aba
        </button>
      </div>

      {/* Grid de Abas */}
      {abas.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '80px', border: '2px dashed var(--color-border)',
          borderRadius: '16px', color: 'var(--color-text-muted)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏊</div>
          <p style={{ fontSize: '16px' }}>Sem abas abertas</p>
          <p style={{ fontSize: '13px', marginTop: '4px' }}>Clique em "Nova Aba" para registar um cliente</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {abas.map(aba => {
            const total = totalAba(aba)
            const tempo = formatDistanceToNow(new Date(aba.abertaEm), { locale: ptBR, addSuffix: false })
            const nrConsumos = aba.pedidos.flatMap(p => p.itens).reduce((acc, i) => acc + i.quantidade, 0)

            return (
              <button
                key={aba.id}
                onClick={() => setAbaDetalhe(aba)}
                className="card card-hover"
                style={{ padding: '20px', textAlign: 'left', cursor: 'pointer', border: 'none', width: '100%' }}
              >
                {/* ID / Pulseira */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{
                    padding: '4px 12px', borderRadius: '999px',
                    background: 'rgba(59,130,246,0.15)', color: '#3b82f6',
                    fontSize: '14px', fontWeight: 800,
                  }}>
                    🏷 {aba.identificador}
                  </div>
                  <span className="badge badge-success">Aberta</span>
                </div>

                {/* Nome do cliente */}
                {aba.nomeCliente && (
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{aba.nomeCliente}</div>
                )}

                {/* Stats */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                  <div style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'var(--color-bg-base)', textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-accent)' }}>MT {total.toFixed(2)}</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Total</div>
                  </div>
                  <div style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'var(--color-bg-base)', textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800 }}>{nrConsumos}</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Consumos</div>
                  </div>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '10px' }}>
                  🕒 Aberta há {tempo}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ─── Modal: Nova Aba ────────────────────────────────── */}
      {modalNovaAba && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }} onClick={() => setModalNovaAba(false)}>
          <div className="card animate-fade-in" onClick={e => e.stopPropagation()} style={{ padding: '28px', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>🏷 Nova Aba de Cliente</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block', color: 'var(--color-text-secondary)' }}>
                  Identificador (Pulseira / Espreguiçadeira) *
                </label>
                <input
                  className="input"
                  placeholder="Ex: A-12, Pulseira 05, Esp. 3..."
                  value={novaId}
                  onChange={e => setNovaId(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block', color: 'var(--color-text-secondary)' }}>
                  Nome do Cliente (opcional)
                </label>
                <input
                  className="input"
                  placeholder="Ex: João Silva"
                  value={novoNome}
                  onChange={e => setNovoNome(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button onClick={() => setModalNovaAba(false)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
                <button onClick={criarAba} disabled={!novaId.trim() || isPending} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  {isPending ? 'A criar...' : 'Criar Aba'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Detalhe da Aba ───────────────────────────── */}
      {abaDetalhe && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }} onClick={() => setAbaDetalhe(null)}>
          <div className="card animate-fade-in" onClick={e => e.stopPropagation()} style={{ padding: '28px', maxWidth: '480px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700 }}>🏷 {abaDetalhe.identificador}</h3>
                {abaDetalhe.nomeCliente && <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>{abaDetalhe.nomeCliente}</p>}
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Aberta em {format(new Date(abaDetalhe.abertaEm), 'HH:mm', { locale: ptBR })}
                </p>
              </div>
              <button onClick={() => setAbaDetalhe(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--color-text-muted)' }}>×</button>
            </div>

            {/* Consumos */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
                Consumos
              </h4>
              {abaDetalhe.pedidos.flatMap(p => p.itens).map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: '13px' }}>
                  <span>{item.quantidade}× {item.produto?.nome ?? item.fichaTecnica?.nome ?? 'Item'}</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>MT {(item.precoUnitario * item.quantidade).toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderTop: '2px solid var(--color-border)', marginBottom: '20px' }}>
              <span style={{ fontWeight: 700, fontSize: '16px' }}>Total a Pagar</span>
              <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-accent)' }}>
                MT {totalAba(abaDetalhe).toFixed(2)}
              </span>
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => router.push(`/restaurante/comanda-aba/${abaDetalhe.id}`)}
                className="btn btn-secondary"
                style={{ justifyContent: 'center' }}
              >
                + Adicionar Consumo
              </button>
              <button
                onClick={() => { setModalFechar(abaDetalhe); setAbaDetalhe(null) }}
                className="btn btn-primary"
                style={{ justifyContent: 'center' }}
              >
                💳 Fechar Conta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Fechar Conta (com divisão + recibo + gaveta) ── */}
      {modalFechar && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}>
          <div className="card animate-fade-in" style={{ padding: '28px', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <CheckoutPanel
              tipo="ABA"
              alvoId={modalFechar.id}
              titulo={`Aba ${modalFechar.identificador}${modalFechar.nomeCliente ? ` — ${modalFechar.nomeCliente}` : ''}`}
              canalLabel={`Piscina — Aba ${modalFechar.identificador}`}
              linhas={linhasAba(modalFechar)}
              onCancelar={() => setModalFechar(null)}
              onSucesso={() => { setModalFechar(null); router.refresh() }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
