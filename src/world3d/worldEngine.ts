import * as THREE from 'three'
import { createInkFluidSim, type InkFluidSim } from './inkFluid'
import { createInkTextureBundle, type InkTextureBundle } from './inkTextures'
import { createCorridorJourneyWorld } from './scenes/corridorJourneyWorld'
import { createCinemaPostFxMaterial } from './spatialNovelShader'

export interface World3DSnapshot {
  curtain: number // 1 = ink curtain closed, 0 = opened
  appDim: number // 0..1 when scrolling into #blueprint calculator
  scrollVelocity: number
  filmProgress: number // 0..4.95 continuous scroll progress across 5 Acts
}

export interface World3DEngineHandle {
  dispose: () => void
}

const CURTAIN_VERT = /* glsl */ `
precision highp float;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const CURTAIN_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D tFluid;
uniform sampler2D tPaper;
uniform float uCurtain;
uniform float uTime;
uniform vec2 uResolution;

varying vec2 vUv;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * valueNoise(p);
    p *= 2.05;
    a *= 0.5;
  }
  return v;
}

void main() {
  if (uCurtain < 0.004) discard;

  vec2 sUv = gl_FragCoord.xy / max(vec2(1.0), uResolution);
  float aspect = uResolution.x / max(1.0, uResolution.y);
  float stepped = floor(uTime * 8.0) / 8.0;

  // Vertical 8 FPS sumi-ink curtain tear parting outward from center
  float tearNoise = fbm(sUv * vec2(aspect * 4.5, 6.0) + vec2(stepped * 0.4, 0.0));
  float centerDist = abs(sUv.x - 0.5) * 1.9 + tearNoise * 0.34;
  float openProgress = 1.0 - uCurtain;
  float tearMask = smoothstep(openProgress * 1.28 - 0.1, openProgress * 1.28 + 0.08, centerDist);
  float alpha = tearMask * smoothstep(0.0, 0.12, uCurtain) * 0.96;
  if (alpha < 0.01) discard;

  vec4 fluidSample = texture2D(tFluid, sUv);
  vec2 fluidVel = (fluidSample.rg - 0.5) * 2.0;
  float fluidInk = fluidSample.b;

  float paper = texture2D(tPaper, sUv * vec2(3.0, 2.0) + stepped * 0.04).r;
  float swirl = fbm(sUv * vec2(aspect * 5.0, 5.0) + fluidVel * 2.4 + vec2(stepped * 0.32, -stepped * 0.2));
  float wisp = smoothstep(0.06, 0.54, fluidInk) * smoothstep(0.28, 0.76, swirl);

  vec3 deepInk = vec3(0.045, 0.047, 0.055) + (paper - 0.5) * 0.025;
  vec3 wispColor = mix(vec3(0.45, 0.42, 0.38), vec3(0.851, 0.541, 0.235), smoothstep(0.2, 0.65, fluidInk));
  vec3 finalCol = deepInk + wispColor * wisp * 0.48;

  gl_FragColor = vec4(clamp(finalCol, 0.0, 1.0), alpha);
}
`

