// Gera os ícones PWA a partir de um SVG inline (sem assets externos).
// Correr uma vez (ou quando o logo mudar): node scripts/gerar-icones.mjs
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const NAVY = '#0a0f1e'
const AMBER = '#f59e0b'
const AMBER_DARK = '#d97706'

// Globo estilizado (círculo + meridianos + paralelos) centrado num viewBox 512.
// `scale` controla o tamanho do globo (maskable precisa de zona de segurança).
function globo(scale = 1) {
  const s = (n) => 256 + (n - 256) * scale
  const r = 150 * scale
  const rMeridiano = 66 * scale
  // meias-cordas dos paralelos a ±75px do equador: sqrt(150² − 75²) ≈ 130
  const meia = 130 * scale
  const w = 18 * scale
  return `
    <g fill="none" stroke="${AMBER}" stroke-width="${w}" stroke-linecap="round">
      <circle cx="256" cy="256" r="${r}"/>
      <ellipse cx="256" cy="256" rx="${rMeridiano}" ry="${r}"/>
      <line x1="${s(106)}" y1="256" x2="${s(406)}" y2="256"/>
      <line x1="${256 - meia}" y1="${s(181)}" x2="${256 + meia}" y2="${s(181)}"/>
      <line x1="${256 - meia}" y1="${s(331)}" x2="${256 + meia}" y2="${s(331)}"/>
    </g>`
}

const svgBase = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111a33"/>
      <stop offset="1" stop-color="${NAVY}"/>
    </linearGradient>
    <linearGradient id="halo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${AMBER}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${AMBER_DARK}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="190" fill="url(#halo)"/>
  ${globo(1)}
</svg>`

// Maskable: fundo full-bleed (sem cantos arredondados) e globo reduzido
// para caber na zona de segurança (~80% central).
const svgMaskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${NAVY}"/>
  ${globo(0.72)}
</svg>`

const outDir = path.resolve(import.meta.dirname, '..', 'public', 'icons')
await mkdir(outDir, { recursive: true })

const alvos = [
  { svg: svgBase, size: 192, nome: 'icon-192.png' },
  { svg: svgBase, size: 512, nome: 'icon-512.png' },
  { svg: svgMaskable, size: 512, nome: 'icon-maskable-512.png' },
  { svg: svgBase, size: 180, nome: 'apple-touch-icon.png' },
  { svg: svgBase, size: 32, nome: 'favicon-32.png' },
]

for (const { svg, size, nome } of alvos) {
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, nome))
  console.log(`✓ public/icons/${nome} (${size}x${size})`)
}
