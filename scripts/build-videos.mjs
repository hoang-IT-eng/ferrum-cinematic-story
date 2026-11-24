#!/usr/bin/env node
/**
 * Video optimization pipeline for FERRUM Interactive Film:
 *   ../video/cảnh *.mp4 -> public/videos/scene-1..5.mp4 + scene-1..5-poster.webp
 *
 * Normalizes resolution (1280x720, 24fps, yuv420p), keyframe interval (-g 24),
 * faststart moov atom, and EBU R128 loudness (-16 LUFS) across all clips.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.resolve(ROOT, '../video')
const OUT_DIR = path.resolve(ROOT, 'public/videos')
const CRF = process.env.VIDEO_CRF || '26'

const CLIPS = [
  { source: 'cảnh 1.mp4', target: 'scene-1' },
  { source: 'cảnh 2.mp4', target: 'scene-2' },
  { source: 'cảnh 3.mp4', target: 'scene-3' },
  { source: 'cảnh 4.mp4', target: 'scene-4' },
  { source: 'cảnh cuối.mp4', target: 'scene-5' },
]

function resolveSourceFile(dir, expectedName) {
  const direct = path.join(dir, expectedName)
  if (existsSync(direct)) return direct

  const normExpected = expectedName.normalize('NFC').toLowerCase()
  const entries = readdirSync(dir)
  const matched = entries.find((f) => f.normalize('NFC').toLowerCase() === normExpected)
  if (!matched) {
    throw new Error(`Missing source video "${expectedName}" in ${dir}`)
  }
  return path.join(dir, matched)
}

mkdirSync(OUT_DIR, { recursive: true })

let totalSourceBytes = 0
let totalOutputBytes = 0

for (const clip of CLIPS) {
  const srcPath = resolveSourceFile(SRC_DIR, clip.source)
  const outMp4 = path.join(OUT_DIR, `${clip.target}.mp4`)
  const outPoster = path.join(OUT_DIR, `${clip.target}-poster.webp`)
  const srcSize = statSync(srcPath).size
  totalSourceBytes += srcSize

  console.log(`[build-videos] Transcoding ${clip.source} (${(srcSize / 1048576).toFixed(2)} MB) -> ${clip.target}.mp4 ...`)

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      srcPath,
      '-vf',
      'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#0c0d0f,fps=24',
      '-c:v',
      'libx264',
      '-profile:v',
      'high',
      '-level',
      '4.0',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      CRF,
      '-preset',
      'medium',
      '-g',
      '24',
      '-movflags',
      '+faststart',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ac',
      '2',
      '-ar',
      '44100',
      '-af',
      'loudnorm=I=-16:TP=-1.5:LRA=11',
      outMp4,
    ],
    { stdio: 'pipe' },
  )

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-ss',
      '0.5',
      '-i',
      outMp4,
      '-frames:v',
      '1',
      '-c:v',
      'libwebp',
      '-q:v',
      '82',
      outPoster,
    ],
    { stdio: 'pipe' },
  )

  const outSize = statSync(outMp4).size
  const posterSize = statSync(outPoster).size
  totalOutputBytes += outSize
  console.log(
    `[build-videos]   Done ${clip.target}.mp4: ${(outSize / 1048576).toFixed(2)} MB, poster: ${(posterSize / 1024).toFixed(1)} KB`,
  )
}

console.log(
  `[build-videos] Complete: ${(totalSourceBytes / 1048576).toFixed(2)} MB -> ${(totalOutputBytes / 1048576).toFixed(2)} MB across ${CLIPS.length} clips (CRF=${CRF}).`,
)
