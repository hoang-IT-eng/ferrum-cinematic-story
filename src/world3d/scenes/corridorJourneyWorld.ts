import * as THREE from 'three'
import type { InkTextureBundle } from '../inkTextures'
import {
  createArchivalPaperBackdropMaterial,
  createChalkMistMaterial,
  createCorridorArchMaterial,
  createCorridorRoadMaterial,
  createCorridorWayfinderMaterial,
  createEditorialCutInMaterial,
  createFloorReflectionMaterial,
  createGodRaysMaterial,
  createInkRainMaterial,
  createUnifiedPlateMaterial,
} from '../spatialNovelShader'

export interface CorridorUpdateParams {
  fp: number
  elapsed: number
  mouseX: number
  mouseY: number
  scrollVel: number
  isNarrow: boolean
  darkBlend: number
}

export interface CorridorCinemaTelemetry {
  rush: number
  bloomStrength: number
  letterbox: number
  daylight: number
}

export interface CorridorJourneyWorld {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  backdropScene: THREE.Scene
  orthoCam: THREE.OrthographicCamera
  readyPromise: Promise<void>
  update: (params: CorridorUpdateParams) => CorridorCinemaTelemetry
  dispose: () => void
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(1e-5, edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function loadTexture(loader: THREE.TextureLoader, url: string, srgb: boolean): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
        tex.wrapS = THREE.ClampToEdgeWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.generateMipmaps = false
        resolve(tex)
      },
      undefined,
      reject,
    )
  })
}

function createHorizonGlowTexture(): THREE.CanvasTexture {
  const size = 256
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(244, 232, 210, 0.28)')
  g.addColorStop(0.45, 'rgba(224, 194, 148, 0.11)')
  g.addColorStop(1, 'rgba(212, 198, 174, 0.0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createDustMoteTexture(): THREE.CanvasTexture {
  const size = 64
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(244, 238, 224, 0.90)')
  g.addColorStop(0.45, 'rgba(225, 206, 176, 0.36)')
  g.addColorStop(1, 'rgba(214, 203, 184, 0.0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createWayfinderTexture(roman: string, milestone: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 384
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, c.width, c.height)

  // Archival drafting border & vertical measurement ruler ticks
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)'
  ctx.lineWidth = 2
  ctx.strokeRect(16, 16, c.width - 32, c.height - 32)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
  ctx.lineWidth = 1.5
  for (let y = 42; y <= 342; y += 25) {
    const tickW = y % 50 === 42 ? 12 : 6
    ctx.beginPath()
    ctx.moveTo(16, y)
    ctx.lineTo(16 + tickW, y)
    ctx.moveTo(c.width - 16, y)
    ctx.lineTo(c.width - 16 - tickW, y)
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.moveTo(c.width / 2, 38)
  ctx.lineTo(c.width / 2, 114)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)'
  ctx.stroke()

  ctx.fillStyle = 'rgba(255, 255, 255, 0.90)'
  ctx.textAlign = 'center'
  ctx.font = 'italic 600 96px Georgia, serif'
  ctx.fillText(roman, c.width / 2, 224)

  ctx.beginPath()
  ctx.moveTo(64, 258)
  ctx.lineTo(c.width - 64, 258)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)'
  ctx.stroke()

  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
  ctx.font = '600 22px monospace'
  ctx.fillText(milestone, c.width / 2, 304)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function shouldReduceMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !window.location.search.includes('motion=on') &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  )
}

interface CutInVideoController {
  warm: () => void
  setActive: (active: boolean, resetWhenFar: boolean) => void
  dispose: () => void
}

function createCutInVideoController(
  actId: string,
  webmUrl: string,
  mp4Url: string,
  eagerPreload: boolean,
  onReady: (tex: THREE.VideoTexture) => void,
): CutInVideoController {
  if (shouldReduceMotion() || typeof document === 'undefined') {
    return { warm: () => {}, setActive: () => {}, dispose: () => {} }
  }

  const video = document.createElement('video')
  video.muted = true
  video.defaultMuted = true
  video.loop = true
  video.playsInline = true
  video.preload = eagerPreload ? 'auto' : 'none'
  video.crossOrigin = 'anonymous'
  video.tabIndex = -1
  video.dataset.cutin = actId
  video.setAttribute('muted', '')
  video.setAttribute('playsinline', '')
  video.setAttribute('aria-hidden', 'true')
  video.style.position = 'fixed'
  video.style.width = '1px'
  video.style.height = '1px'
  video.style.opacity = '0.001'
  video.style.pointerEvents = 'none'
  video.style.zIndex = '-1'

  const srcWebm = document.createElement('source')
  srcWebm.src = webmUrl
  srcWebm.type = 'video/webm'
  const srcMp4 = document.createElement('source')
  srcMp4.src = mp4Url
  srcMp4.type = 'video/mp4'
  video.append(srcWebm, srcMp4)
  document.body.appendChild(video)

  const videoTex = new THREE.VideoTexture(video)
  videoTex.colorSpace = THREE.SRGBColorSpace
  videoTex.wrapS = THREE.ClampToEdgeWrapping
  videoTex.wrapT = THREE.ClampToEdgeWrapping
  videoTex.minFilter = THREE.LinearFilter
  videoTex.magFilter = THREE.LinearFilter
  videoTex.generateMipmaps = false

  let disposed = false
  let ready = false
  let loadStarted = eagerPreload
  let isActive = false
  let playPending = false

  const ensureLoaded = () => {
    if (disposed || loadStarted) return
    loadStarted = true
    video.preload = 'auto'
    video.load()
  }

  const tryPlay = () => {
    if (disposed || !isActive || !video.paused || playPending) return
    ensureLoaded()
    playPending = true
    const p = video.play()
    if (p && typeof p.then === 'function') {
      p.catch(() => {}).finally(() => {
        playPending = false
      })
    } else {
      playPending = false
    }
  }

  const handleReady = () => {
    if (disposed || video.readyState < 2) return
    if (!ready) {
      ready = true
      onReady(videoTex)
    }
    tryPlay()
  }

  const handleSeeked = () => {
    if (!disposed) videoTex.needsUpdate = true
  }

  const handleGestureRetry = () => {
    if (isActive && video.paused) tryPlay()
  }

  video.addEventListener('loadeddata', handleReady)
  video.addEventListener('canplay', handleReady)
  video.addEventListener('seeked', handleSeeked)
  window.addEventListener('pointerdown', handleGestureRetry, { passive: true })
  window.addEventListener('wheel', handleGestureRetry, { passive: true })
  window.addEventListener('keydown', handleGestureRetry, { passive: true })

  if (eagerPreload) {
    video.load()
  }

  return {
    warm: () => {
      ensureLoaded()
    },
    setActive: (active, resetWhenFar) => {
      if (disposed) return
      const becameActive = active && !isActive
      isActive = active
      if (active) {
        ensureLoaded()
      }
      if (becameActive && video.readyState >= 1) {
        try {
          video.currentTime = 0
        } catch {
          // Ignore seek errors before full buffer
        }
      }
      if (active) {
        tryPlay()
      } else {
        if (!video.paused) video.pause()
        if (resetWhenFar && video.readyState >= 1 && video.currentTime > 0.05) {
          try {
            video.currentTime = 0
          } catch {
            // Ignore seek errors on cleanup
          }
        }
      }
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      video.removeEventListener('loadeddata', handleReady)
      video.removeEventListener('canplay', handleReady)
      video.removeEventListener('seeked', handleSeeked)
      window.removeEventListener('pointerdown', handleGestureRetry)
      window.removeEventListener('wheel', handleGestureRetry)
      window.removeEventListener('keydown', handleGestureRetry)
      video.pause()
      srcWebm.remove()
      srcMp4.remove()
      video.removeAttribute('src')
      video.load()
      video.remove()
      videoTex.dispose()
    },
  }
}

