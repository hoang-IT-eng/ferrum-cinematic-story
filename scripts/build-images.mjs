#!/usr/bin/env node
/**
 * Image optimization pipeline for FERRUM:
 *   design/source-images/*.{jpg,png} -> public/images/<name>-<w>.{avif,webp}
 *   Generates src/imageManifest.json with dimensions and 16px LQIP placeholders.
 */
import sharp from 'sharp'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const SRC = process.env.IMG_SRC || 'design/source-images'
const OUT = process.env.IMG_OUT || 'public/images'
const MANIFEST = process.env.IMG_MANIFEST || 'src/imageManifest.json'

const PRESETS = {
  'hero-desktop': [960, 1440, 1920],
  'hero-mobile': [540, 810, 1080],
  default: [480, 864, 1280],
}

await mkdir(OUT, { recursive: true })
const manifest = {}
let totalBytes = 0

const files = (await readdir(SRC).catch(() => []))
  .filter((f) => /\.(jpe?g|png)$/i.test(f))
  .sort()

if (!files.length) {
  console.warn(`[build-images] No source images found in ${SRC}`)
}

for (const file of files) {
  const name = file.replace(/\.[^.]+$/, '')
  const srcPath = path.join(SRC, file)
  const meta = await sharp(srcPath).metadata()
  const widths = PRESETS[name] || PRESETS.default

  for (const w of widths) {
    const resized = sharp(srcPath).resize({
      width: w,
      kernel: 'lanczos3',
      withoutEnlargement: meta.width ? w > meta.width * 1.5 : false,
    })
    const avif = await resized.clone().avif({ quality: 52, effort: 6 }).toBuffer()
    const webp = await resized.clone().webp({ quality: 74 }).toBuffer()
    await writeFile(path.join(OUT, `${name}-${w}.avif`), avif)
    await writeFile(path.join(OUT, `${name}-${w}.webp`), webp)
    totalBytes += avif.length + webp.length
  }

  const lqip = await sharp(srcPath).resize({ width: 16 }).blur(1).webp({ quality: 40 }).toBuffer()
  const maxW = widths[widths.length - 1]
  manifest[name] = {
    base: `/images/${name}`,
    widths,
    width: maxW,
    height: Math.round((maxW * (meta.height || maxW)) / (meta.width || maxW)),
    lqip: `data:image/webp;base64,${lqip.toString('base64')}`,
  }
  console.log(`  ✓ ${name}: ${widths.join('/')}w`)
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`[build-images] Wrote ${Object.keys(manifest).length} entries (${(totalBytes / 1024).toFixed(0)} KB AVIF+WebP)`)
