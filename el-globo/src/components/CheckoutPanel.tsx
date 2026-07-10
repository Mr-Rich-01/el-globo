'use client'

import { useMemo, useState, useTransition } from 'react'
import { ReciboTermico } from '@/components/ReciboTermico'
import { imprimirReciboFisico } from '@/lib/imprimir-client'
import { DadosRecibo, ParteDivisao } from '@/lib/recibo'

// Painel de fecho de conta partilhado entre o checkout de Mesa
// (restaurante) e o fecho de Aba (piscina). Fluxo:
//   1. Resumo + pergunta OBRIGATÓRIA "Vão dividir a conta?"
//   2. (se sim) configuração da divisão — partes iguais ou por itens
//   3. Pagamento (método, valor recebido com teclas rápidas)
//   4. Sucesso: troco em destaque, recibo térmico, gaveta se dinheiro

export interface LinhaConta {
  id: string
  nome: string
  quantidade: number
  precoUnitario: number
}

type MetodoPag = 'DINHEIRO' | 'CARTAO' | 'MOBILE_MONEY'
type Etapa = 'divisao-pergunta' | 'divisao-config' | 'pagamento' | 'sucesso'
type TipoDivisao = 'IGUAL' | 'POR_ITEM'

interface Props {
  tipo: 'MESA' | 'ABA' | 'PEDIDO' // PEDIDO = pedido volante individual
  alvoId: string
  titulo: string       // "Mesa 4" / "Aba P-12"
  canalLabel: string   // Cabeçalho do recibo
  linhas: LinhaConta[]
  operador?: string
  onSucesso?: () => void
  onCancelar?: () => void
}

const NOTAS_RAPIDAS = [100, 200, 500, 1000, 2000]

