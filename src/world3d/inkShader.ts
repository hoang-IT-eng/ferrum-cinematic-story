import * as THREE from 'three'
import type { InkTextureBundle } from './inkTextures'

export type InkToneRole = 'parchment' | 'skin' | 'charcoal' | 'amber' | 'concrete' | 'steel'

export interface SharedInkUniforms {
  uTime: { value: number }
  uResolution: { value: THREE.Vector2 }
  uClipRect: { value: THREE.Vector4 } // (leftN, rightN, bottomN, topN) in 0..1 bottom-up GL coords
  uLightDir: { value: THREE.Vector3 }
  uColorScan: { value: number } // 0..1 warm molten amber sweep across Act III+
  uScanY: { value: number }
}

export function createSharedInkUniforms(): SharedInkUniforms {
  return {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1440, 900) },
    uClipRect: { value: new THREE.Vector4(0.05, 0.95, 0.25, 0.92) },
    uLightDir: { value: new THREE.Vector3(0.45, 0.72, 0.65) },
    uColorScan: { value: 0 },
    uScanY: { value: -2.0 },
  }
}

const ROLE_PALETTES: Record<
  InkToneRole,
  { lit: number; mid: number; shadow: number; rim: number }
> = {
  parchment: { lit: 0xf4efe4, mid: 0xbcb4a5, shadow: 0x16171b, rim: 0xfaf5eb },
  skin: { lit: 0xefe7da, mid: 0xc2b6a4, shadow: 0x1c1b20, rim: 0xf7e7cf },
  charcoal: { lit: 0x696b73, mid: 0x2c2e35, shadow: 0x0e0f13, rim: 0xf4efe4 },
  amber: { lit: 0xf6b973, mid: 0xd98a3c, shadow: 0x26180d, rim: 0xffdfad },
  concrete: { lit: 0xa6a197, mid: 0x5c5a56, shadow: 0x131418, rim: 0xd8d1c2 },
  steel: { lit: 0xc8c3b8, mid: 0x6b6a6c, shadow: 0x121318, rim: 0xf4efe4 },
}

const CLIP_HELPER_GLSL = /* glsl */ `
float panelClipDiscard(vec2 fragCoord, vec2 res, vec4 clipRect, float timeVal, float popOut) {
  vec2 sUv = fragCoord / max(vec2(1.0), res);
  float stepped = floor(timeVal * 8.0) / 8.0;
  float edgeJitter = sin(sUv.y * 55.0 + stepped * 17.0) * 0.0018 + cos(sUv.x * 48.0 - stepped * 13.0) * 0.0014;
  // Pop-out characters/props may protrude freely left, right, and top,
  // while keeping the bottom edge strictly crisp above the narrative gutter plaque.
  if (sUv.y < clipRect.z + edgeJitter) {
    return 1.0;
  }
  if (popOut > 0.5) {
    return 0.0;
  }
  if (
    sUv.x < clipRect.x + edgeJitter ||
    sUv.x > clipRect.y + edgeJitter ||
    sUv.y > clipRect.w + edgeJitter
  ) {
    return 1.0;
  }
  return 0.0;
}
`

