'use client'

import { useEffect, useState, useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Ecrã de preparação partilhado: KDS (Cozinha) e BDS (Bar).
// Cada ecrã mostra apenas os itens da sua secção (ItemPedido.destino)
// e marca-os como prontos de forma independente — o pedido só fica
// "PRONTO" quando as duas secções terminam (estado agregado no backend).

type DestinoPreparo = 'COZINHA' | 'BAR'
type EstadoSeccao = 'PENDENTE' | 'EM_PREPARACAO' | 'PRONTO'

interface ItemPreparo {
  id: string; quantidade: number; notas: string | null
  estadoKDS: string; destino: DestinoPreparo
  produto: { nome: string } | null
  fichaTecnica: { nome: string } | null
}

interface PedidoPreparo {
  id: string; canal: string; estado: string; criadoEm: string
  mesa: { numero: number; zona: string | null } | null
  aba: { identificador: string } | null
  garcom: { id: string; nome: string } | null
  identificadorCliente: string | null
  user: { nome: string }
  itens: ItemPreparo[]
}

const ESTADO_CONFIG: Record<EstadoSeccao, { label: string; cor: string; classe: string }> = {
  PENDENTE:       { label: 'Pendente',      cor: '#f59e0b', classe: 'kds-pendente' },
  EM_PREPARACAO:  { label: 'Em Preparação', cor: '#3b82f6', classe: 'kds-preparando' },
  PRONTO:         { label: 'Pronto',        cor: '#10b981', classe: 'kds-pronto' },
}

const DESTINO_CONFIG: Record<DestinoPreparo, { titulo: string; icone: string; vazio: string }> = {
  COZINHA: { titulo: 'Cozinha — KDS', icone: '👨‍🍳', vazio: '🎉 Sem comida por preparar' },
  BAR:     { titulo: 'Bar — BDS',     icone: '🍹', vazio: '🎉 Sem bebidas por preparar' },
}

// Estado da secção a partir dos itens que lhe pertencem
function estadoSeccao(itens: ItemPreparo[]): EstadoSeccao {
  const ativos = itens.filter(i => i.estadoKDS !== 'CANCELADO')
  if (ativos.length === 0) return 'PRONTO'
  if (ativos.every(i => i.estadoKDS === 'PRONTO' || i.estadoKDS === 'ENTREGUE')) return 'PRONTO'
  if (ativos.some(i => i.estadoKDS === 'EM_PREPARACAO')) return 'EM_PREPARACAO'
  return 'PENDENTE'
}

export function EcraPreparo({ destino }: { destino: DestinoPreparo }) {
  const [pedidos, setPedidos] = useState<PedidoPreparo[]>([])
  const [filtro, setFiltro] = useState<EstadoSeccao | 'TODOS'>('TODOS')
  const [isPending, startTransition] = useTransition()
  const [connected, setConnected] = useState(false)
  const cfg = DESTINO_CONFIG[destino]

  useEffect(() => {
    // Carregar todos os pedidos ativos com itens desta secção (não só os
    // pendentes — senão os "em preparação" desaparecem ao recarregar)
    fetch(`/api/pedidos?estados=PENDENTE,EM_PREPARACAO,PARCIALMENTE_PRONTO,PRONTO&destino=${destino}`)
      .then(r => r.json())
      .then(data => setPedidos(Array.isArray(data) ? data : []))

    // SSE para atualizações em tempo real
    const es = new EventSource('/api/kds/stream')
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        const temItensDaSeccao = (p: PedidoPreparo) =>
          Array.isArray(p?.itens) && p.itens.some(i => i.destino === destino)

        if (data.tipo === 'NOVO_PEDIDO') {
          if (temItensDaSeccao(data.pedido)) setPedidos(prev => [data.pedido, ...prev])
        } else if (data.tipo === 'ATUALIZAR_PEDIDO' || data.tipo === 'PEDIDO_PRONTO') {
          const pedido: PedidoPreparo = data.pedido
          setPedidos(prev => {
            const existe = prev.some(p => p.id === pedido.id)
            if (!temItensDaSeccao(pedido)) return prev.filter(p => p.id !== pedido.id)
            // Itens novos podem tornar relevante um pedido que não estava no ecrã
            return existe ? prev.map(p => p.id === pedido.id ? pedido : p) : [pedido, ...prev]
          })
        } else if (data.tipo === 'REMOVER_PEDIDO') {
          setPedidos(prev => prev.filter(p => p.id !== data.pedidoId))
        }
      } catch { /* ignore */ }
    }

    return () => es.close()
  }, [destino])

  function atualizarEstado(pedidoId: string, novoEstado: EstadoSeccao) {
    startTransition(async () => {
      const res = await fetch(`/api/pedidos/${pedidoId}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: novoEstado, destino }),
      })
      // O backend devolve o pedido com o estado agregado recalculado —
      // usar essa versão evita divergência entre secções.
      const data = await res.json().catch(() => null)
      if (data?.pedido) {
        setPedidos(prev => prev.map(p => p.id === data.pedido.id ? data.pedido : p))
      }
    })
  }

  const pedidosVisiveis = pedidos
    .filter(p => !['ENTREGUE', 'CANCELADO'].includes(p.estado))
    .map(p => ({ ...p, itensSeccao: p.itens.filter(i => i.destino === destino) }))
    .filter(p => p.itensSeccao.length > 0)
    .map(p => ({ ...p, estadoSeccao: estadoSeccao(p.itensSeccao) }))
    .filter(p => filtro === 'TODOS' || p.estadoSeccao === filtro)
    .sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime())

  const contagem = (estado: EstadoSeccao) =>
    pedidos
      .filter(p => !['ENTREGUE', 'CANCELADO'].includes(p.estado))
      .filter(p => estadoSeccao(p.itens.filter(i => i.destino === destino)) === estado &&
                   p.itens.some(i => i.destino === destino))
      .length

  return (
    <div style={{ minHeight: '100dvh', background: '#060b14', padding: '20px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '24px', background: '#0f1826', padding: '16px 20px',
        borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px' }}>
            {cfg.icone} {cfg.titulo}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: connected ? '#10b981' : '#ef4444',
              boxShadow: connected ? '0 0 8px #10b981' : '0 0 8px #ef4444',
            }} />
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {connected ? 'Ligado em tempo real' : 'Desligado — a reconectar...'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{
            padding: '6px 14px', borderRadius: '999px',
            background: 'rgba(239,68,68,0.15)', color: '#ef4444',
            fontSize: '13px', fontWeight: 700,
          }}>
            {contagem('PENDENTE')} Pendentes
          </div>
          <div style={{
            padding: '6px 14px', borderRadius: '999px',
            background: 'rgba(59,130,246,0.15)', color: '#3b82f6',
            fontSize: '13px', fontWeight: 700,
          }}>
            {contagem('EM_PREPARACAO')} Em Preparação
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {(['TODOS', 'PENDENTE', 'EM_PREPARACAO', 'PRONTO'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`btn btn-sm btn-touch ${filtro === f ? 'btn-primary' : 'btn-secondary'}`}
          >
            {f === 'TODOS' ? 'Todos' : ESTADO_CONFIG[f].label}
          </button>
        ))}
      </div>

      {/* Grid de pedidos */}
      {pedidosVisiveis.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '80px',
          color: 'var(--color-text-muted)', fontSize: '18px',
        }}>
          {cfg.vazio}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
        }}>
          {pedidosVisiveis.map(pedido => {
            const estCfg = ESTADO_CONFIG[pedido.estadoSeccao]
            const tempoEspera = formatDistanceToNow(new Date(pedido.criadoEm), { locale: ptBR })
            const minutos = Math.floor((Date.now() - new Date(pedido.criadoEm).getTime()) / 60000)
            const urgente = minutos >= 10

            return (
              <div key={pedido.id} className={`kds-card ${estCfg.classe}`} style={{
                ...(urgente && pedido.estadoSeccao === 'PENDENTE' ? { animation: 'pulse-glow 1.5s ease-in-out infinite' } : {}),
              }}>
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: estCfg.cor }}>
                      {pedido.mesa
                        ? `Mesa ${pedido.mesa.numero}`
                        : pedido.aba
                          ? `Aba ${pedido.aba.identificador}`
                          : `🧍 ${pedido.identificadorCliente ?? 'Balcão'}`}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      {pedido.mesa
                        ? `${pedido.mesa.zona ?? ''} · por ${pedido.user.nome}`
                        : `Garçom: ${pedido.garcom?.nome ?? pedido.user.nome}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '11px', fontWeight: 700, padding: '2px 8px',
                      borderRadius: '999px', background: urgente ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                      color: urgente ? '#ef4444' : 'var(--color-text-muted)',
                    }}>
                      ⏱ {tempoEspera}
                    </div>
                  </div>
                </div>

                {/* Itens desta secção */}
                <div style={{ marginBottom: '16px' }}>
                  {pedido.itensSeccao.map(item => (
                    <div key={item.id} style={{
                      display: 'flex', gap: '10px', alignItems: 'flex-start',
                      padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      <span style={{
                        minWidth: '28px', height: '28px', borderRadius: '6px',
                        background: 'rgba(255,255,255,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: '13px',
                      }}>
                        {item.quantidade}×
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>
                          {item.produto?.nome ?? item.fichaTecnica?.nome}
                        </div>
                        {item.notas && (
                          <div style={{ fontSize: '11px', color: 'var(--color-warning)', marginTop: '2px' }}>
                            ⚠ {item.notas}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* O resto do pedido está noutra secção — dar contexto */}
                  {pedido.itens.length > pedido.itensSeccao.length && (
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', paddingTop: '8px' }}>
                      +{pedido.itens.length - pedido.itensSeccao.length} item(ns) {destino === 'COZINHA' ? 'no Bar' : 'na Cozinha'}
                    </div>
                  )}
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {pedido.estadoSeccao === 'PENDENTE' && (
                    <button
                      onClick={() => atualizarEstado(pedido.id, 'EM_PREPARACAO')}
                      disabled={isPending}
                      className="btn btn-touch"
                      style={{
                        flex: 1, justifyContent: 'center',
                        background: 'rgba(59,130,246,0.2)', color: '#3b82f6',
                        border: '1px solid rgba(59,130,246,0.3)',
                      }}
                    >
                      🔥 Iniciar
                    </button>
                  )}
                  {(pedido.estadoSeccao === 'PENDENTE' || pedido.estadoSeccao === 'EM_PREPARACAO') && (
                    <button
                      onClick={() => atualizarEstado(pedido.id, 'PRONTO')}
                      disabled={isPending}
                      className="btn btn-touch"
                      style={{
                        flex: 1, justifyContent: 'center',
                        background: 'rgba(16,185,129,0.2)', color: '#10b981',
                        border: '1px solid rgba(16,185,129,0.3)',
                      }}
                    >
                      ✅ Pronto!
                    </button>
                  )}
                  {pedido.estadoSeccao === 'PRONTO' && (
                    <button
                      disabled
                      className="btn btn-touch"
                      style={{
                        flex: 1, justifyContent: 'center',
                        background: 'rgba(16,185,129,0.1)', color: '#10b981',
                        border: '1px solid rgba(16,185,129,0.2)',
                        cursor: 'default',
                      }}
                    >
                      {pedido.estado === 'PARCIALMENTE_PRONTO'
                        ? (destino === 'COZINHA' ? '✅ Pronto — Bar a terminar' : '✅ Pronto — Cozinha a terminar')
                        : '✅ Aguardando Entrega'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