export function CheckoutPanel({ tipo, alvoId, titulo, canalLabel, linhas, operador, onSucesso, onCancelar }: Props) {
  const [etapa, setEtapa] = useState<Etapa>('divisao-pergunta')
  const [tipoDivisao, setTipoDivisao] = useState<TipoDivisao>('IGUAL')
  const [partes, setPartes] = useState(2)
  const [atribuicao, setAtribuicao] = useState<Record<string, number>>({}) // linhaId → parte
  const [comDivisao, setComDivisao] = useState(false)
  const [metodoPag, setMetodoPag] = useState<MetodoPag>('DINHEIRO')
  const [valorRecebido, setValorRecebido] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [recibo, setRecibo] = useState<DadosRecibo | null>(null)
  const [gavetaAberta, setGavetaAberta] = useState(false)
  const [isPending, startTransition] = useTransition()

  const total = useMemo(() => linhas.reduce((acc, l) => acc + l.precoUnitario * l.quantidade, 0), [linhas])
  const troco = Math.max(0, Number(valorRecebido) - total)

  // Detalhe da divisão calculado no cliente (o servidor revalida o IGUAL)
  const detalheDivisao: ParteDivisao[] = useMemo(() => {
    if (!comDivisao) return []
    if (tipoDivisao === 'IGUAL') {
      const valorParte = Math.floor((total / partes) * 100) / 100
      return Array.from({ length: partes }, (_, i) => ({
        parte: i + 1,
        valor: i === partes - 1 ? Math.round((total - valorParte * (partes - 1)) * 100) / 100 : valorParte,
      }))
    }
    // POR_ITEM: soma dos itens atribuídos a cada pessoa
    return Array.from({ length: partes }, (_, i) => {
      const minhas = linhas.filter(l => (atribuicao[l.id] ?? 1) === i + 1)
      return {
        parte: i + 1,
        valor: Math.round(minhas.reduce((acc, l) => acc + l.precoUnitario * l.quantidade, 0) * 100) / 100,
        itens: minhas.map(l => `${l.quantidade}× ${l.nome}`),
      }
    })
  }, [comDivisao, tipoDivisao, partes, atribuicao, linhas, total])

  function finalizar() {
    setErro(null)
    startTransition(async () => {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          id: alvoId,
          metodoPagamento: metodoPag,
          valorRecebido: metodoPag === 'DINHEIRO' ? Number(valorRecebido) : total,
          divisao: comDivisao ? { tipo: tipoDivisao, partes, detalhe: detalheDivisao } : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErro(data.erro ?? 'Erro ao fechar a conta')
        return
      }

      const dadosRecibo: DadosRecibo = {
        numero: data.venda.numero,
        criadoEm: data.venda.criadoEm,
        canalLabel,
        operador,
        itens: linhas.map(l => ({ nome: l.nome, quantidade: l.quantidade, precoUnitario: l.precoUnitario })),
        subtotal: Number(data.venda.subtotal),
        desconto: Number(data.venda.desconto),
        total: Number(data.venda.total),
        metodoPagamento: metodoPag,
        valorRecebido: metodoPag === 'DINHEIRO' ? Number(valorRecebido) : null,
        troco: troco > 0 ? troco : null,
        divisao: comDivisao ? { tipo: tipoDivisao, partes, detalhe: detalheDivisao } : null,
      }
      setRecibo(dadosRecibo)
      setEtapa('sucesso')

      // Pagamento em dinheiro → abre a gaveta e imprime o talão
      const abrirGaveta = metodoPag === 'DINHEIRO'
      if (abrirGaveta) setGavetaAberta(true)
      await imprimirReciboFisico(dadosRecibo, abrirGaveta)
    })
  }

  return (
    <div className="checkout-panel">
      {/* Recibo invisível — só aparece no @media print */}
      {recibo && <ReciboTermico dados={recibo} />}

      {/* Resumo da conta (sempre visível exceto no sucesso) */}
      {etapa !== 'sucesso' && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800 }}>💳 Fechar Conta — {titulo}</h2>
          </div>
          <div className="card" style={{ padding: '14px', marginBottom: '16px', maxHeight: '30vh', overflowY: 'auto' }}>
            {linhas.map(l => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '13px', borderBottom: '1px solid var(--color-border)' }}>
                <span>{l.quantidade}× {l.nome}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>MT {(l.precoUnitario * l.quantidade).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', fontWeight: 800, fontSize: '16px' }}>
              <span>Total</span>
              <span style={{ color: 'var(--color-accent)' }}>MT {total.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}

      {/* ─── Etapa 1: pergunta obrigatória de divisão ─────── */}
      {etapa === 'divisao-pergunta' && (
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', textAlign: 'center' }}>
            Os clientes vão dividir a conta?
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              className="btn btn-secondary btn-lg"
              style={{ justifyContent: 'center' }}
              onClick={() => { setComDivisao(false); setEtapa('pagamento') }}
            >
              Não — conta única
            </button>
            <button
              className="btn btn-primary btn-lg"
              style={{ justifyContent: 'center' }}
              onClick={() => { setComDivisao(true); setEtapa('divisao-config') }}
            >
              ➗ Sim — dividir
            </button>
          </div>
          {onCancelar && (
            <button onClick={onCancelar} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}>
              Cancelar
            </button>
          )}
        </div>
      )}

      {/* ─── Etapa 2: configurar divisão ──────────────────── */}
      {etapa === 'divisao-config' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
            <button
              className={`btn ${tipoDivisao === 'IGUAL' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'center' }}
              onClick={() => setTipoDivisao('IGUAL')}
            >
              ➗ Partes iguais
            </button>
            <button
              className={`btn ${tipoDivisao === 'POR_ITEM' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'center' }}
              onClick={() => setTipoDivisao('POR_ITEM')}
            >
              🧾 Por itens
            </button>
          </div>

          {/* Nº de pessoas */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '14px' }}>
            <button className="btn btn-secondary" onClick={() => setPartes(p => Math.max(2, p - 1))} style={{ width: '48px', height: '48px', padding: 0, justifyContent: 'center', fontSize: '20px' }}>−</button>
            <div style={{ textAlign: 'center', minWidth: '90px' }}>
              <div style={{ fontSize: '28px', fontWeight: 800 }}>{partes}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>pessoas</div>
            </div>
            <button className="btn btn-secondary" onClick={() => setPartes(p => Math.min(20, p + 1))} style={{ width: '48px', height: '48px', padding: 0, justifyContent: 'center', fontSize: '20px' }}>+</button>
          </div>

          {tipoDivisao === 'IGUAL' ? (
            <div style={{
              padding: '14px', borderRadius: '10px', textAlign: 'center', marginBottom: '14px',
              background: 'var(--color-info-muted)', color: 'var(--color-info)', fontWeight: 700, fontSize: '18px',
            }}>
              {partes} × MT {(Math.floor((total / partes) * 100) / 100).toFixed(2)}
            </div>
          ) : (
            <div style={{ marginBottom: '14px', maxHeight: '32vh', overflowY: 'auto' }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                Toque no número da pessoa que paga cada item:
              </p>
              {linhas.map(l => (
                <div key={l.id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px',
                  borderRadius: '8px', marginBottom: '6px', background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border)', flexWrap: 'wrap',
                }}>
                  <span style={{ flex: 1, fontSize: '13px', minWidth: '120px' }}>{l.quantidade}× {l.nome}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {Array.from({ length: partes }, (_, i) => i + 1).map(n => (
                      <button
                        key={n}
                        onClick={() => setAtribuicao(prev => ({ ...prev, [l.id]: n }))}
                        className={`btn btn-sm ${(atribuicao[l.id] ?? 1) === n ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ width: '36px', padding: '6px 0', justifyContent: 'center' }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {/* Resumo por pessoa */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                {detalheDivisao.map(p => (
                  <span key={p.parte} className="badge badge-info">
                    Pessoa {p.parte}: MT {p.valor.toFixed(2)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setEtapa('divisao-pergunta')} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>← Voltar</button>
            <button onClick={() => setEtapa('pagamento')} className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }}>
              Continuar para Pagamento →
            </button>
          </div>
        </div>
      )}

      {/* ─── Etapa 3: pagamento ───────────────────────────── */}
      {etapa === 'pagamento' && (
        <div>
          {comDivisao && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <span className="badge badge-warning">➗ Conta dividida: {tipoDivisao === 'IGUAL' ? `${partes}× iguais` : `por itens (${partes} pessoas)`}</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '12px' }}>
            {([
              { id: 'DINHEIRO', label: '💵 Dinheiro' },
              { id: 'CARTAO', label: '💳 Cartão' },
              { id: 'MOBILE_MONEY', label: '📱 Mobile' },
            ] as const).map(m => (
              <button
                key={m.id}
                onClick={() => setMetodoPag(m.id)}
                className={`btn ${metodoPag === m.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ justifyContent: 'center', fontSize: '13px', padding: '12px 8px' }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {metodoPag === 'DINHEIRO' && (
            <div style={{ marginBottom: '12px' }}>
              {/* Teclas de valor rápido — elimina digitação na maioria das vendas */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
                <button className="btn btn-secondary btn-sm" style={{ justifyContent: 'center' }} onClick={() => setValorRecebido(total.toFixed(2))}>
                  Exato
                </button>
                {NOTAS_RAPIDAS.map(n => (
                  <button key={n} className="btn btn-secondary btn-sm" style={{ justifyContent: 'center' }} onClick={() => setValorRecebido(String(n))}>
                    {n} MT
                  </button>
                ))}
              </div>
              <input
                className="input"
                type="number"
                placeholder="Valor recebido (MT)"
                value={valorRecebido}
                onChange={e => setValorRecebido(e.target.value)}
                style={{ fontSize: '20px', fontWeight: 700, textAlign: 'right' }}
              />
              {Number(valorRecebido) >= total && Number(valorRecebido) > 0 && (
                <div style={{
                  marginTop: '8px', padding: '12px', borderRadius: '8px', textAlign: 'center',
                  background: 'var(--color-success-muted)', color: 'var(--color-success)',
                  fontSize: '18px', fontWeight: 800,
                }}>
                  Troco: MT {troco.toFixed(2)}
                </div>
              )}
            </div>
          )}

          {erro && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>
              ⚠ {erro}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setEtapa(comDivisao ? 'divisao-config' : 'divisao-pergunta')}
              className="btn btn-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              ← Voltar
            </button>
            <button
              onClick={finalizar}
              disabled={isPending || (metodoPag === 'DINHEIRO' && Number(valorRecebido) < total)}
              className="btn btn-primary btn-lg"
              style={{ flex: 2, justifyContent: 'center' }}
            >
              {isPending
                ? <><div className="spinner" style={{ width: '16px', height: '16px' }} /> A processar...</>
                : `✅ Confirmar MT ${total.toFixed(2)}`}
            </button>
          </div>
        </div>
      )}

      {/* ─── Etapa 4: sucesso ─────────────────────────────── */}
      {etapa === 'sucesso' && recibo && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: '64px' }}>✅</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-success)', marginBottom: '4px' }}>Conta Fechada!</div>
          <div style={{ fontSize: '26px', fontWeight: 800, marginBottom: '8px' }}>MT {recibo.total.toFixed(2)}</div>
          {recibo.troco != null && recibo.troco > 0 && (
            <div style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: '10px', marginBottom: '8px',
              background: 'var(--color-warning-muted)', color: 'var(--color-warning)',
              fontSize: '20px', fontWeight: 800,
            }}>
              Troco: MT {recibo.troco.toFixed(2)}
            </div>
          )}
          {gavetaAberta && (
            <div style={{ fontSize: '13px', color: 'var(--color-info)', marginBottom: '8px' }}>
              💰 Gaveta de dinheiro aberta
            </div>
          )}
          {recibo.divisao && (
            <div style={{ margin: '8px auto', maxWidth: '260px', textAlign: 'left' }}>
              {recibo.divisao.detalhe.map(p => (
                <div key={p.parte} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '3px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span>Pessoa {p.parte}</span>
                  <span style={{ fontWeight: 700 }}>MT {p.valor.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>Recibo Nº {recibo.numero}</div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button onClick={() => window.print()} className="btn btn-secondary" style={{ justifyContent: 'center' }}>
              🖨 Reimprimir Recibo
            </button>
            <button onClick={onSucesso} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              Concluir
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
