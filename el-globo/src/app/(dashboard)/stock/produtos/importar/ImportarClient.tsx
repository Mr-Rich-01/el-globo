'use client'

import { useRef, useState } from 'react'

type LinhaPreview = {
  linha: number
  sku: string
  nome: string
  canal: string
  acao: 'CRIAR' | 'ATUALIZAR' | 'ERRO'
  erros: string[]
  avisos: string[]
}

type Resumo = { aCriar: number; aAtualizar: number; linhasComErro: number; totalLinhas: number }

type Preview = { linhas: LinhaPreview[]; resumo: Resumo }
type ResultadoFinal = { criados: number; atualizados: number }

const COR_ACAO: Record<LinhaPreview['acao'], { badge: string; label: string }> = {
  CRIAR: { badge: 'badge-success', label: 'Criar' },
  ATUALIZAR: { badge: 'badge-info', label: 'Atualizar' },
  ERRO: { badge: 'badge-danger', label: 'Erro' },
}

export function ImportarClient() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [ficheiro, setFicheiro] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [resultado, setResultado] = useState<ResultadoFinal | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aProcessar, setAProcessar] = useState(false)

  function escolherFicheiro(f: File | null) {
    setFicheiro(f)
    setPreview(null)
    setResultado(null)
    setErro(null)
  }

  async function enviar(confirmar: boolean) {
    if (!ficheiro) return
    setAProcessar(true)
    setErro(null)
    try {
      const form = new FormData()
      form.append('ficheiro', ficheiro)
      if (confirmar) form.append('confirmar', '1')

      const res = await fetch('/api/produtos/importar', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        setErro(data.erro ?? 'Erro ao processar o ficheiro')
        if (data.linhas) setPreview({ linhas: data.linhas, resumo: data.resumo })
        return
      }
      if (confirmar) {
        setResultado({ criados: data.criados, atualizados: data.atualizados })
        setPreview({ linhas: data.linhas, resumo: data.resumo })
      } else {
        setPreview({ linhas: data.linhas, resumo: data.resumo })
      }
    } catch (e) {
      console.error(e)
      setErro('Falha de comunicação com o servidor')
    } finally {
      setAProcessar(false)
    }
  }

  const linhasValidas = preview ? preview.resumo.totalLinhas - preview.resumo.linhasComErro : 0

  return (
    <div style={{ padding: '24px', maxWidth: '1100px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800 }}>📥 Importar Produtos via Excel</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Descarregue o template, preencha uma linha por produto+canal e envie. Nada é gravado antes de confirmar a pré-visualização.
        </p>
      </div>

      {/* Passo 1: template */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ fontWeight: 700, marginBottom: '8px' }}>1. Descarregar o template</div>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
          O template traz as categorias atuais do sistema nos dropdowns, uma folha de instruções e linhas de exemplo (apague os exemplos antes de importar).
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => { window.location.href = '/api/produtos/importar/template' }}
        >
          ⬇️ Descarregar template (.xlsx)
        </button>
      </div>

      {/* Passo 2: upload + preview */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ fontWeight: 700, marginBottom: '8px' }}>2. Enviar o ficheiro preenchido</div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={e => escolherFicheiro(e.target.files?.[0] ?? null)}
            style={{ fontSize: '13px' }}
          />
          <button
            className="btn btn-primary"
            disabled={!ficheiro || aProcessar}
            onClick={() => enviar(false)}
          >
            {aProcessar && !resultado ? 'A validar…' : '🔍 Pré-visualizar'}
          </button>
        </div>
      </div>

      {erro && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.12)', color: 'var(--color-danger, #ef4444)', fontSize: '13px', marginBottom: '16px' }}>
          ✗ {erro}
        </div>
      )}

      {resultado && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'var(--color-success-muted, rgba(16,185,129,0.15))', color: 'var(--color-success, #10b981)', fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>
          ✓ Importação concluída: {resultado.criados} produto(s) criado(s), {resultado.atualizados} atualizado(s)
          {preview && preview.resumo.linhasComErro > 0 && ` — ${preview.resumo.linhasComErro} linha(s) rejeitada(s) (ver abaixo)`}
        </div>
      )}

      {/* Passo 3: preview + confirmação */}
      {preview && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontWeight: 700 }}>3. Pré-visualização</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                {preview.resumo.totalLinhas} linha(s) · {preview.resumo.aCriar} produto(s) a criar · {preview.resumo.aAtualizar} a atualizar ·{' '}
                <span style={{ color: preview.resumo.linhasComErro > 0 ? 'var(--color-danger)' : 'inherit', fontWeight: preview.resumo.linhasComErro > 0 ? 700 : 400 }}>
                  {preview.resumo.linhasComErro} com erro
                </span>
              </div>
            </div>
            {!resultado && (
              <button
                className="btn btn-primary"
                disabled={aProcessar || linhasValidas === 0}
                onClick={() => enviar(true)}
              >
                {aProcessar ? 'A importar…' : `✅ Confirmar importação (${linhasValidas} linha${linhasValidas === 1 ? '' : 's'})`}
              </button>
            )}
          </div>

          {preview.resumo.linhasComErro > 0 && !resultado && (
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
              As linhas com erro são ignoradas na importação — pode corrigi-las no Excel e repetir, ou confirmar só as válidas.
            </div>
          )}

          <div className="table-scroll">
            <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-strong)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 700, width: '60px' }}>Linha</th>
                  <th style={{ padding: '8px 12px', fontWeight: 700 }}>Produto</th>
                  <th style={{ padding: '8px 12px', fontWeight: 700 }}>SKU</th>
                  <th style={{ padding: '8px 12px', fontWeight: 700 }}>Canal</th>
                  <th style={{ padding: '8px 12px', fontWeight: 700, width: '90px' }}>Ação</th>
                  <th style={{ padding: '8px 12px', fontWeight: 700 }}>Problemas</th>
                </tr>
              </thead>
              <tbody>
                {preview.linhas.map(l => (
                  <tr
                    key={`${l.linha}`}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      background: l.acao === 'ERRO' ? 'rgba(239,68,68,0.07)' : undefined,
                    }}
                  >
                    <td style={{ padding: '8px 12px', color: 'var(--color-text-muted)' }}>{l.linha}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{l.nome || '—'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '12px' }}>{l.sku || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{l.canal || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={`badge ${COR_ACAO[l.acao].badge}`}>{COR_ACAO[l.acao].label}</span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {l.erros.map((e, i) => (
                        <div key={`e${i}`} style={{ color: 'var(--color-danger, #ef4444)', fontSize: '12px' }}>✗ {e}</div>
                      ))}
                      {l.avisos.map((a, i) => (
                        <div key={`a${i}`} style={{ color: 'var(--color-warning, #f59e0b)', fontSize: '12px' }}>⚠ {a}</div>
                      ))}
                      {l.erros.length === 0 && l.avisos.length === 0 && (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
