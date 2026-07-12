'use client'

import { useEffect, useRef } from 'react'

// Leitor de código de barras por escuta GLOBAL de teclado.
//
// Um scanner USB em modo "keyboard wedge" digita o código muito depressa
// (poucos ms por tecla) e termina com Enter. Distinguimos o scanner da
// digitação humana pelo intervalo entre teclas: rajadas rápidas são do
// scanner, teclas lentas são humanas.
//
// Ao contrário do POS (que lê o Enter dentro do campo de pesquisa), aqui
// intercetamos o teclado antes do input: assim o bip funciona mesmo com o
// foco noutro campo (ex: "Nome do cliente") sem sujar esse campo com o
// código — os carateres da rajada nunca chegam ao input focado.

interface Options {
  onScan: (codigo: string) => void
  /** Tamanho mínimo do buffer para ser considerado um código válido */
  minLength?: number
  /** Intervalo máximo (ms) entre teclas para ser considerado rajada de scanner */
  velocidadeMs?: number
  /** Desliga a escuta quando false (ex: durante um overlay de sucesso) */
  ativo?: boolean
}

export function useBarcodeScanner({
  onScan,
  minLength = 3,
  velocidadeMs = 40,
  ativo = true,
}: Options) {
  // Ref sempre atualizada para o callback ver o estado mais recente
  // (carrinho, produtos) sem re-registar o listener a cada render.
  const onScanRef = useRef(onScan)
  useEffect(() => { onScanRef.current = onScan }, [onScan])

  useEffect(() => {
    if (!ativo) return

    let buffer = ''
    let ultimaTecla = 0

    function handleKeyDown(e: KeyboardEvent) {
      const agora = Date.now()
      const delta = agora - ultimaTecla
      ultimaTecla = agora

      if (e.key === 'Enter') {
        // Só é um scan se o buffer foi preenchido em rajada — o Enter tem
        // de chegar logo a seguir à última tecla rápida. Caso contrário é
        // um Enter humano (submeter um form) e deixamo-lo passar.
        if (buffer.length >= minLength && delta < velocidadeMs * 3) {
          e.preventDefault()
          e.stopPropagation()
          const codigo = buffer
          buffer = ''
          onScanRef.current(codigo)
        } else {
          buffer = ''
        }
        return
      }

      // Ignora teclas não imprimíveis e combinações (Shift, setas, atalhos)
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return

      if (delta > 100) {
        // Intervalo grande → início de nova sequência (provável digitação
        // humana). Não intercetamos: deixamos o caráter chegar ao campo.
        buffer = e.key
      } else {
        // Rajada rápida → é o scanner. Intercetamos para o código não ficar
        // preso no input focado.
        buffer += e.key
        e.preventDefault()
      }
    }

    // useCapture=true → apanhamos a tecla antes de qualquer handler do input
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [ativo, minLength, velocidadeMs])
}