export function createInkMaterial({
  role,
  textures,
  shared,
  popOut = false,
  skinned = false,
  hatchScale = 1.6,
  amberTint = 0,
}: {
  role: InkToneRole
  textures: InkTextureBundle
  shared: SharedInkUniforms
  popOut?: boolean
  skinned?: boolean
  hatchScale?: number
  amberTint?: number
}): THREE.ShaderMaterial {
  const pal = ROLE_PALETTES[role]

  const vert = /* glsl */ `
    ${skinned ? '#include <skinning_pars_vertex>' : ''}
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vObjPos;
    varying vec3 vViewDir;

    void main() {
      vUv = uv;
      vObjPos = position;

      vec3 objectNormal = vec3(normal);
      ${skinned ? '#include <skinbase_vertex>' : ''}
      ${skinned ? '#include <skinnormal_vertex>' : ''}
      vNormal = normalize(normalMatrix * objectNormal);

      vec3 transformed = vec3(position);
      ${skinned ? '#include <skinning_vertex>' : ''}

      vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
      vWorldPos = worldPosition.xyz;
      vec4 mvPos = viewMatrix * worldPosition;
      vViewDir = -mvPos.xyz;
      gl_Position = projectionMatrix * mvPos;
    }
  `

  const frag = /* glsl */ `
    precision highp float;

    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec4 uClipRect;
    uniform float uPopOut;
    uniform vec3 uLightDir;
    uniform float uColorScan;
    uniform float uScanY;

    uniform sampler2D tHatch;
    uniform sampler2D tPaper;
    uniform float uHatchScale;
    uniform float uOpacity;
    uniform float uAmberTint;

    uniform vec3 uLitColor;
    uniform vec3 uMidColor;
    uniform vec3 uShadowColor;
    uniform vec3 uRimColor;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vObjPos;
    varying vec3 vViewDir;

    ${CLIP_HELPER_GLSL}

    void main() {
      if (uOpacity < 0.01) discard;
      if (panelClipDiscard(gl_FragCoord.xy, uResolution, uClipRect, uTime, uPopOut) > 0.5) {
        discard;
      }

      float stepped = floor(uTime * 8.0) / 8.0;
      vec3 n = normalize(vNormal);
      vec3 v = normalize(vViewDir);
      vec3 l = normalize(uLightDir);

      // Triplanar-friendly object-space ink hatch UVs stepped subtly at 8 FPS
      vec2 hatchUv = vec2(vObjPos.x * 0.72 + vObjPos.z * 0.68, vObjPos.y * 0.95) * uHatchScale;
      hatchUv += vec2(stepped * 0.037, -stepped * 0.023);
      float hatch = texture2D(tHatch, hatchUv).r;

      vec2 paperUv = vObjPos.xy * 1.9 + vec2(stepped * 0.11, stepped * 0.07);
      float stipple = texture2D(tPaper, paperUv).r;

      float ndotl = dot(n, l);
      float tone = ndotl * 0.5 + 0.5;

      // 3 discrete woodcut tonal bands modulated by real canvas pen strokes
      float lightStep = smoothstep(0.47, 0.64, tone + (hatch - 0.5) * 0.28 + (stipple - 0.5) * 0.12);
      float shadowStep = smoothstep(0.24, 0.44, tone + (hatch - 0.5) * 0.34);

      vec3 col = mix(uShadowColor, uMidColor, shadowStep);
      col = mix(col, uLitColor, lightStep);

      // Ink stipple break-up inside brightest specular zones
      if (tone > 0.84 && stipple < 0.12) {
        col = mix(col, uMidColor, 0.32);
      }

      // Crisp silhouette rim stroke separating dark forms cleanly over dark backgrounds
      float fresnel = pow(1.0 - max(0.0, dot(n, v)), 2.3);
      float rimMask = smoothstep(0.38, 0.65, fresnel + (1.0 - hatch) * 0.08);
      col = mix(col, uRimColor, rimMask * 0.72);

      // Warm golden breakthrough scan wave (Act III awakening & power highlight)
      float scanFactor = clamp(uColorScan, 0.0, 1.0);
      float wave = smoothstep(uScanY + 0.35, uScanY - 0.45, vWorldPos.y);
      float emberMix = max(uAmberTint, scanFactor * wave * 0.68);
      vec3 amberTint = vec3(0.92, 0.62, 0.28);
      col = mix(col, col * amberTint * 1.18 + amberTint * (lightStep * 0.16 + rimMask * 0.22), emberMix);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), uOpacity);
    }
  `

  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    uniforms: {
      uTime: shared.uTime,
      uResolution: shared.uResolution,
      uClipRect: shared.uClipRect,
      uLightDir: shared.uLightDir,
      uColorScan: shared.uColorScan,
      uScanY: shared.uScanY,
      uPopOut: { value: popOut ? 1 : 0 },
      tHatch: { value: textures.hatch },
      tPaper: { value: textures.paper },
      uHatchScale: { value: hatchScale },
      uOpacity: { value: 1 },
      uAmberTint: { value: amberTint },
      uLitColor: { value: new THREE.Color(pal.lit) },
      uMidColor: { value: new THREE.Color(pal.mid) },
      uShadowColor: { value: new THREE.Color(pal.shadow) },
      uRimColor: { value: new THREE.Color(pal.rim) },
    },
  })
}

