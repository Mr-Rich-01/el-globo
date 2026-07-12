'use client'

// Impressão térmica silenciosa via WebUSB (ESC/POS), sem popup do
// browser. Chrome/Edge em https ou localhost; a impressora USB tem de
// estar acessível ao WebUSB (em Windows, se estiver presa ao driver
// usbprint.sys, o claimInterface falha — usar Zadig/WinUSB). Por isso
// esta via NUNCA lança: devolve false e o chamador cai para o fallback
// (TCP /api/imprimir → window.print()).
//
// O requestDevice exige um gesto do utilizador — o emparelhamento é
// feito uma vez num botão dedicado (ImpressoraConfig); depois disso a
// autorização persiste e getDevices() reencontra a impressora sem
// diálogo nenhum.

import { DadosRecibo, gerarTextoRecibo } from './recibo'

// Tipos mínimos do WebUSB — o tsconfig padrão do projeto não inclui
// os tipos w3c-web-usb; declaramos apenas o que usamos.
interface USBEndpoint { direction: 'in' | 'out'; endpointNumber: number; type: string }
interface USBAlternateInterface { interfaceClass: number; endpoints: USBEndpoint[] }
interface USBInterface { interfaceNumber: number; alternate: USBAlternateInterface }
interface USBConfiguration { interfaces: USBInterface[] }
export interface USBDeviceLike {
  vendorId: number
  productId: number
  productName?: string
  opened: boolean
  configuration: USBConfiguration | null
  open(): Promise<void>
  close(): Promise<void>
  selectConfiguration(value: number): Promise<void>
  claimInterface(n: number): Promise<void>
  releaseInterface(n: number): Promise<void>
  transferOut(endpoint: number, data: Uint8Array): Promise<unknown>
}
interface USBLike {
  requestDevice(options: { filters: { classCode?: number }[] }): Promise<USBDeviceLike>
  getDevices(): Promise<USBDeviceLike[]>
  addEventListener(tipo: 'disconnect', cb: () => void): void
}

// Comandos ESC/POS — os mesmos bytes de /api/imprimir/route.ts
const ESC_INIT = [0x1b, 0x40]                    // Reset
const ESC_CORTE = [0x1d, 0x56, 0x42, 0x00]       // Corte parcial
const ESC_GAVETA = [0x1b, 0x70, 0x00, 0x19, 0xfa] // Kick gaveta (pino 2)

const STORAGE_KEY = 'elglobo_impressora_usb' // "vendorId:productId"
const USB_CLASS_PRINTER = 7

let dispositivoCache: USBDeviceLike | null = null
let disconnectListenerRegistado = false

function usb(): USBLike | null {
  if (typeof navigator === 'undefined') return null
  return 'usb' in navigator ? (navigator as unknown as { usb: USBLike }).usb : null
}

export function suportaWebUSB(): boolean {
  return usb() != null
}

function registarDisconnect() {
  const u = usb()
  if (!u || disconnectListenerRegistado) return
  u.addEventListener('disconnect', () => { dispositivoCache = null })
  disconnectListenerRegistado = true
}

// Emparelhar — REQUER gesto do utilizador (clique num botão)
export async function solicitarImpressoraUSB(): Promise<USBDeviceLike> {
  const u = usb()
  if (!u) throw new Error('WebUSB não suportado neste browser (use Chrome/Edge em https ou localhost)')
  const device = await u.requestDevice({ filters: [{ classCode: USB_CLASS_PRINTER }] })
  localStorage.setItem(STORAGE_KEY, `${device.vendorId}:${device.productId}`)
  dispositivoCache = device
  registarDisconnect()
  return device
}

