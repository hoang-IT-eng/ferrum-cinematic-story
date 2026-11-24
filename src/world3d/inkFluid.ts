import * as THREE from 'three'

const FLUID_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`

const FLUID_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D tPrev;
uniform vec2 uTexel;
uniform vec2 uMouseUv;
uniform vec2 uMouseDelta;
uniform float uScrollVel;
uniform float uTime;
uniform float uFirstFrame;
uniform float uTransitionPulse;

varying vec2 vUv;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  if (uFirstFrame > 0.5) {
    gl_FragColor = vec4(0.5, 0.5, 0.0, 1.0);
    return;
  }

  vec4 cur = texture2D(tPrev, vUv);
  vec2 vel = (cur.rg - 0.5) * 2.0;

  vec2 advUv = clamp(vUv - vel * uTexel * 2.4, vec2(0.004), vec2(0.996));
  vec4 adv = texture2D(tPrev, advUv);
  vec4 nL = texture2D(tPrev, advUv - vec2(uTexel.x, 0.0));
  vec4 nR = texture2D(tPrev, advUv + vec2(uTexel.x, 0.0));
  vec4 nD = texture2D(tPrev, advUv - vec2(0.0, uTexel.y));
  vec4 nU = texture2D(tPrev, advUv + vec2(0.0, uTexel.y));

  vec4 blurred = mix(adv, (nL + nR + nD + nU) * 0.25, 0.34);
  vel = (blurred.rg - 0.5) * 2.0;
  float ink = blurred.b;

  float curl = sin(vUv.x * 11.0 + uTime * 0.9) * cos(vUv.y * 11.0 - uTime * 0.7);
  vel += vec2(-curl, curl) * 0.008;

  vel *= 0.915;
  ink *= 0.935;

  vec2 diff = vUv - uMouseUv;
  float dist2 = dot(diff, diff);
  float splat = exp(-dist2 / 0.0028);
  float speed = clamp(length(uMouseDelta) * 28.0, 0.0, 1.4);
  float activeMove = smoothstep(0.015, 0.14, speed);

  vel += uMouseDelta * 20.0 * splat * activeMove;
  ink += splat * speed * 0.58;

  float marginWeight = smoothstep(0.18, 0.48, abs(vUv.x - 0.5));
  float scrollForce = clamp(uScrollVel * 0.035, -0.35, 0.35);
  float n = hash12(vUv * 40.0 + uTime * 0.2);
  vel.y -= scrollForce * marginWeight * (0.35 + n * 0.45);
  ink += abs(scrollForce) * marginWeight * 0.08 * n;

  // Fluid Ink Wash Wipe surge during Act transitions across full canvas
  if (uTransitionPulse > 0.01) {
    float waveX = sin(vUv.y * 8.0 + uTime * 2.2) * cos(vUv.x * 6.0 - uTime * 1.4);
    float waveY = cos(vUv.x * 9.0 - uTime * 1.9);
    vel += vec2(waveX, waveY) * 0.14 * uTransitionPulse;
    ink += (0.28 + n * 0.45) * uTransitionPulse;
  }

  vec2 encodedVel = clamp(vel, -1.0, 1.0) * 0.5 + 0.5;
  gl_FragColor = vec4(encodedVel, clamp(ink, 0.0, 1.0), 1.0);
}
`

export interface InkFluidSim {
  update: (
    renderer: THREE.WebGLRenderer,
    mouseUv: THREE.Vector2,
    mouseDelta: THREE.Vector2,
    scrollVel: number,
    time: number,
    transitionPulse?: number,
  ) => void
  getTexture: () => THREE.Texture
  dispose: () => void
}

export function createInkFluidSim(renderer: THREE.WebGLRenderer, size = 128): InkFluidSim {
  const gl = renderer.getContext()
  const hasHalfFloatRender =
    (renderer.capabilities.isWebGL2 &&
      Boolean(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) ||
    Boolean(gl.getExtension('EXT_color_buffer_half_float'))

  const targetType = hasHalfFloatRender ? THREE.HalfFloatType : THREE.UnsignedByteType

  const makeTarget = () =>
    new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: targetType,
      depthBuffer: false,
      stencilBuffer: false,
    })

  let readTarget = makeTarget()
  let writeTarget = makeTarget()

  const simScene = new THREE.Scene()
  const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const simGeo = new THREE.PlaneGeometry(2, 2)
  const simMat = new THREE.ShaderMaterial({
    vertexShader: FLUID_VERT,
    fragmentShader: FLUID_FRAG,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      tPrev: { value: readTarget.texture },
      uTexel: { value: new THREE.Vector2(1 / size, 1 / size) },
      uMouseUv: { value: new THREE.Vector2(0.5, 0.5) },
      uMouseDelta: { value: new THREE.Vector2(0, 0) },
      uScrollVel: { value: 0 },
      uTime: { value: 0 },
      uFirstFrame: { value: 1 },
      uTransitionPulse: { value: 0 },
    },
  })
  simScene.add(new THREE.Mesh(simGeo, simMat))

  let firstFrame = true

  return {
    update: (r, mouseUv, mouseDelta, scrollVel, time, transitionPulse = 0) => {
      simMat.uniforms.tPrev.value = readTarget.texture
      simMat.uniforms.uMouseUv.value.copy(mouseUv)
      simMat.uniforms.uMouseDelta.value.copy(mouseDelta)
      simMat.uniforms.uScrollVel.value = scrollVel
      simMat.uniforms.uTime.value = time
      simMat.uniforms.uFirstFrame.value = firstFrame ? 1 : 0
      simMat.uniforms.uTransitionPulse.value = transitionPulse
      firstFrame = false

      const prevTarget = r.getRenderTarget()
      r.setRenderTarget(writeTarget)
      r.render(simScene, simCamera)
      r.setRenderTarget(prevTarget)

      const tmp = readTarget
      readTarget = writeTarget
      writeTarget = tmp
    },
    getTexture: () => readTarget.texture,
    dispose: () => {
      simGeo.dispose()
      simMat.dispose()
      readTarget.dispose()
      writeTarget.dispose()
    },
  }
}
