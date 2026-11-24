import * as THREE from 'three'

export interface InkTextureBundle {
  hatch: THREE.CanvasTexture
  paper: THREE.CanvasTexture
  phoneScreen: THREE.CanvasTexture
  dispose: () => void
}

function seeded(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123
  return x - Math.floor(x)
}

/** Tileable hand-drawn pen crosshatching texture with organic taper & dry-brush gaps. */
export function createHatchTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)

  // Draw dense organic wrapping parallel engraving strokes (R channel holds stroke density)
  ctx.lineCap = 'round'
  for (let i = 0; i < 420; i++) {
    const x0 = seeded(i * 1.7 + 0.5) * size
    const y0 = seeded(i * 2.9 + 1.1) * size
    const len = 18 + seeded(i * 3.3 + 4.2) * 52
    const w = 0.7 + seeded(i * 5.1) * 1.55
    const alpha = 0.25 + seeded(i * 7.7) * 0.65
    const jitter = (seeded(i * 11.3) - 0.5) * 3.2

    ctx.strokeStyle = `rgba(12, 13, 16, ${alpha.toFixed(2)})`
    ctx.lineWidth = w

    // Tile seamlessly across 3x3 wrap offsets
    for (let ox = -size; ox <= size; ox += size) {
      for (let oy = -size; oy <= size; oy += size) {
        const sx = x0 + ox
        const sy = y0 + oy
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.quadraticCurveTo(sx + len * 0.5, sy + jitter * 0.5, sx + len, sy + jitter)
        ctx.stroke()
      }
    }
  }

  // Secondary cross-hatched scratches (stored slightly fainter so dark shadows gain woven depth)
  for (let i = 0; i < 160; i++) {
    const x0 = seeded(i * 4.3 + 91.2) * size
    const y0 = seeded(i * 6.1 + 33.7) * size
    const len = 12 + seeded(i * 2.1 + 7.9) * 32
    ctx.strokeStyle = 'rgba(20, 21, 26, 0.32)'
    ctx.lineWidth = 0.85

    for (let ox = -size; ox <= size; ox += size) {
      for (let oy = -size; oy <= size; oy += size) {
        const sx = x0 + ox
        const sy = y0 + oy
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + len * 0.35, sy + len)
        ctx.stroke()
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

/** Archival cotton-rag paper stipple grain for highlight breakup. */
export function createPaperNoiseTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)

  for (let i = 0; i < size * size; i++) {
    const coarse = seeded(Math.floor(i / 4) * 1.13)
    const fine = seeded(i * 3.71 + 19.4)
    const v = Math.max(0, Math.min(255, Math.round((coarse * 0.45 + fine * 0.55) * 255)))
    const p = i * 4
    img.data[p] = v
    img.data[p + 1] = v
    img.data[p + 2] = v
    img.data[p + 3] = 255
  }
  ctx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

/** Crisp FERRUM mobile interface texture displayed on the 3D smartphone in Act III. */
export function createFerrumPhoneScreenTexture(width = 512, height = 896): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // Deep obsidian background + subtle molten amber radial glow
  ctx.fillStyle = '#0c0d10'
  ctx.fillRect(0, 0, width, height)

  const glow = ctx.createRadialGradient(width * 0.5, height * 0.38, 24, width * 0.5, height * 0.38, width * 0.85)
  glow.addColorStop(0, 'rgba(234, 163, 91, 0.28)')
  glow.addColorStop(0.55, 'rgba(217, 138, 60, 0.08)')
  glow.addColorStop(1, 'rgba(12, 13, 16, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  // Hairline bezel border inside screen
  ctx.strokeStyle = 'rgba(234, 163, 91, 0.55)'
  ctx.lineWidth = 3
  ctx.strokeRect(20, 20, width - 40, height - 40)

  // Top Header
  ctx.fillStyle = '#eaa35b'
  ctx.font = 'bold 26px ui-monospace, monospace'
  ctx.fillText('FERRUM · HỆ THỐNG', 48, 86)

  ctx.fillStyle = 'rgba(244, 240, 232, 0.65)'
  ctx.font = '20px system-ui, sans-serif'
  ctx.fillText('PHÁC ĐỒ THOÁT GẦY 12 TUẦN', 48, 122)

  // Primary Kcal metric card
  ctx.fillStyle = 'rgba(217, 138, 60, 0.14)'
  ctx.fillRect(44, 160, width - 88, 165)
  ctx.strokeStyle = '#d98a3c'
  ctx.lineWidth = 2
  ctx.strokeRect(44, 160, width - 88, 165)

  ctx.fillStyle = '#b8b1a4'
  ctx.font = '20px ui-monospace, monospace'
  ctx.fillText('MỤC TIÊU THẶNG DƯ SẠCH', 68, 206)

  ctx.fillStyle = '#f4f0e8'
  ctx.font = 'bold 58px ui-monospace, monospace'
  ctx.fillText('2.712 KCAL', 68, 276)

  ctx.fillStyle = '#eaa35b'
  ctx.font = 'bold 24px ui-monospace, monospace'
  ctx.fillText('+350 KCAL / NGÀY', 68, 310)

  // 12-week ascending amber trajectory chart
  ctx.strokeStyle = 'rgba(244, 240, 232, 0.18)'
  ctx.lineWidth = 2
  ctx.strokeRect(44, 360, width - 88, 220)

  ctx.setLineDash([8, 8])
  ctx.strokeStyle = 'rgba(184, 177, 164, 0.45)'
  ctx.beginPath()
  ctx.moveTo(76, 535)
  ctx.lineTo(width - 76, 535)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.strokeStyle = '#eaa35b'
  ctx.lineWidth = 6
  ctx.beginPath()
  for (let i = 0; i <= 12; i++) {
    const px = 76 + (i / 12) * (width - 152)
    const py = 535 - Math.pow(i / 12, 0.88) * 125
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()

  ctx.fillStyle = '#f4f0e8'
  ctx.beginPath()
  ctx.arc(width - 76, 410, 9, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#f4f0e8'
  ctx.font = 'bold 24px ui-monospace, monospace'
  ctx.fillText('52.0 KG  →  64.5 KG', 68, 560)

  // Auto Overload badges
  const rows = [
    ['AUTO OVERLOAD', '+2.5 KG / TUẦN'],
    ['ĐẠM · BỘT · BÉO', '104P · 436C · 47F'],
    ['SQUAT / BENCH', 'RPE 7.5 – 8.0'],
  ]
  rows.forEach(([label, val], idx) => {
    const y = 620 + idx * 78
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
    ctx.fillRect(44, y, width - 88, 60)
    ctx.strokeStyle = 'rgba(244, 240, 232, 0.2)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(44, y, width - 88, 60)

    ctx.fillStyle = '#b8b1a4'
    ctx.font = '19px ui-monospace, monospace'
    ctx.fillText(label, 64, y + 37)

    ctx.fillStyle = '#eaa35b'
    ctx.font = 'bold 20px ui-monospace, monospace'
    ctx.fillText(val, width - 252, y + 37)
  })

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

export function createInkTextureBundle(): InkTextureBundle {
  const hatch = createHatchTexture(256)
  const paper = createPaperNoiseTexture(256)
  const phoneScreen = createFerrumPhoneScreenTexture(512, 896)

  return {
    hatch,
    paper,
    phoneScreen,
    dispose: () => {
      hatch.dispose()
      paper.dispose()
      phoneScreen.dispose()
    },
  }
}
