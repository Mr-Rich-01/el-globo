'use client'

import { useEffect, useState } from 'react'
import {
  suportaWebUSB,
  solicitarImpressoraUSB,
  obterImpressoraMemorizada,
  esquecerImpressora,
  imprimirTesteUSB,
  type USBDeviceLike,
} from '@/lib/printer'

// Botão de configuração da impressora USB (WebUSB). O emparelhamento
// requer um clique do utilizador (exigência do requestDevice); depois
// disso a impressão nas vendas é 100% silenciosa.
export function ImpressoraConfig() {
  const [aberto, setAberto] = useState(false)
  const [device, setDevice] = useState<USBDeviceLike | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [aTrabalhar, setATrabalhar] = useState(false)
  // Detetado só após montar — no SSR não há navigator.usb e renderizar
  // diferente do cliente causaria hydration mismatch
  const [suportado, setSuportado] = useState(false)

  useEffect(() => {
    if (!suportaWebUSB()) return
    setSuportado(true)
    obterImpressoraMemorizada().then(setDevice)
  }, [])

  // Sem WebUSB (http em LAN, browser não suportado) não há nada a
  // configurar — a impressão cai para TCP/window.print() na mesma.
  if (!suportado) return null

  async function emparelhar() {
    setMensagem(null)
    setATrabalhar(true)
    try {
      const d = await solicitarImpressoraUSB()
      setDevice(d)
      setMensagem('✅ Impressora emparelhada')
    } catch {
      setMensagem('Nenhuma impressora selecionada')
    } finally {
      setATrabalhar(false)
    }
  }

  async function testar() {
    if (!device) return
    setMensagem(null)
    setATrabalhar(true)
    const ok = await imprimirTesteUSB(device)
    setMensagem(ok
      ? '✅ Talão de teste enviado'
      : '⚠ Falha no envio — verifique o cabo/driver (WinUSB) ou use a impressão de rede')
    setATrabalhar(false)
  }

  function esquecer() {
    esquecerImpressora()
    setDevice(null)
    setMensagem('Impressora esquecida')
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setAberto(o => !o)}
        className="btn btn-ghost btn-sm"
        title="Configurar impressora USB"
      >
        🖨 {device ? '·' : ''}
      </button>

      {aberto && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 60,
          width: '260px', padding: '14px', borderRadius: '10px',
          background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
            🖨 Impressora USB (silenciosa)
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
            {device
              ? <>Emparelhada: <strong>{device.productName ?? 'Impressora térmica'}</strong></>
              : 'Não configurada — os talões usam a impressão de rede ou o diálogo do browser.'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {!device ? (
              <button onClick={emparelhar} disabled={aTrabalhar} className="btn btn-primary btn-sm" style={{ justifyContent: 'center' }}>
                Emparelhar impressora
              </button>
            ) : (
              <>
                <button onClick={testar} disabled={aTrabalhar} className="btn btn-secondary btn-sm" style={{ justifyContent: 'center' }}>
                  Imprimir teste
                </button>
                <button onClick={esquecer} disabled={aTrabalhar} className="btn btn-ghost btn-sm" style={{ justifyContent: 'center', color: 'var(--color-danger)' }}>
                  Esquecer
                </button>
              </>
            )}
          </div>

          {mensagem && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
              {mensagem}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