export function createInkOutlineMaterial({
  shared,
  popOut = false,
  skinned = false,
  thickness = 0.018,
  colorHex = 0x090a0d,
}: {
  shared: SharedInkUniforms
  popOut?: boolean
  skinned?: boolean
  thickness?: number
  colorHex?: number
}): THREE.ShaderMaterial {
  const vert = /* glsl */ `
    ${skinned ? '#include <skinning_pars_vertex>' : ''}
    uniform float uThickness;
    uniform float uTime;

    void main() {
      vec3 objectNormal = vec3(normal);
      ${skinned ? '#include <skinbase_vertex>' : ''}
      ${skinned ? '#include <skinnormal_vertex>' : ''}

      vec3 transformed = vec3(position);
      ${skinned ? '#include <skinning_vertex>' : ''}

      float stepped = floor(uTime * 8.0) / 8.0;
      float jitter = 1.0 + sin(position.y * 19.0 + stepped * 11.0) * 0.08;

      vec4 mvPos = modelViewMatrix * vec4(transformed, 1.0);
      vec4 projPos = projectionMatrix * mvPos;
      vec3 viewNorm = normalize(normalMatrix * objectNormal);
      vec2 clipNorm = (projectionMatrix * vec4(viewNorm, 0.0)).xy;
      projPos.xy += clipNorm * uThickness * jitter * max(0.88, projPos.w * 0.25);
      gl_Position = projPos;
    }
  `

  const frag = /* glsl */ `
    precision highp float;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec4 uClipRect;
    uniform float uPopOut;
    uniform float uOpacity;
    uniform vec3 uColor;

    ${CLIP_HELPER_GLSL}

    void main() {
      if (uOpacity < 0.01) discard;
      if (panelClipDiscard(gl_FragCoord.xy, uResolution, uClipRect, uTime, uPopOut) > 0.5) {
        discard;
      }
      gl_FragColor = vec4(uColor, uOpacity);
    }
  `

  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    uniforms: {
      uTime: shared.uTime,
      uResolution: shared.uResolution,
      uClipRect: shared.uClipRect,
      uPopOut: { value: popOut ? 1 : 0 },
      uThickness: { value: thickness },
      uOpacity: { value: 1 },
      uColor: { value: new THREE.Color(colorHex) },
    },
  })
}