// Reencontrar a impressora já autorizada — não requer gesto
export async function obterImpressoraMemorizada(): Promise<USBDeviceLike | null> {
  const u = usb()
  if (!u) return null
  if (dispositivoCache) return dispositivoCache

  const guardado = localStorage.getItem(STORAGE_KEY)
  if (!guardado) return null
  const [vendorId, productId] = guardado.split(':').map(Number)

  try {
    const devices = await u.getDevices()
    const device = devices.find(d => d.vendorId === vendorId && d.productId === productId) ?? null
    if (device) {
      dispositivoCache = device
      registarDisconnect()
    }
    return device
  } catch {
    return null
  }
}

export function esquecerImpressora(): void {
  localStorage.removeItem(STORAGE_KEY)
  dispositivoCache = null
}

export function montarEscPos(texto: string, opts: { abrirGaveta: boolean }): Uint8Array {
  const bytes: number[] = [...ESC_INIT]
  if (opts.abrirGaveta) bytes.push(...ESC_GAVETA)
  // ASCII apenas — gerarTextoRecibo já normaliza acentos; caracteres
  // fora do intervalo viram '?' em vez de lixo no talão
  for (const ch of texto + '\n\n\n') {
    const code = ch.charCodeAt(0)
    bytes.push(code <= 0x7f ? code : 0x3f)
  }
  bytes.push(...ESC_CORTE)
  return new Uint8Array(bytes)
}

// Interface da impressora + endpoint bulk OUT. Preferir a interface
// de classe 7 (printer); senão a primeira com um endpoint OUT.
function encontrarEndpoint(device: USBDeviceLike): { interfaceNumber: number; endpoint: number } | null {
  const interfaces = device.configuration?.interfaces ?? []
  const candidatas = [
    ...interfaces.filter(i => i.alternate.interfaceClass === USB_CLASS_PRINTER),
    ...interfaces.filter(i => i.alternate.interfaceClass !== USB_CLASS_PRINTER),
  ]
  for (const iface of candidatas) {
    const out = iface.alternate.endpoints.find(e => e.direction === 'out' && e.type === 'bulk')
    if (out) return { interfaceNumber: iface.interfaceNumber, endpoint: out.endpointNumber }
  }
  return null
}

// Envia texto cru (ESC/POS) por WebUSB. Nunca lança — false = usar fallback.
export async function imprimirTextoViaWebUSB(texto: string, abrirGaveta = false): Promise<boolean> {
  try {
    const device = await obterImpressoraMemorizada()
    if (!device) return false
    return await enviarBytesUSB(device, montarEscPos(texto, { abrirGaveta }))
  } catch {
    return false
  }
}

// Envia o recibo por WebUSB. Nunca lança — false = usar fallback.
export async function imprimirViaWebUSB(dados: DadosRecibo, abrirGaveta: boolean): Promise<boolean> {
  return imprimirTextoViaWebUSB(gerarTextoRecibo(dados), abrirGaveta)
}

// Talão de teste do botão de configuração
export async function imprimirTesteUSB(device: USBDeviceLike): Promise<boolean> {
  const texto = [
    '        EL GLOBO',
    '   Teste de impressora USB',
    `   ${new Date().toLocaleString('pt-PT')}`,
    '',
    'Se este talao saiu completo,',
    'a impressao silenciosa esta OK.',
  ].join('\n')
  return enviarBytesUSB(device, montarEscPos(texto, { abrirGaveta: false }))
}

async function enviarBytesUSB(device: USBDeviceLike, payload: Uint8Array): Promise<boolean> {
  let claimed: number | null = null
  try {
    if (!device.opened) await device.open()
    if (!device.configuration) await device.selectConfiguration(1)

    const alvo = encontrarEndpoint(device)
    if (!alvo) return false

    await device.claimInterface(alvo.interfaceNumber)
    claimed = alvo.interfaceNumber
    await device.transferOut(alvo.endpoint, payload)
    return true
  } catch {
    return false
  } finally {
    try {
      if (claimed != null) await device.releaseInterface(claimed)
      if (device.opened) await device.close()
    } catch { /* dispositivo pode já ter sido desligado */ }
  }
}
