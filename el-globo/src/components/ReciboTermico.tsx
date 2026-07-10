'use client'

import { DadosRecibo, METODO_LABEL } from '@/lib/recibo'

// Recibo otimizado para rolo térmico 80mm/58mm.
// Invisível no ecrã; o CSS @media print (globals.css) esconde a app
// e mostra apenas .recibo-termico no formato do rolo.
export function ReciboTermico({ dados, nomeLoja = 'EL GLOBO' }: { dados: DadosRecibo; nomeLoja?: string }) {
  const data = new Date(dados.criadoEm)

  return (
    <div className="recibo-termico">
      <div className="recibo-centro recibo-titulo">{nomeLoja}</div>
      <div className="recibo-centro">{dados.canalLabel}</div>
      <div className="recibo-centro">
        Recibo Nº {dados.numero} · {data.toLocaleDateString('pt-PT')} {data.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
      </div>
      {dados.operador && <div className="recibo-centro">Operador: {dados.operador}</div>}
      <hr className="recibo-hr" />

      <table className="recibo-tabela">
        <tbody>
          {dados.itens.map((item, i) => (
            <tr key={i}>
              <td>{item.quantidade}× {item.nome}</td>
              <td className="recibo-valor">{(item.precoUnitario * item.quantidade).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr className="recibo-hr" />
      <table className="recibo-tabela">
        <tbody>
          <tr><td>Subtotal</td><td className="recibo-valor">{dados.subtotal.toFixed(2)}</td></tr>
          {dados.desconto > 0 && <tr><td>Desconto</td><td className="recibo-valor">−{dados.desconto.toFixed(2)}</td></tr>}
          <tr className="recibo-total"><td>TOTAL MT</td><td className="recibo-valor">{dados.total.toFixed(2)}</td></tr>
          <tr><td>Pagamento</td><td className="recibo-valor">{METODO_LABEL[dados.metodoPagamento] ?? dados.metodoPagamento}</td></tr>
          {dados.valorRecebido != null && <tr><td>Recebido</td><td className="recibo-valor">{dados.valorRecebido.toFixed(2)}</td></tr>}
          {dados.troco != null && dados.troco > 0 && <tr className="recibo-total"><td>TROCO</td><td className="recibo-valor">{dados.troco.toFixed(2)}</td></tr>}
        </tbody>
      </table>

      {dados.divisao && dados.divisao.detalhe.length > 0 && (
        <>
          <hr className="recibo-hr" />
          <div className="recibo-centro recibo-titulo">*** CONTA DIVIDIDA ***</div>
          <div className="recibo-centro">
            {dados.divisao.tipo === 'IGUAL'
              ? `${dados.divisao.partes}× partes iguais`
              : `Por itens (${dados.divisao.partes} pessoas)`}
          </div>
          <table className="recibo-tabela">
            <tbody>
              {dados.divisao.detalhe.map(parte => (
                <tr key={parte.parte}>
                  <td>
                    Pessoa {parte.parte}
                    {parte.itens && parte.itens.length > 0 && (
                      <div className="recibo-sub">{parte.itens.join(', ')}</div>
                    )}
                  </td>
                  <td className="recibo-valor">MT {parte.valor.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <hr className="recibo-hr" />
      <div className="recibo-centro">Obrigado pela sua visita!</div>
    </div>
  )
}