export function createVolumetricBeamMaterial(
  textures: InkTextureBundle,
  shared: SharedInkUniforms,
): THREE.ShaderMaterial {
  const vert = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      vViewDir = -mvPos.xyz;
      gl_Position = projectionMatrix * mvPos;
    }
  `

  const frag = /* glsl */ `
    precision highp float;

    uniform float uTime;
    uniform float uIntensity;
    uniform sampler2D tHatch;
    uniform sampler2D tPaper;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      if (uIntensity < 0.01) discard;

      float stepped = floor(uTime * 8.0) / 8.0;
      vec3 n = normalize(vNormal);
      vec3 v = normalize(vViewDir);
      float radialFade = pow(max(0.0, abs(dot(n, v))), 1.9);

      float hatch = texture2D(tHatch, vec2(vUv.x * 3.0, vUv.y * 2.5 - stepped * 0.45)).r;
      float noise = texture2D(tPaper, vec2(vUv.x * 2.0 + stepped * 0.12, vUv.y * 1.5 - uTime * 0.25)).r;

      float vertFade = smoothstep(0.0, 0.14, vUv.y) * pow(max(0.0, 1.0 - vUv.y), 2.2);
      float streak = smoothstep(0.22, 0.78, hatch * 0.55 + noise * 0.45);

      float alpha = radialFade * vertFade * (0.28 + streak * 0.72) * uIntensity;
      if (alpha < 0.01) discard;

      vec3 coreGold = vec3(1.0, 0.84, 0.54);
      vec3 deepAmber = vec3(0.85, 0.51, 0.19);
      vec3 col = mix(deepAmber, coreGold, radialFade * 0.8 + streak * 0.2);

      gl_FragColor = vec4(col * alpha, alpha);
    }
  `

  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: shared.uTime,
      uIntensity: { value: 1 },
      tHatch: { value: textures.hatch },
      tPaper: { value: textures.paper },
    },
  })
}

export function createPanelBackdropMaterial(
  textures: InkTextureBundle,
  fluidTex: THREE.Texture,
): THREE.ShaderMaterial {
  const vert = /* glsl */ `
    void main() {
      gl_Position = vec4(position.xy, 0.999, 1.0);
    }
  `

  const frag = /* glsl */ `
    precision highp float;

    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec4 uClipRect;
    uniform float uActIndex;
    uniform float uWarmth;
    uniform sampler2D tHatch;
    uniform sampler2D tPaper;
    uniform sampler2D tFluid;

    void main() {
      vec2 screenUv = gl_FragCoord.xy / max(vec2(1.0), uResolution);
      vec2 sizeN = max(vec2(0.001), uClipRect.yw - uClipRect.xz);
      vec2 pUv = (screenUv - uClipRect.xz) / sizeN;

      float stepped = floor(uTime * 8.0) / 8.0;
      float fluidInk = texture2D(tFluid, screenUv).b;
      float paper = texture2D(tPaper, screenUv * vec2(2.6, 1.8) + stepped * 0.05).r;

      float jitter = (paper - 0.5) * (0.0045 + fluidInk * 0.014);
      float dx = min(pUv.x, 1.0 - pUv.x) + jitter;
      float dy = min(pUv.y, 1.0 - pUv.y) + jitter * (sizeN.x / sizeN.y);
      float edgeDist = min(dx, dy);

      // Outside comic panel -> discard cleanly to show stark #101114 gutter
      if (edgeDist < -0.008) discard;

      // Crisp 8 FPS hand-inked border stroke frame
      if (edgeDist < 0.0045) {
        vec3 baseStroke = vec3(0.84, 0.80, 0.73);
        vec3 amberStroke = vec3(0.92, 0.62, 0.28);
        vec3 strokeCol = mix(baseStroke, amberStroke, clamp(uWarmth, 0.0, 1.0));
        gl_FragColor = vec4(strokeCol, 0.86);
        return;
      }

      // Stylized illustrated comic panel backdrop per Act (0..4)
      vec3 bg = vec3(0.08, 0.084, 0.098);
      float hatch = texture2D(tHatch, pUv * vec2(3.2, 2.2) + vec2(stepped * 0.03, 0.0)).r;

      if (uActIndex < 0.5) {
        // Act I: Oppressive parchment storm darkening toward margins
        float radial = smoothstep(0.82, 0.05, length(pUv - vec2(0.5, 0.58)));
        float swirl = sin(pUv.x * 9.0 + cos(pUv.y * 7.0 + stepped)) * 0.5 + 0.5;
        vec3 stormLight = vec3(0.87, 0.83, 0.75);
        vec3 stormDark = vec3(0.11, 0.115, 0.13);
        bg = mix(stormDark, stormLight, radial * (0.72 + hatch * 0.22 + swirl * 0.06));
      } else if (uActIndex < 1.5) {
        // Act II: Dark concrete underground gym lit by overhead harsh lamp
        float lamp = smoothstep(0.92, 0.08, length(pUv - vec2(0.5, 0.84)));
        bg = mix(vec3(0.06, 0.065, 0.075), vec3(0.32, 0.30, 0.28), lamp * (0.65 + hatch * 0.3));
      } else if (uActIndex < 2.5) {
        // Act III: Midnight sumi with rising molten amber beacon glow
        float beacon = smoothstep(0.88, 0.04, length((pUv - vec2(0.5, 0.38)) * vec2(1.0, 0.72)));
        vec3 darkBed = vec3(0.055, 0.058, 0.068);
        vec3 amberCore = vec3(0.62, 0.38, 0.14);
        bg = mix(darkBed, amberCore, beacon * (0.68 + hatch * 0.2));
      } else if (uActIndex < 3.5) {
        // Act IV: High-contrast speedlines bursting from lifted barbell
        vec2 rel = pUv - vec2(0.5, 0.48);
        float angle = atan(rel.y, rel.x);
        float speedRay = smoothstep(0.25, 0.92, sin(angle * 34.0 + stepped * 4.0) * 0.5 + 0.5);
        float centerDist = length(rel);
        vec3 spark = mix(vec3(0.12, 0.12, 0.14), vec3(0.46, 0.31, 0.16), speedRay * smoothstep(0.15, 0.75, centerDist));
        bg = mix(spark, vec3(0.06, 0.062, 0.075), smoothstep(0.95, 0.3, centerDist) * 0.35);
      } else {
        // Act V: Radiant morning parchment daylight & delicate sky sunrays
        float sunTop = smoothstep(0.05, 0.95, pUv.y);
        float ray = sin((pUv.x - 0.5) * 16.0 - stepped * 0.5) * 0.5 + 0.5;
        vec3 horizon = vec3(0.76, 0.71, 0.61);
        vec3 sunSky = vec3(0.96, 0.92, 0.83);
        bg = mix(horizon, sunSky, sunTop * (0.76 + ray * 0.18));
        bg *= 0.92 + hatch * 0.08;
      }

      bg += (paper - 0.5) * 0.04;
      float vig = smoothstep(0.98, 0.25, length(pUv - 0.5));
      bg *= mix(0.76, 1.04, vig);

      gl_FragColor = vec4(clamp(bg, 0.0, 1.0), 1.0);
    }
  `

  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1440, 900) },
      uClipRect: { value: new THREE.Vector4(0, 1, 0, 1) },
      uActIndex: { value: 0 },
      uWarmth: { value: 0 },
      tHatch: { value: textures.hatch },
      tPaper: { value: textures.paper },
      tFluid: { value: fluidTex },
    },
  })
}