const DIM_VERT = /* glsl */ `
precision highp float;
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const DIM_FRAG = /* glsl */ `
precision highp float;
uniform float uDim;
void main() {
  if (uDim < 0.01) discard;
  gl_FragColor = vec4(0.047, 0.051, 0.059, clamp(uDim * 0.92, 0.0, 0.94));
}
`

export function createWorld3DEngine({
  host,
  getState,
  onReady,
  onContextLost,
}: {
  host: HTMLElement
  getState: () => World3DSnapshot
  onReady?: () => void
  onContextLost?: () => void
}): World3DEngineHandle {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2)

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(dpr)
  renderer.setClearColor(0x0c0d0f, 1)
  renderer.autoClear = false

  const canvas = renderer.domElement
  canvas.style.position = 'absolute'
  canvas.style.inset = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.display = 'block'
  canvas.style.pointerEvents = 'none'
  host.appendChild(canvas)

  const drawingBuf = new THREE.Vector2(1440, 900)
  const textures: InkTextureBundle = createInkTextureBundle()
  const fluidSim: InkFluidSim = createInkFluidSim(renderer, 128)

  // Continuous 5-Act 3D Perspective Corridor Road (Acts I -> II -> III -> IV -> V)
  const corridorWorld = createCorridorJourneyWorld(textures, fluidSim.getTexture(), drawingBuf)

  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const quadGeo = new THREE.PlaneGeometry(2, 2)

  // Single-pass Cinema Post-FX render target (Selective Amber Bloom + Kinetic Optics + Dynamic Letterbox)
  const sceneRT = new THREE.WebGLRenderTarget(1440, 900, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  })
  const postScene = new THREE.Scene()
  const postMat = createCinemaPostFxMaterial(textures)
  postMat.uniforms.tScene.value = sceneRT.texture
  postMat.uniforms.uResolution.value = drawingBuf
  postScene.add(new THREE.Mesh(quadGeo, postMat))

  // Prelude Ink Curtain tear pass
  const curtainScene = new THREE.Scene()
  const curtainMat = new THREE.ShaderMaterial({
    vertexShader: CURTAIN_VERT,
    fragmentShader: CURTAIN_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      tFluid: { value: fluidSim.getTexture() },
      tPaper: { value: textures.paper },
      uCurtain: { value: 1 },
      uTime: { value: 0 },
      uResolution: { value: drawingBuf },
    },
  })
  curtainScene.add(new THREE.Mesh(quadGeo, curtainMat))

  // App #blueprint focus dim pass
  const dimScene = new THREE.Scene()
  const dimMat = new THREE.ShaderMaterial({
    vertexShader: DIM_VERT,
    fragmentShader: DIM_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: { uDim: { value: 0 } },
  })
  dimScene.add(new THREE.Mesh(quadGeo, dimMat))

  let vw = Math.max(1, window.innerWidth)
  let vh = Math.max(1, window.innerHeight)

  const resize = () => {
    vw = Math.max(1, host.clientWidth || window.innerWidth)
    vh = Math.max(1, host.clientHeight || window.innerHeight)
    renderer.setSize(vw, vh, false)
    renderer.getDrawingBufferSize(drawingBuf)
    sceneRT.setSize(Math.max(2, drawingBuf.x), Math.max(2, drawingBuf.y))
  }

  resize()
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
  ro?.observe(host)
  window.addEventListener('resize', resize, { passive: true })

  let targetMouseX = 0
  let targetMouseY = 0
  let curMouseX = 0
  let curMouseY = 0
  const mouseUv = new THREE.Vector2(0.5, 0.5)
  const prevMouseUv = new THREE.Vector2(0.5, 0.5)
  const mouseDelta = new THREE.Vector2(0, 0)

  const onPointerMove = (e: PointerEvent) => {
    const nx = e.clientX / Math.max(1, window.innerWidth)
    const nyBottom = 1 - e.clientY / Math.max(1, window.innerHeight)
    mouseUv.set(nx, nyBottom)
    targetMouseX = nx * 2 - 1
    targetMouseY = nyBottom * 2 - 1
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true })

  let disposed = false
  const handleContextLost = (e: Event) => {
    e.preventDefault()
    onContextLost?.()
  }
  canvas.addEventListener('webglcontextlost', handleContextLost)

  const clock = new THREE.Clock()
  let rafId = 0
  let sentReady = false
  let texturesReady = false
  void corridorWorld.readyPromise
    .then(() => {
      texturesReady = true
    })
    .catch(() => {
      texturesReady = true
    })

  const animate = () => {
    if (disposed) return
    rafId = requestAnimationFrame(animate)

    const elapsed = clock.getElapsedTime()
    const snap = getState()
    const scrollVel = snap.scrollVelocity || 0
    const fp = snap.filmProgress ?? 0
    const isNarrow = vw < 760

    if (coarse || isNarrow) {
      targetMouseX = Math.sin(elapsed * 0.45) * 0.22
      targetMouseY = Math.cos(elapsed * 0.35) * 0.16
    }
    curMouseX += (targetMouseX - curMouseX) * 0.085
    curMouseY += (targetMouseY - curMouseY) * 0.085
    mouseDelta.subVectors(mouseUv, prevMouseUv)
    prevMouseUv.copy(mouseUv)

    fluidSim.update(renderer, mouseUv, mouseDelta, scrollVel, elapsed, 0)

    renderer.setRenderTarget(null)
    renderer.setViewport(0, 0, vw, vh)
    renderer.setClearColor(0x141413, 1)
    renderer.clear(true, true, true)

    curtainMat.uniforms.uTime.value = elapsed

    const aspect = vw / vh
    corridorWorld.camera.aspect = aspect
    corridorWorld.camera.updateProjectionMatrix()

    if (snap.appDim < 0.98) {
      const fx = corridorWorld.update({
        fp,
        elapsed,
        mouseX: curMouseX,
        mouseY: curMouseY,
        scrollVel,
        isNarrow,
        darkBlend: 0,
      })

      renderer.setRenderTarget(sceneRT)
      renderer.setClearColor(0x141413, 1)
      renderer.clear(true, true, true)
      renderer.render(corridorWorld.backdropScene, corridorWorld.orthoCam)
      renderer.clearDepth()
      renderer.render(corridorWorld.scene, corridorWorld.camera)

      renderer.setRenderTarget(null)
      renderer.setViewport(0, 0, vw, vh)
      postMat.uniforms.uTime.value = elapsed
      postMat.uniforms.uRush.value = fx.rush
      postMat.uniforms.uBloomStrength.value = fx.bloomStrength
      postMat.uniforms.uLetterbox.value = fx.letterbox
      postMat.uniforms.uDaylight.value = fx.daylight
      renderer.render(postScene, orthoCam)
    }

    if (snap.curtain > 0.004) {
      curtainMat.uniforms.uCurtain.value = snap.curtain
      renderer.render(curtainScene, orthoCam)
    }

    if (snap.appDim > 0.01) {
      dimMat.uniforms.uDim.value = snap.appDim
      renderer.render(dimScene, orthoCam)
    }

    if (!sentReady && texturesReady) {
      sentReady = true
      onReady?.()
    }
  }

  rafId = requestAnimationFrame(animate)

  return {
    dispose: () => {
      disposed = true
      cancelAnimationFrame(rafId)
      ro?.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('webglcontextlost', handleContextLost)

      corridorWorld.dispose()
      sceneRT.dispose()
      postMat.dispose()
      quadGeo.dispose()
      curtainMat.dispose()
      dimMat.dispose()
      fluidSim.dispose()
      textures.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