const STATION_Z = [0.0, -13.5, -28.0, -43.0, -58.0] as const
const ARCH_Z_POSITIONS = Array.from({ length: 26 }, (_, i) => Number((1.4 - i * 3.2).toFixed(1)))

const WAYFINDER_SPECS = [
  { roman: 'I', milestone: '52 KG', z: 1.5, side: -1, amber: 0 },
  { roman: 'II', milestone: 'THÁNG 8', z: -9.8, side: 1, amber: 0 },
  { roman: 'III', milestone: '+350 KCAL', z: -24.2, side: -1, amber: 0.92 },
  { roman: 'IV', milestone: '+1.25 KG', z: -39.2, side: 1, amber: 1.0 },
  { roman: 'V', milestone: '64.5 KG', z: -54.2, side: -1, amber: 0.95 },
] as const

const ACT_AMBER = [0, 0, 0.90, 1.0, 0.92] as const
const CUT_SHEAR = [-0.11, 0.11, -0.09, 0.13, -0.08] as const

export function createCorridorJourneyWorld(
  inkTextures: InkTextureBundle,
  fluidTex: THREE.Texture,
  sharedResolution: THREE.Vector2,
): CorridorJourneyWorld {
  const scene = new THREE.Scene()
  const BASE_FOV = 38
  const TAN_HALF_FOV = Math.tan((BASE_FOV * 0.5 * Math.PI) / 180)
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 56)

  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const backdropScene = new THREE.Scene()
  const backdropGeo = new THREE.PlaneGeometry(2, 2)
  const backdropMat = createArchivalPaperBackdropMaterial(inkTextures, fluidTex)
  backdropMat.uniforms.uResolution.value = sharedResolution
  backdropScene.add(new THREE.Mesh(backdropGeo, backdropMat))

  const disposables: { dispose: () => void }[] = [backdropGeo, backdropMat]

  const fallbackColorTex = new THREE.DataTexture(new Uint8Array([24, 22, 20, 255]), 1, 1, THREE.RGBAFormat)
  fallbackColorTex.colorSpace = THREE.SRGBColorSpace
  fallbackColorTex.needsUpdate = true
  const fallbackDepthTex = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat)
  fallbackDepthTex.colorSpace = THREE.NoColorSpace
  fallbackDepthTex.needsUpdate = true
  const planeGeo = new THREE.PlaneGeometry(1, 1)
  disposables.push(fallbackColorTex, fallbackDepthTex, planeGeo)

  // Moving Vanishing-Point Horizon Glow staying camZ - 32 ahead down the corridor
  const horizonTex = createHorizonGlowTexture()
  const horizonMat = new THREE.MeshBasicMaterial({
    map: horizonTex,
    color: new THREE.Color(0xfff4df),
    transparent: true,
    opacity: 0.90,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  })
  const horizonMesh = new THREE.Mesh(planeGeo, horizonMat)
  horizonMesh.position.set(0, 0.08, -32.0)
  horizonMesh.scale.set(14, 9.5, 1)
  horizonMesh.renderOrder = 0
  scene.add(horizonMesh)
  disposables.push(horizonTex, horizonMat)

  // Continuous 96-unit Stone Avenue (Y = -1.32, Z = +10 -> -86, renderOrder = 1)
  const roadGeo = new THREE.PlaneGeometry(16, 96)
  const roadMat = createCorridorRoadMaterial(inkTextures)
  const roadMesh = new THREE.Mesh(roadGeo, roadMat)
  roadMesh.rotation.x = -Math.PI * 0.5
  roadMesh.position.set(0, -1.32, -38.0)
  roadMesh.renderOrder = 1
  scene.add(roadMesh)
  disposables.push(roadGeo, roadMat)

  // 26 Receding Brutalist Portal Arches widening into a Cathedral Vault toward Act V
  const archGeo = new THREE.PlaneGeometry(8.4, 5.4)
  disposables.push(archGeo)
  const arches = ARCH_Z_POSITIONS.map((zPos) => {
    const mat = createCorridorArchMaterial(inkTextures)
    const mesh = new THREE.Mesh(archGeo, mat)
    const openT = zPos < -46 ? clamp((-46 - zPos) / 18, 0, 1) : 0
    const sx = 1 + openT * 0.34
    const sy = 1 + openT * 0.22
    mesh.scale.set(sx, sy, 1)
    mesh.position.set(0, -1.32 + 5.4 * sy * 0.5, zPos)
    mesh.renderOrder = 2
    scene.add(mesh)
    disposables.push(mat)
    return { zPos, mat, mesh }
  })

  // 5 Storytelling Architectural Wayfinder Plaques along outer colonnade columns (renderOrder = 2)
  const wayfinderGeo = new THREE.PlaneGeometry(0.76, 1.18)
  disposables.push(wayfinderGeo)
  const wayfinders = WAYFINDER_SPECS.map((spec) => {
    const tex = createWayfinderTexture(spec.roman, spec.milestone)
    const mat = createCorridorWayfinderMaterial(tex, spec.amber)
    const mesh = new THREE.Mesh(wayfinderGeo, mat)
    mesh.position.set(spec.side * 3.12, 0.44, spec.z)
    mesh.rotation.y = spec.side * -0.26
    mesh.renderOrder = 2
    scene.add(mesh)
    disposables.push(tex, mat)
    return { zPos: spec.z, side: spec.side, mat, mesh }
  })

  // 5 Wet Stone Floor Mirror Reflections grounding each Act plate into the damp avenue (renderOrder = 2)
  const refMats = ACT_AMBER.map((amberAccent) =>
    createFloorReflectionMaterial({
      colorMap: fallbackColorTex,
      textures: inkTextures,
      amberAccent,
    }),
  )
  const refMeshes = refMats.map((mat) => {
    const mesh = new THREE.Mesh(planeGeo, mat)
    mesh.rotation.order = 'YXZ'
    mesh.renderOrder = 2
    scene.add(mesh)
    disposables.push(mat)
    return mesh
  })

  const livingWeight = shouldReduceMotion() ? 0 : 1

  // 5 Unified Monograph Plates (renderOrder = 3) & 5 Foreground Slanted Cut-Ins (renderOrder = 6+)
  const plateMats = ACT_AMBER.map((amberAccent, i) => {
    const mat = createUnifiedPlateMaterial({
      colorMap: fallbackColorTex,
      depthMap: fallbackDepthTex,
      textures: inkTextures,
      parallaxStrength: 0.010,
      focusDepth: 0.48,
      amberAccent,
      actIndex: i,
    })
    mat.uniforms.uLiving.value = livingWeight
    return mat
  })
  const plateMeshes = plateMats.map((mat, i) => {
    const mesh = new THREE.Mesh(planeGeo, mat)
    mesh.renderOrder = i === 0 ? 4 : 3
    scene.add(mesh)
    disposables.push(mat)
    return mesh
  })

  const cutMats = CUT_SHEAR.map((shear, i) => {
    const mat = createEditorialCutInMaterial({
      colorMap: fallbackColorTex,
      textures: inkTextures,
      shear,
      amberAccent: ACT_AMBER[i],
      actIndex: i,
    })
    mat.uniforms.uLiving.value = livingWeight
    return mat
  })
  const cutMeshes = cutMats.map((mat, i) => {
    const mesh = new THREE.Mesh(planeGeo, mat)
    mesh.renderOrder = 6 + i
    scene.add(mesh)
    disposables.push(mat)
    return mesh
  })

  // Per-Act 3D Foreground Atmosphere Planes: Act I Ink Rain, Act II Chalk Mist, Act V God-Rays
  const rainMat = createInkRainMaterial()
  const rainMesh = new THREE.Mesh(planeGeo, rainMat)
  rainMesh.renderOrder = 12
  scene.add(rainMesh)

  const chalkMat = createChalkMistMaterial(inkTextures)
  const chalkMesh = new THREE.Mesh(planeGeo, chalkMat)
  chalkMesh.renderOrder = 7
  scene.add(chalkMesh)

  const godRaysMat = createGodRaysMaterial()
  const godRaysMesh = new THREE.Mesh(planeGeo, godRaysMat)
  godRaysMesh.renderOrder = 12
  scene.add(godRaysMesh)

  disposables.push(rainMat, chalkMat, godRaysMat)

  // Volumetric 3D Dust & Ember Motes spanning Z = +6 .. -76 (renderOrder = 5)
  const dustCount = 420
  const dustPos = new Float32Array(dustCount * 3)
  const dustBase = new Float32Array(dustCount * 3)
  for (let i = 0; i < dustCount; i++) {
    const s1 = Math.sin(i * 12.9898 + 1.3) * 43758.5453
    const s2 = Math.sin(i * 78.233 + 4.7) * 29384.123
    const s3 = Math.sin(i * 45.164 + 8.1) * 19283.451
    const r1 = s1 - Math.floor(s1)
    const r2 = s2 - Math.floor(s2)
    const r3 = s3 - Math.floor(s3)
    const x = (r1 - 0.5) * 9.0
    const y = -1.2 + r2 * 4.4
    const z = -76.0 + r3 * 82.0
    dustPos[i * 3] = x
    dustPos[i * 3 + 1] = y
    dustPos[i * 3 + 2] = z
    dustBase[i * 3] = x
    dustBase[i * 3 + 1] = y
    dustBase[i * 3 + 2] = z
  }
  const dustGeo = new THREE.BufferGeometry()
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dustTex = createDustMoteTexture()
  const dustBoneColor = new THREE.Color(0xede5d6)
  const dustAmberColor = new THREE.Color(0xf2a74b)
  const dustGoldColor = new THREE.Color(0xffdfa6)
  const dustMat = new THREE.PointsMaterial({
    map: dustTex,
    color: dustBoneColor.clone(),
    size: 0.034,
    transparent: true,
    opacity: 0.44,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  })
  const dustPoints = new THREE.Points(dustGeo, dustMat)
  dustPoints.renderOrder = 5
  scene.add(dustPoints)
  disposables.push(dustGeo, dustTex, dustMat)

  // Live looping WebM/MP4 VideoTextures seamlessly upgrading all 5 Cut-Ins (eager on Acts I-II, lazy-warmed on Acts III-V)
  const cutVideoBound = [false, false, false, false, false]
  const cutVideos = [1, 2, 3, 4, 5].map((actNum) => {
    const idx = actNum - 1
    return createCutInVideoController(
      `act-${actNum}`,
      `/diorama/act-${actNum}/cutin.webm`,
      `/diorama/act-${actNum}/cutin.mp4`,
      actNum <= 2,
      (vTex) => {
        cutVideoBound[idx] = true
        cutMats[idx].uniforms.tColor.value = vTex
      },
    )
  })
  disposables.push(...cutVideos)

  // Live looping 16:9 VideoTexture upgrading Act IV's Main Plate overhead barbell press + real-time wet floor reflection
  let act4MainVideoBound = false
  const act4MainVideo = createCutInVideoController(
    'act-4-main',
    '/diorama/act-4/main.webm',
    '/diorama/act-4/main.mp4',
    false,
    (vTex) => {
      act4MainVideoBound = true
      plateMats[3].uniforms.tColor.value = vTex
      plateMats[3].uniforms.uLiving.value = 0
      refMats[3].uniforms.tColor.value = vTex
    },
  )
  disposables.push(act4MainVideo)

  // Parallel preload of all 15 unified diorama textures (Acts I..V)
  const loader = new THREE.TextureLoader()
  const readyPromise = Promise.all(
    [1, 2, 3, 4, 5].map((actNum) =>
      Promise.all([
        loadTexture(loader, `/diorama/act-${actNum}/main.webp`, true),
        loadTexture(loader, `/diorama/act-${actNum}/main-depth.webp`, false),
        loadTexture(loader, `/diorama/act-${actNum}/cutin.webp`, true),
      ]).then(([mainTex, depthTex, cutTex]) => {
        const idx = actNum - 1
        if (idx !== 3 || !act4MainVideoBound) {
          plateMats[idx].uniforms.tColor.value = mainTex
          refMats[idx].uniforms.tColor.value = mainTex
        }
        plateMats[idx].uniforms.tDepth.value = depthTex
        if (!cutVideoBound[idx]) {
          cutMats[idx].uniforms.tColor.value = cutTex
        }
        disposables.push(mainTex, depthTex, cutTex)
      }),
    ),
  ).then(() => undefined)

  const horizonBoneCol = new THREE.Color(0xfff4df)
  const horizonAmberCol = new THREE.Color(0xf2a44c)
  const horizonDayCol = new THREE.Color(0xffdda2)

  let curTiltX = 0
  let curTiltZ = 0

  const syncReflection = (
    idx: number,
    visible: boolean,
    x: number,
    z: number,
    w: number,
    rotY: number,
    op: number,
    elapsed: number,
    pulse: number,
  ) => {
    const show = visible && op > 0.012
    refMeshes[idx].visible = show
    if (!show) return
    const refDepth = 3.25
    refMeshes[idx].scale.set(w, refDepth, 1)
    refMeshes[idx].position.set(x, -1.305, z + refDepth * 0.5)
    refMeshes[idx].rotation.set(-Math.PI * 0.5, rotY, 0)
    refMats[idx].uniforms.uTime.value = elapsed
    refMats[idx].uniforms.uOpacity.value = op
    refMats[idx].uniforms.uPulse.value = pulse
  }

  return {
    scene,
    camera,
    backdropScene,
    orthoCam,
    readyPromise,
    update: ({ fp, elapsed, mouseX, mouseY, scrollVel, isNarrow, darkBlend }) => {
      const clampedFp = clamp(fp, 0, 4.95)
      const aspect = Math.max(0.35, camera.aspect || 16 / 9)
      const dwellDist = isNarrow ? 5.15 : 4.25

      // 4 Long-Corridor Transition Curves & 5 Dwell Dolly Intervals
      const t01 = smoothstep(0.36, 1.08, clampedFp)
      const t12 = smoothstep(1.44, 2.08, clampedFp)
      const t23 = smoothstep(2.44, 3.08, clampedFp)
      const t34 = smoothstep(3.44, 4.08, clampedFp)

      const d0 = smoothstep(0.0, 0.36, clampedFp)
      const d1 = smoothstep(1.08, 1.44, clampedFp)
      const d2 = smoothstep(2.08, 2.44, clampedFp)
      const d3 = smoothstep(3.08, 3.44, clampedFp)
      const d4 = smoothstep(4.08, 4.70, clampedFp)

      const camZ =
        dwellDist -
        d0 * 0.24 -
        t01 * (13.5 - 0.24) -
        d1 * 0.24 -
        t12 * (14.5 - 0.24) -
        d2 * 0.24 -
        t23 * (15.0 - 0.24) -
        d3 * 0.24 -
        t34 * (15.0 - 0.24) -
        d4 * 0.24

      const b01 = Math.sin(t01 * Math.PI)
      const b12 = Math.sin(t12 * Math.PI)
      const b23 = Math.sin(t23 * Math.PI)
      const b34 = Math.sin(t34 * Math.PI)

      const act5Breakout = smoothstep(3.92, 4.24, clampedFp)
      const arcX = (b01 * 0.52 - b12 * 0.58 + b23 * 0.24 - b34 * 0.28) * (isNarrow ? 0.28 : 1.0)
      const camY =
        (0.08 - b01 * 0.10 - b12 * 0.12 - b23 * 0.22 + smoothstep(3.35, 4.18, clampedFp) * 0.24) *
        (1 - (isNarrow ? 0 : act5Breakout * 0.72))

      // Dynamic speed-rush FOV breathing across portals
      const baseFov =
        BASE_FOV -
        smoothstep(3.55, 4.25, clampedFp) * 1.2 +
        b01 * 3.0 +
        b12 * 3.6 +
        b23 * 4.6 +
        b34 * 3.4
      if (Math.abs(camera.fov - baseFov) > 0.02) {
        camera.fov = baseFov
        camera.updateProjectionMatrix()
      }

      // Act IV visceral iron micro-impact tremor when locking onto the breakthrough frame
      const act4Impact =
        Math.exp(-Math.pow((clampedFp - 3.10) * 14.0, 2.0)) *
        clamp(Math.abs(scrollVel) * 0.12 + 0.42, 0, 1) *
        (isNarrow ? 0.45 : 1.0)
      const shakeX = Math.sin(elapsed * 46.0) * 0.016 * act4Impact
      const shakeY = Math.cos(elapsed * 53.0) * 0.012 * act4Impact

      // Smooth 3D scroll-velocity spring inertia + subtle roll banking
      const bankZ = (-b01 * 0.015 + b12 * 0.018 - b23 * 0.012) * (isNarrow ? 0.35 : 1.0)
      const targetTiltX = clamp(-scrollVel * 0.0065, -0.048, 0.048)
      const targetTiltZ = clamp(scrollVel * 0.0022, -0.022, 0.022) + bankZ
      curTiltX += (targetTiltX - curTiltX) * 0.085
      curTiltZ += (targetTiltZ - curTiltZ) * 0.085

      const swayScale = 1 - (isNarrow ? 0 : act5Breakout * 0.55)
      const swayX = mouseX * (isNarrow ? 0.04 : 0.16) * swayScale
      const swayY = mouseY * (isNarrow ? 0.03 : 0.10) * swayScale

      camera.position.set(arcX + swayX + shakeX, camY + swayY + shakeY, camZ)
      camera.lookAt(arcX * 0.25 + swayX * 0.28, camY - 0.02 * swayScale + swayY * 0.28, camZ - 8.5)
      camera.rotation.x += curTiltX
      camera.rotation.z += curTiltZ

      // Atmospheric Story Progression Signals
      const actProg = clamp(clampedFp, 0, 4.0)
      const amberProgress = smoothstep(1.55, 2.25, clampedFp)
      const daylightProgress = smoothstep(3.35, 4.18, clampedFp)
      const act3Pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.1)
      const act3Window = smoothstep(1.70, 2.08, clampedFp) * (1 - smoothstep(2.45, 2.80, clampedFp))

      backdropMat.uniforms.uActProgress.value = actProg
      backdropMat.uniforms.uDarkBlend.value = darkBlend

      // Vanishing Horizon Glow glides forward ahead of camera & ignites toward Act V sun
      horizonMesh.position.set(0, 0.10 + daylightProgress * 0.32, camZ - 32.0)
      const hScale = 1.0 + daylightProgress * 0.42
      horizonMesh.scale.set(14 * hScale, 9.5 * hScale, 1)
      horizonMat.opacity = (0.90 + daylightProgress * 0.22 + act3Window * act3Pulse * 0.12) * (1 - darkBlend)
      horizonMat.color.copy(horizonBoneCol).lerp(horizonAmberCol, amberProgress).lerp(horizonDayCol, daylightProgress)

      const envFadeForImax = isNarrow ? 1 : 1 - act5Breakout * 0.92
      roadMat.uniforms.uCamZ.value = camZ
      roadMat.uniforms.uOpacity.value = (1 - darkBlend) * envFadeForImax
      roadMat.uniforms.uAmberProgress.value = amberProgress
      roadMat.uniforms.uDaylight.value = daylightProgress

      arches.forEach(({ zPos, mat, mesh }) => {
        const dist = camZ - zPos
        if (dist < 0.3 || dist > 30.0) {
          mesh.visible = false
          return
        }
        const nearFade = smoothstep(0.45, 2.5, dist)
        const farFade = 1 - smoothstep(14.5, 29.5, dist)
        const alpha = clamp(nearFade * farFade * (1 - darkBlend) * envFadeForImax, 0, 1)
        mesh.visible = alpha > 0.005
        mat.uniforms.uAlpha.value = alpha
        mat.uniforms.uDistFade.value = clamp(dist / 26.0, 0, 1)
        mat.uniforms.uAmberProgress.value = amberProgress + act3Window * act3Pulse * 0.12
        mat.uniforms.uDaylight.value = daylightProgress
      })

      wayfinders.forEach(({ zPos, side, mat, mesh }) => {
        const dist = camZ - zPos
        if (dist < 1.2 || dist > 19.0) {
          mesh.visible = false
          return
        }
        const alpha =
          smoothstep(1.4, 3.2, dist) * (1 - smoothstep(11.0, 18.5, dist)) * 0.76 * (1 - darkBlend) * envFadeForImax
        mesh.visible = alpha > 0.01
        mesh.position.x = side * (isNarrow ? 2.45 : 3.12)
        mat.uniforms.uAlpha.value = alpha
      })

      const visHDwell = 2 * dwellDist * TAN_HALF_FOV
      const visWDwell = visHDwell * aspect
      const plateW = isNarrow ? visWDwell * 0.94 : Math.min(visWDwell * 0.87, visHDwell * 0.79 * 1.74)
      const plateH = isNarrow ? plateW / 1.66 : plateW / 1.74
      const plateYOff = isNarrow ? -0.02 : 0.10

      const dCutDwell = dwellDist - 0.86
      const visHCut = 2 * dCutDwell * TAN_HALF_FOV
      const visWCut = visHCut * aspect
      const cutW = isNarrow ? Math.min(visWCut * 0.84, 1.18) : Math.min(visWCut * 0.33, 1.24)
      const cutH = cutW * 0.5

      const tiltY = mouseX * 0.032
      const tiltX = -mouseY * 0.022
      const floatY = (idx: number) => Math.sin(elapsed * 0.65 + idx * 1.35) * 0.015

      // ------------------------------------------------------------------
      // ACT I (Z = 0.0) — Centered Monolith, Top-Right Cut-In -> Left Glide + Ink Rain
      // ------------------------------------------------------------------
      const exit0 = smoothstep(0.36, 0.80, clampedFp)
      const op0 = (1 - smoothstep(0.58, 0.84, clampedFp)) * (1 - darkBlend)
      plateMeshes[0].visible = op0 > 0.005
      const x0 = -exit0 * (isNarrow ? 1.75 : 3.45)
      const z0 = STATION_Z[0] - exit0 * 1.15
      const ry0 = tiltY + exit0 * 0.56
      if (plateMeshes[0].visible) {
        plateMeshes[0].scale.set(plateW, plateH, 1)
        plateMeshes[0].position.set(x0, plateYOff + floatY(0) + exit0 * 0.12, z0)
        plateMeshes[0].rotation.set(tiltX, ry0, 0)
        plateMats[0].uniforms.uTime.value = elapsed
        plateMats[0].uniforms.uMouse.value.set(mouseX, mouseY)
        plateMats[0].uniforms.uZoom.value = 1.02 + d0 * 0.038
        plateMats[0].uniforms.uPan.value.set(d0 * 0.015, -d0 * 0.008)
        plateMats[0].uniforms.uDepthVeil.value = exit0 * 0.48
        plateMats[0].uniforms.uReveal.value = 1 - smoothstep(0.54, 0.82, clampedFp)
        plateMats[0].uniforms.uOpacity.value = op0
      }
      syncReflection(0, plateMeshes[0].visible, x0, z0, plateW, ry0, op0 * 0.92, elapsed, 0.4)

      const cutOp0 = (1 - smoothstep(0.50, 0.74, clampedFp)) * (1 - darkBlend)
      cutMeshes[0].visible = cutOp0 > 0.005
      if (cutMeshes[0].visible) {
        const p0 = clamp(clampedFp / 0.48, 0, 1)
        cutMeshes[0].scale.set(cutW, cutH, 1)
        cutMeshes[0].position.set(
          isNarrow
            ? (p0 - 0.5) * -0.18 + 0.04 + exit0 * 0.95
            : plateW * 0.22 + 0.14 - (p0 - 0.5) * 0.34 + exit0 * 1.65,
          (isNarrow ? 0.78 : plateH * 0.24 + (p0 - 0.5) * -0.08) + floatY(0) * 1.25 + exit0 * 0.36,
          STATION_Z[0] + 0.86,
        )
        cutMeshes[0].rotation.set(-mouseY * 0.038, mouseX * 0.056 - exit0 * 0.32, 0)
        cutMats[0].uniforms.uTime.value = elapsed
        cutMats[0].uniforms.uMouse.value.set(mouseX, mouseY)
        cutMats[0].uniforms.uReveal.value =
          smoothstep(-0.04, 0.14, clampedFp) * (1 - smoothstep(0.42, 0.70, clampedFp))
        cutMats[0].uniforms.uKenBurns.value = 1.0 + p0 * 0.05
        cutMats[0].uniforms.uOpacity.value = cutOp0
      }
      cutVideos[0].setActive(clampedFp <= 0.78 && darkBlend < 0.9, clampedFp > 1.15)

      // ------------------------------------------------------------------
      // ACT II (Z = -13.5) — Right-Weighted Monolith + LIVE VIDEO Cut-In + Chalk Mist -> Right Swing
      // ------------------------------------------------------------------
      const vis1 = smoothstep(0.32, 0.76, clampedFp)
      const clear1 = smoothstep(0.54, 1.08, clampedFp)
      const exit1 = smoothstep(1.44, 1.86, clampedFp)
      const op1 = vis1 * (1 - smoothstep(1.66, 1.92, clampedFp)) * (1 - darkBlend)
      plateMeshes[1].visible = op1 > 0.005
      const x1 = (isNarrow ? 0 : 0.16 * clear1) + exit1 * (isNarrow ? 1.75 : 3.55)
      const z1 = STATION_Z[1] - exit1 * 1.15
      const ry1 = tiltY - 0.025 * clear1 - exit1 * 0.58
      if (plateMeshes[1].visible) {
        plateMeshes[1].scale.set(plateW, plateH, 1)
        plateMeshes[1].position.set(x1, plateYOff + floatY(1) + exit1 * 0.12, z1)
        plateMeshes[1].rotation.set(tiltX, ry1, 0)
        plateMats[1].uniforms.uTime.value = elapsed
        plateMats[1].uniforms.uMouse.value.set(mouseX, mouseY)
        plateMats[1].uniforms.uZoom.value = 1.02 + d1 * 0.038
        plateMats[1].uniforms.uPan.value.set(-d1 * 0.015, d1 * 0.008)
        plateMats[1].uniforms.uDepthVeil.value = (1 - clear1) * 0.65 + exit1 * 0.48
        plateMats[1].uniforms.uReveal.value =
          smoothstep(0.36, 0.80, clampedFp) * (1 - smoothstep(1.62, 1.90, clampedFp))
        plateMats[1].uniforms.uOpacity.value = op1
      }
      syncReflection(1, plateMeshes[1].visible, x1, z1, plateW, ry1, op1 * 0.86, elapsed, 0.4)

      const cutOp1 = smoothstep(0.92, 1.14, clampedFp) * (1 - smoothstep(1.56, 1.82, clampedFp)) * (1 - darkBlend)
      cutMeshes[1].visible = cutOp1 > 0.005
      if (cutMeshes[1].visible) {
        const p1 = clamp((clampedFp - 1.02) / 0.56, 0, 1)
        cutMeshes[1].scale.set(cutW, cutH, 1)
        cutMeshes[1].position.set(
          isNarrow
            ? (p1 - 0.5) * 0.18 - 0.04 - exit1 * 0.95
            : -(plateW * 0.21 + 0.12) + (p1 - 0.5) * 0.34 - exit1 * 1.65,
          (isNarrow ? 0.78 : plateH * 0.24 + (p1 - 0.5) * -0.08) + floatY(1) * 1.25 + exit1 * 0.34,
          STATION_Z[1] + 0.86,
        )
        cutMeshes[1].rotation.set(-mouseY * 0.038, mouseX * 0.056 + exit1 * 0.32, 0)
        cutMats[1].uniforms.uTime.value = elapsed
        cutMats[1].uniforms.uMouse.value.set(mouseX, mouseY)
        cutMats[1].uniforms.uReveal.value =
          smoothstep(0.94, 1.18, clampedFp) * (1 - smoothstep(1.52, 1.80, clampedFp))
        cutMats[1].uniforms.uKenBurns.value = 1.0 + p1 * 0.04
        cutMats[1].uniforms.uOpacity.value = cutOp1
      }
      cutVideos[1].setActive(
        clampedFp >= 0.90 && clampedFp <= 1.88 && darkBlend < 0.9,
        clampedFp < 0.55 || clampedFp > 2.20,
      )

      // ------------------------------------------------------------------
      // ACT III (Z = -28.0) — Editorial Left Split + Crisp Right Amber Card -> Rising Shutter Exit
      // ------------------------------------------------------------------
      const vis2 = smoothstep(1.36, 1.78, clampedFp)
      const clear2 = smoothstep(1.58, 2.08, clampedFp)
      const exit2 = smoothstep(2.44, 2.86, clampedFp)
      const op2 = vis2 * (1 - smoothstep(2.66, 2.92, clampedFp)) * (1 - darkBlend)
      plateMeshes[2].visible = op2 > 0.005
      const w2 = isNarrow ? plateW : plateW * (1 - clear2 * 0.12)
      const h2 = w2 / (isNarrow ? 1.66 : 1.74)
      const x2 = (isNarrow ? 0 : -0.34 * clear2) - exit2 * (isNarrow ? 0.55 : 1.80)
      const z2 = STATION_Z[2] - exit2 * 0.85
      const ry2 = tiltY + 0.042 * clear2 + exit2 * 0.30
      if (plateMeshes[2].visible) {
        plateMeshes[2].scale.set(w2, h2, 1)
        plateMeshes[2].position.set(x2, plateYOff + 0.04 + floatY(2) + exit2 * 2.35, z2)
        plateMeshes[2].rotation.set(tiltX - exit2 * 0.24, ry2, 0)
        plateMats[2].uniforms.uTime.value = elapsed
        plateMats[2].uniforms.uMouse.value.set(mouseX, mouseY)
        plateMats[2].uniforms.uZoom.value = 1.02 + d2 * 0.042
        plateMats[2].uniforms.uPan.value.set(d2 * 0.012, d2 * 0.010)
        plateMats[2].uniforms.uDepthVeil.value = (1 - clear2) * 0.65 + exit2 * 0.48
        plateMats[2].uniforms.uReveal.value =
          smoothstep(1.40, 1.82, clampedFp) * (1 - smoothstep(2.62, 2.90, clampedFp))
        plateMats[2].uniforms.uOpacity.value = op2
      }
      syncReflection(2, plateMeshes[2].visible, x2, z2, w2, ry2, op2 * (1 - exit2 * 0.85), elapsed, act3Pulse)

      const cutOp2 = smoothstep(1.92, 2.14, clampedFp) * (1 - smoothstep(2.56, 2.82, clampedFp)) * (1 - darkBlend)
      cutMeshes[2].visible = cutOp2 > 0.005
      if (cutMeshes[2].visible) {
        const p2 = clamp((clampedFp - 2.02) / 0.56, 0, 1)
        const cw2 = isNarrow ? cutW : cutW * 1.06
        const ch2 = cw2 * 0.5
        cutMeshes[2].scale.set(cw2, ch2, 1)
        cutMeshes[2].position.set(
          isNarrow
            ? (p2 - 0.5) * -0.16 + exit2 * 0.90
            : w2 * 0.32 + (p2 - 0.5) * -0.18 + exit2 * 1.55,
          (isNarrow ? 0.78 : 0.14 + (p2 - 0.5) * 0.12) + floatY(2) * 1.2 - exit2 * 0.55,
          STATION_Z[2] + 0.86,
        )
        cutMeshes[2].rotation.set(-mouseY * 0.038, mouseX * 0.056 - 0.04 - exit2 * 0.25, 0)
        cutMats[2].uniforms.uTime.value = elapsed
        cutMats[2].uniforms.uMouse.value.set(mouseX, mouseY)
        cutMats[2].uniforms.uReveal.value =
          smoothstep(1.94, 2.18, clampedFp) * (1 - smoothstep(2.52, 2.80, clampedFp))
        cutMats[2].uniforms.uKenBurns.value = 1.0 + p2 * 0.05
        cutMats[2].uniforms.uOpacity.value = cutOp2
      }
      if (clampedFp >= 1.15) cutVideos[2].warm()
      cutVideos[2].setActive(
        clampedFp >= 1.90 && clampedFp <= 2.86 && darkBlend < 0.9,
        clampedFp < 1.55 || clampedFp > 3.20,
      )

      // ------------------------------------------------------------------
      // ACT IV (Z = -43.0) — High-Impact Wide Power Plate + Lower-Right Iron Cut-In -> Twin-Wing Parting
      // ------------------------------------------------------------------
      const vis3 = smoothstep(2.36, 2.78, clampedFp)
      const clear3 = smoothstep(2.58, 3.08, clampedFp)
      const exit3 = smoothstep(3.44, 3.86, clampedFp)
      const op3 = vis3 * (1 - smoothstep(3.66, 3.92, clampedFp)) * (1 - darkBlend)
      plateMeshes[3].visible = op3 > 0.005
      const w3 = isNarrow ? plateW : plateW * 1.03
      const h3 = w3 / (isNarrow ? 1.66 : 1.74)
      const x3 = exit3 * (isNarrow ? 1.70 : 3.45)
      const z3 = STATION_Z[3] - exit3 * 1.05
      const ry3 = tiltY - exit3 * 0.52
      if (plateMeshes[3].visible) {
        plateMeshes[3].scale.set(w3, h3, 1)
        plateMeshes[3].position.set(x3, plateYOff + floatY(3) - exit3 * 0.55, z3)
        plateMeshes[3].rotation.set(tiltX, ry3, (1 - clear3) * 0.045 - exit3 * 0.06)
        plateMats[3].uniforms.uTime.value = elapsed
        plateMats[3].uniforms.uMouse.value.set(mouseX, mouseY)
        plateMats[3].uniforms.uZoom.value = 1.02 + d3 * 0.045
        plateMats[3].uniforms.uPan.value.set(0, -d3 * 0.010)
        plateMats[3].uniforms.uDepthVeil.value = (1 - clear3) * 0.65 + exit3 * 0.48
        plateMats[3].uniforms.uReveal.value =
          smoothstep(2.40, 2.82, clampedFp) * (1 - smoothstep(3.62, 3.90, clampedFp))
        plateMats[3].uniforms.uOpacity.value = op3
      }
      syncReflection(3, plateMeshes[3].visible, x3, z3, w3, ry3, op3, elapsed, 0.72)

      const cutOp3 = smoothstep(2.92, 3.14, clampedFp) * (1 - smoothstep(3.56, 3.82, clampedFp)) * (1 - darkBlend)
      cutMeshes[3].visible = cutOp3 > 0.005
      if (cutMeshes[3].visible) {
        const p3 = clamp((clampedFp - 3.02) / 0.56, 0, 1)
        cutMeshes[3].scale.set(cutW, cutH, 1)
        cutMeshes[3].position.set(
          isNarrow
            ? (p3 - 0.5) * 0.16 - exit3 * 1.15
            : w3 * 0.25 + 0.08 - (p3 - 0.5) * 0.30 - exit3 * 2.55,
          (isNarrow ? 0.78 : -h3 * 0.14 + (p3 - 0.5) * 0.10) + floatY(3) * 1.2 + exit3 * 1.25,
          STATION_Z[3] + 0.86,
        )
        cutMeshes[3].rotation.set(-mouseY * 0.038, mouseX * 0.056 + exit3 * 0.38, 0)
        cutMats[3].uniforms.uTime.value = elapsed
        cutMats[3].uniforms.uMouse.value.set(mouseX, mouseY)
        cutMats[3].uniforms.uReveal.value =
          smoothstep(2.94, 3.18, clampedFp) * (1 - smoothstep(3.52, 3.80, clampedFp))
        cutMats[3].uniforms.uKenBurns.value = 1.0 + p3 * 0.06
        cutMats[3].uniforms.uOpacity.value = cutOp3
      }
      if (clampedFp >= 2.15) {
        act4MainVideo.warm()
        cutVideos[3].warm()
      }
      act4MainVideo.setActive(
        clampedFp >= 2.55 && clampedFp <= 3.88 && darkBlend < 0.9,
        clampedFp < 2.20 || clampedFp > 4.25,
      )
      cutVideos[3].setActive(
        clampedFp >= 2.90 && clampedFp <= 3.86 && darkBlend < 0.9,
        clampedFp < 2.55 || clampedFp > 4.20,
      )

      // ------------------------------------------------------------------
      // ACT V (Z = -58.0) — IMAX Full-Bleed Breakout + Volumetric God-Rays + Calm Gaze Echo
      // ------------------------------------------------------------------
      const vis4 = smoothstep(3.38, 3.82, clampedFp)
      const clear4 = smoothstep(3.62, 4.14, clampedFp)
      const tailRise = smoothstep(4.28, 4.95, clampedFp)
      const op4 = vis4 * (1 - darkBlend)
      plateMeshes[4].visible = op4 > 0.005
      const dz5 = Math.max(1.5, camZ - STATION_Z[4])
      const tanHalfCurrent = Math.tan((camera.fov * 0.5 * Math.PI) / 180)
      const visH5 = 2 * dz5 * tanHalfCurrent
      const visW5 = visH5 * aspect
      const coverW5 = Math.max(visW5, visH5 * 1.792) * 1.04
      const coverH5 = coverW5 / 1.792
      const w5 = isNarrow
        ? plateW + (visWDwell * 1.02 - plateW) * act5Breakout
        : plateW + (coverW5 - plateW) * act5Breakout
      const h5 = isNarrow
        ? plateH * (1 + act5Breakout * 0.10)
        : plateH + (coverH5 - plateH) * act5Breakout

      if (plateMeshes[4].visible) {
        plateMeshes[4].scale.set(w5, h5, 1)
        plateMeshes[4].position.set(
          0,
          isNarrow
            ? -0.02 + floatY(4) + tailRise * 0.08
            : (0.14 + floatY(4)) * (1 - act5Breakout * 0.88) + tailRise * 0.04,
          STATION_Z[4],
        )
        const rotDamp5 = isNarrow ? 1 : 1 - act5Breakout * 0.72
        plateMeshes[4].rotation.set(tiltX * rotDamp5, tiltY * rotDamp5, 0)
        plateMats[4].uniforms.uTime.value = elapsed
        plateMats[4].uniforms.uMouse.value.set(mouseX, mouseY)
        plateMats[4].uniforms.uZoom.value = 1.02 + d4 * 0.042
        plateMats[4].uniforms.uPan.value.set(0, d4 * 0.012)
        plateMats[4].uniforms.uDepthVeil.value = (1 - clear4) * 0.62
        plateMats[4].uniforms.uVeilTint.value.setHex(0x2b231a)
        plateMats[4].uniforms.uReveal.value = smoothstep(3.42, 3.86, clampedFp)
        plateMats[4].uniforms.uOpacity.value = op4
        plateMats[4].uniforms.uFullBleed.value = isNarrow ? act5Breakout * 0.75 : act5Breakout
      }
      syncReflection(
        4,
        plateMeshes[4].visible,
        0,
        STATION_Z[4],
        plateW,
        tiltY,
        op4 * (isNarrow ? 0.90 : 1 - act5Breakout * 0.95),
        elapsed,
        0.85,
      )

      const cutOp4 = smoothstep(3.92, 4.16, clampedFp) * (1 - darkBlend)
      cutMeshes[4].visible = cutOp4 > 0.005
      if (cutMeshes[4].visible) {
        const p4 = clamp((clampedFp - 4.02) / 0.68, 0, 1)
        cutMeshes[4].scale.set(cutW, cutH, 1)
        cutMeshes[4].position.set(
          isNarrow
            ? (p4 - 0.5) * -0.14
            : plateW * 0.21 - (p4 - 0.5) * 0.22,
          (isNarrow ? 0.78 : plateH * 0.25 + (p4 - 0.5) * -0.06) + floatY(4) * 1.2 + tailRise * 0.08,
          STATION_Z[4] + 0.86,
        )
        cutMeshes[4].rotation.set(-mouseY * 0.038, mouseX * 0.056, 0)
        cutMats[4].uniforms.uTime.value = elapsed
        cutMats[4].uniforms.uMouse.value.set(mouseX, mouseY)
        cutMats[4].uniforms.uReveal.value = smoothstep(3.94, 4.20, clampedFp)
        cutMats[4].uniforms.uKenBurns.value = 1.0 + p4 * 0.04
        cutMats[4].uniforms.uOpacity.value = cutOp4
      }
      if (clampedFp >= 3.15) cutVideos[4].warm()
      cutVideos[4].setActive(clampedFp >= 3.90 && darkBlend < 0.9, clampedFp < 3.55)

      // Foreground Weather Planes: Act I Diagonal Ink Rain, Act II Chalk Mist, Act V God-Rays
      const rainOp = (1 - smoothstep(0.22, 0.88, clampedFp)) * 0.40 * (1 - darkBlend)
      rainMesh.visible = rainOp > 0.01
      if (rainMesh.visible) {
        const dzRain = 2.15
        const rH = 2 * dzRain * tanHalfCurrent * 1.15
        rainMesh.scale.set(rH * aspect, rH, 1)
        rainMesh.position.set(camera.position.x, camera.position.y, camZ - dzRain)
        rainMat.uniforms.uTime.value = elapsed
        rainMat.uniforms.uOpacity.value = rainOp
        rainMat.uniforms.uMouse.value.set(mouseX, mouseY)
      }

      const chalkOp =
        smoothstep(0.72, 1.12, clampedFp) * (1 - smoothstep(1.52, 1.90, clampedFp)) * (1 - darkBlend)
      chalkMesh.visible = chalkOp > 0.01
      if (chalkMesh.visible) {
        chalkMesh.scale.set(isNarrow ? 4.4 : 6.8, 1.9, 1)
        chalkMesh.position.set(0, -0.78, STATION_Z[1] + 1.08)
        chalkMat.uniforms.uTime.value = elapsed
        chalkMat.uniforms.uOpacity.value = chalkOp
      }

      const raysOp = smoothstep(3.45, 4.18, clampedFp) * 0.36 * (1 - darkBlend)
      godRaysMesh.visible = raysOp > 0.01
      if (godRaysMesh.visible) {
        const dzRay = 2.25
        const gH = 2 * dzRay * tanHalfCurrent * 1.16
        godRaysMesh.scale.set(gH * aspect, gH, 1)
        godRaysMesh.position.set(camera.position.x, camera.position.y, camZ - dzRay)
        godRaysMat.uniforms.uTime.value = elapsed
        godRaysMat.uniforms.uOpacity.value = raysOp
        godRaysMat.uniforms.uMouse.value.set(mouseX, mouseY)
      }

      // 420 Ambient Dust & Kinetic Ember Motes down the entire 76-unit gallery
      const emberRush = smoothstep(2.45, 3.35, clampedFp) * (1 - smoothstep(3.65, 4.15, clampedFp))
      const attr = dustGeo.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < dustCount; i++) {
        const bx = dustBase[i * 3]
        const by = dustBase[i * 3 + 1]
        const bz = dustBase[i * 3 + 2]
        const nx = bx + Math.sin(elapsed * 0.38 + i * 0.7) * 0.08 + mouseX * 0.05
        const ny = by + Math.cos(elapsed * 0.06 + i) * 0.08 + amberProgress * Math.sin(elapsed * 0.5 + i) * 0.04
        let nz = bz
        if (emberRush > 0.02) {
          nz = -76.0 + (((bz + 76.0 + elapsed * 3.8 * emberRush) % 82.0) + 82.0) % 82.0
        }
        attr.setXYZ(i, nx, ny, nz)
      }
      attr.needsUpdate = true
      dustMat.color.copy(dustBoneColor).lerp(dustAmberColor, amberProgress).lerp(dustGoldColor, daylightProgress)
      dustMat.size = 0.034 + emberRush * 0.010
      const bridgePeak = Math.max(b01, b12, b23, b34)
      dustMat.opacity = (0.38 + bridgePeak * 0.24 + emberRush * 0.14 + daylightProgress * 0.14) * (1 - darkBlend)

      const rush =
        clamp(bridgePeak * 0.76 + Math.min(1, Math.abs(scrollVel) * 0.075) * 0.45, 0, 1) *
        (1 - act5Breakout * 0.88)
      const bloomStrength = (amberProgress * 0.36 - daylightProgress * 0.14) * (1 - darkBlend)
      const letterbox = isNarrow ? 0 : (0.020 + bridgePeak * 0.042) * (1 - act5Breakout) * (1 - darkBlend)

      return { rush, bloomStrength, letterbox, daylight: daylightProgress }
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose())
    },
  }
}
