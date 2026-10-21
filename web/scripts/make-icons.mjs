// Rasterise public/icon.svg into the PNG sizes the PWA manifest and iOS need.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const svg = await readFile(new URL('../public/icon.svg', import.meta.url))
const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url))

await sharp(svg).resize(192, 192).png().toFile(out('pwa-192.png'))
await sharp(svg).resize(512, 512).png().toFile(out('pwa-512.png'))
await sharp(svg).resize(180, 180).png().toFile(out('apple-touch-icon.png'))
// Maskable: keep the artwork inside the 80% safe zone on a full-bleed background.
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0e0b1a' } })
  .composite([{ input: await sharp(svg).resize(410, 410).png().toBuffer(), gravity: 'center' }])
  .png()
  .toFile(out('pwa-maskable-512.png'))
console.log('icons written')
