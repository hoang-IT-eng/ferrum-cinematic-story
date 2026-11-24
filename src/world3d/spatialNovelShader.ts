import * as THREE from 'three'
import type { InkTextureBundle } from './inkTextures'

const UNIFY_INK_GRADE_GLSL = /* glsl */ `
  vec3 unifyInkGrade(vec3 src, float amberPreserve) {
    float luma = clamp(dot(src, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    float graded = smoothstep(0.020, 0.955, luma);
    if (amberPreserve > 0.05) {
      graded = pow(clamp(graded * 1.15 + 0.018, 0.0, 1.0), 0.84);
    }
    vec3 darkInk = vec3(0.058, 0.054, 0.049);       // smoked sumi shadow
    vec3 midTone = vec3(0.435, 0.405, 0.360);       // warm charcoal midtone
    vec3 boneHighlight = vec3(0.925, 0.890, 0.820); // archival bone ivory highlight
    vec3 duo = graded < 0.48
      ? mix(darkInk, midTone, smoothstep(0.0, 0.48, graded))
      : mix(midTone, boneHighlight, smoothstep(0.48, 1.0, graded));
    vec3 baseGraded = mix(src, duo, 0.80);

    if (amberPreserve <= 0.005) return baseGraded;
    float warmth = clamp((src.r - src.b) * 1.85 + max(0.0, src.g - src.b) * 0.55, 0.0, 1.0);
    float amberMask = smoothstep(0.12, 0.60, warmth) * smoothstep(0.08, 0.46, luma);
    vec3 enriched = vec3(min(1.0, src.r * 1.15), min(1.0, src.g * 1.06), src.b * 0.76);
    return mix(baseGraded, enriched, clamp(amberMask * amberPreserve * 0.90, 0.0, 0.92));
  }
`

/**
 * Fullscreen Smoked Archival Charcoal-Ink Backdrop evolving continuously across Acts I-V:
 * rainy slate-ink (#141413) -> soot (#191714) -> amber pulse (#1A1510) -> ember (#1C140E) -> sunlit cathedral (#2B231A).
 */
export function createArchivalPaperBackdropMaterial(
  textures: InkTextureBundle,
  fluidTex: THREE.Texture,
): THREE.ShaderMaterial {
  const vert = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `

  const frag = /* glsl */ `
    precision highp float;

    uniform sampler2D tPaper;
    uniform sampler2D tHatch;
    uniform sampler2D tFluid;
    uniform vec2 uResolution;
    uniform float uActProgress; // 0..4 across Acts I-V
    uniform float uDarkBlend;   // smooth dim blend if focusing CTA

    varying vec2 vUv;

    void main() {
      vec2 sUv = gl_FragCoord.xy / max(vec2(1.0), uResolution);
      float paper = texture2D(tPaper, sUv * vec2(3.2, 2.0)).r;
      float hatch = texture2D(tHatch, sUv * vec2(4.0, 2.5)).r;

      float p = clamp(uActProgress, 0.0, 4.0);
      vec3 s0 = vec3(0.078, 0.078, 0.074); // #141413 rainy slate ink
      vec3 s1 = vec3(0.098, 0.090, 0.078); // #191714 heavy iron soot
      vec3 s2 = vec3(0.102, 0.082, 0.062); // #1A1510 obsidian + amber pulse
      vec3 s3 = vec3(0.110, 0.078, 0.055); // #1C140E forged charcoal + ember
      vec3 s4 = vec3(0.170, 0.138, 0.102); // #2B231A warm sunlit cathedral

      vec3 col = s0;
      if (p < 1.0) {
        col = mix(s0, s1, smoothstep(0.0, 1.0, p));
      } else if (p < 2.0) {
        col = mix(s1, s2, smoothstep(0.0, 1.0, p - 1.0));
      } else if (p < 3.0) {
        col = mix(s2, s3, smoothstep(0.0, 1.0, p - 2.0));
      } else {
        col = mix(s3, s4, smoothstep(0.0, 1.0, p - 3.0));
      }

      float amberRatio = smoothstep(1.5, 2.35, p);
      float daylightRatio = smoothstep(3.15, 4.0, p);

      // Gentle studio light pool evolving from warm bone to molten amber to sunlit zenith
      float centerGlow = 1.0 - smoothstep(0.0, 0.86, length((sUv - vec2(0.5, 0.54)) * vec2(0.92, 1.16)));
      vec3 poolTint = mix(vec3(0.055, 0.050, 0.043), vec3(0.115, 0.074, 0.036), amberRatio);
      poolTint = mix(poolTint, vec3(0.145, 0.110, 0.068), daylightRatio);
      col += poolTint * centerGlow;

      // Radiant cathedral sky zenith glow illuminating upper frame in Act V
      float zenithGrad = smoothstep(0.25, 1.0, sUv.y) * daylightRatio;
      col += vec3(0.145, 0.108, 0.062) * zenithGrad;

      col += (paper - 0.5) * 0.024 + (hatch - 0.5) * 0.010;

      // Subtle outer charcoal vignette
      float edgeRad = length((sUv - 0.5) * vec2(1.0, 1.08));
      col *= mix(1.04, mix(0.72, 0.82, daylightRatio), smoothstep(0.38, 0.94, edgeRad));

      // Ink wash reacting smoothly to cursor movement (bone-ash -> molten amber)
      float fluidInk = texture2D(tFluid, sUv).b;
      float washAmt = smoothstep(0.05, 0.65, fluidInk) * 0.34;
      vec3 washTint = mix(vec3(0.32, 0.295, 0.255), vec3(0.54, 0.36, 0.18), smoothstep(1.5, 2.3, p));
      col = mix(col, washTint, washAmt);

      if (uDarkBlend > 0.002) {
        vec3 obsidian = vec3(0.047, 0.051, 0.059) + (paper - 0.5) * 0.015;
        col = mix(col, obsidian, smoothstep(0.0, 1.0, uDarkBlend));
      }

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `

  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      tPaper: { value: textures.paper },
      tHatch: { value: textures.hatch },
      tFluid: { value: fluidTex },
      uResolution: { value: new THREE.Vector2(1440, 900) },
      uActProgress: { value: 0 },
      uDarkBlend: { value: 0 },
    },
  })
}

/**
 * Wide Santioni-scale unified artwork plate with cohesive duotone grading LUT,
 * living 6 FPS bone-ivory outer stroke + editorial L-brackets, slow Ken Burns pan/zoom,
 * silky 0.014 depth-map parallax, and organic wet-ink reveal/dissolve.
 */
export function createUnifiedPlateMaterial({
  colorMap,
  depthMap,
  textures,
  parallaxStrength = 0.010,
  focusDepth = 0.48,
  amberAccent = 0,
  actIndex = 0,
}: {
  colorMap: THREE.Texture
  depthMap: THREE.Texture
  textures: InkTextureBundle
  parallaxStrength?: number
  focusDepth?: number
  amberAccent?: number
  actIndex?: number
}): THREE.ShaderMaterial {
  const vert = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `

  const frag = /* glsl */ `
    precision highp float;

    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform sampler2D tPaper;

    uniform float uTime;
    uniform vec2 uMouse;
    uniform float uParallaxStrength;
    uniform float uFocusDepth;
    uniform float uOpacity;
    uniform float uReveal;
    uniform float uZoom;
    uniform vec2 uPan;
    uniform float uDepthVeil;
    uniform vec3 uVeilTint;
    uniform float uAmberAccent;
    uniform float uFullBleed;
    uniform float uActIndex;
    uniform float uLiving;

    varying vec2 vUv;

    ${UNIFY_INK_GRADE_GLSL}

    void main() {
      if (uOpacity < 0.008 || uReveal < 0.008) discard;

      float fb = clamp(uFullBleed, 0.0, 1.0);
      float frameVis = 1.0 - smoothstep(0.0, 0.85, fb);
      float padX = mix(0.022, 0.0, fb);
      float padY = mix(0.032, 0.0, fb);
      vec2 innerUv = vec2(
        (vUv.x - padX) / max(0.001, 1.0 - 2.0 * padX),
        (vUv.y - padY) / max(0.001, 1.0 - 2.0 * padY)
      );

      float stepT = floor(uTime * 6.0) / 6.0;
      float paper = texture2D(tPaper, vUv * vec2(2.4, 1.5)).r;
      float organicWave =
        (sin(vUv.x * 28.0 + vUv.y * 17.0) * 0.00065 +
         sin(vUv.y * 23.0 - vUv.x * 13.0) * 0.00050 +
         (sin(vUv.x * 38.0 + stepT * 5.0) * 0.00038 + cos(vUv.y * 30.0 - stepT * 4.0) * 0.00032)) * frameVis;

      // Organic wet-ink edge unfold / fly-past dissolve mask
      float wash = innerUv.x * 0.56 + (1.0 - innerUv.y) * 0.44 + (paper - 0.5) * 0.22;
      float revealAlpha = uReveal >= 0.995
        ? 1.0
        : smoothstep(wash - 0.24, wash + 0.18, uReveal * 1.38 - 0.12);
      float frameAlpha = revealAlpha * uOpacity;
      if (frameAlpha < 0.008) discard;

      float dx = min(innerUv.x, 1.0 - innerUv.x) + organicWave;
      float dy = min(innerUv.y, 1.0 - innerUv.y) + organicWave * 1.45;
      float dist = min(dx, dy);

      if (frameVis > 0.01) {
        // Editorial corner crop L-brackets in outer margin pad
        float cDistX = min(abs(innerUv.x + 0.008), abs(innerUv.x - 1.008));
        float cDistY = min(abs(innerUv.y + 0.011), abs(innerUv.y - 1.011));
        float spanX = min(innerUv.x + 0.008, 1.008 - innerUv.x);
        float spanY = min(innerUv.y + 0.011, 1.011 - innerUv.y);
        float arm = mix(0.022, 0.056, smoothstep(0.1, 0.9, uReveal));
        float legH = (1.0 - smoothstep(0.0012, 0.0026, cDistY)) * step(0.0, spanX) * (1.0 - smoothstep(arm - 0.006, arm, spanX));
        float legV = (1.0 - smoothstep(0.0009, 0.0020, cDistX)) * step(0.0, spanY) * (1.0 - smoothstep(arm * 1.45 - 0.006, arm * 1.45, spanY));
        float bracket = clamp(max(legH, legV), 0.0, 1.0) * smoothstep(0.12, 0.55, uReveal) * 0.72 * frameAlpha * frameVis;

        vec3 boneAccent = mix(vec3(0.84, 0.79, 0.71), vec3(0.93, 0.66, 0.36), clamp(uAmberAccent * 0.58, 0.0, 0.58));

        // Soft dark velvet drop shadow cast behind wide gallery frame
        if (dist < -0.0028) {
          vec2 shUv = innerUv - vec2(0.010, -0.014);
          float sdx = min(shUv.x, 1.0 - shUv.x);
          float sdy = min(shUv.y, 1.0 - shUv.y);
          float sDist = min(sdx, sdy);
          float shAlpha = 0.0;
          if (sDist > -0.032 && sDist < 0.02) {
            float fall = clamp(-sDist / 0.032, 0.0, 1.0);
            shAlpha = pow(1.0 - fall, 2.2) * 0.48 * frameAlpha * frameVis;
          }
          vec3 bgMix = mix(vec3(0.02, 0.018, 0.016), boneAccent, bracket);
          float outAlpha = clamp(max(shAlpha, bracket), 0.0, 1.0);
          if (outAlpha < 0.006) discard;
          gl_FragColor = vec4(bgMix, outAlpha);
          return;
        }

        // Outer carbon outline + crisp warm bone-ivory / antique-amber archival border rule
        if (dist < 0.0) {
          float inkAA = smoothstep(-0.0028, -0.0014, dist);
          vec3 rim = mix(vec3(0.035, 0.032, 0.028), uVeilTint, clamp(uDepthVeil * 0.75, 0.0, 0.65));
          gl_FragColor = vec4(rim, mix(0.45, 0.98, inkAA) * frameAlpha * frameVis);
          return;
        }
        if (dist < 0.0048 * frameVis) {
          vec3 boneRule = boneAccent + (paper - 0.5) * 0.025;
          vec3 veiledRule = mix(boneRule, uVeilTint, clamp(uDepthVeil * 0.80, 0.0, 0.70));
          gl_FragColor = vec4(veiledRule, 0.94 * frameAlpha);
          return;
        }
      }

      // Artwork interior: slow 2-4% Ken Burns dolly + pan + silky 0.010 depth-map relief + duotone grading
      float trim = 0.004 * frameVis;
      vec2 artUv = clamp((innerUv - trim) / max(0.001, 1.0 - 2.0 * trim), 0.0, 1.0);
      float effZoom = max(1.02, uZoom);
      vec2 baseUv = (artUv - 0.5) / effZoom + 0.5 + uPan;
      baseUv = clamp(baseUv, 0.004, 0.996);

      float edgeDamp =
        smoothstep(0.0, 0.14, baseUv.x) *
        smoothstep(1.0, 0.86, baseUv.x) *
        smoothstep(0.0, 0.14, baseUv.y) *
        smoothstep(1.0, 0.86, baseUv.y);

      vec2 viewRay = uMouse * uParallaxStrength * edgeDamp;
      vec2 pUv = baseUv;
      for (int i = 0; i < 4; i++) {
        float d = texture2D(tDepth, clamp(pUv, 0.003, 0.997)).r;
        float rel = d - uFocusDepth;
        pUv = baseUv - viewRay * rel * (0.25 * float(i + 1));
      }
      pUv = clamp(pUv, 0.003, 0.997);

      float live = clamp(uLiving, 0.0, 1.0);
      float depthCenter = texture2D(tDepth, pUv).r;
      if (live > 0.01) {
        if (uActIndex < 0.5) {
          float puddleMask = (1.0 - smoothstep(0.05, 0.27, pUv.y)) * edgeDamp * live;
          pUv.x += sin(pUv.y * 105.0 - uTime * 3.6 + pUv.x * 14.0) * 0.0020 * puddleMask;
          vec2 dB = (pUv - vec2(0.635, 0.56)) * vec2(5.2, 3.4);
          float breathMask = exp(-dot(dB, dB)) * (0.45 + 0.55 * smoothstep(0.20, 0.58, depthCenter)) * edgeDamp * live;
          pUv.y -= sin(uTime * 1.35) * 0.0024 * breathMask;
        } else if (uActIndex < 1.5) {
          vec2 dB = (pUv - vec2(0.55, 0.54)) * vec2(4.4, 3.6);
          float braceMask = exp(-dot(dB, dB)) * edgeDamp * live;
          pUv.y -= sin(uTime * 1.85) * 0.0028 * braceMask;
        } else if (uActIndex < 2.5) {
          vec2 dB = (pUv - vec2(0.45, 0.56)) * vec2(4.8, 3.8);
          float focusMask = exp(-dot(dB, dB)) * edgeDamp * live;
          pUv.y -= sin(uTime * 1.45) * 0.0020 * focusMask;
        } else if (uActIndex < 3.5) {
          float barMask =
            smoothstep(0.50, 0.68, pUv.y) *
            (1.0 - smoothstep(0.84, 0.94, pUv.y)) *
            smoothstep(0.16, 0.28, pUv.x) *
            (1.0 - smoothstep(0.72, 0.84, pUv.x)) *
            edgeDamp * live;
          pUv += vec2(sin(uTime * 29.0), cos(uTime * 35.0)) * 0.00085 * barMask;
        } else {
          vec2 dB = (pUv - vec2(0.50, 0.52)) * vec2(5.0, 2.8);
          float heroBreeze = exp(-dot(dB, dB)) * edgeDamp * live;
          pUv.x += sin(uTime * 2.1 + pUv.y * 20.0) * 0.0012 * heroBreeze;
        }
        pUv = clamp(pUv, 0.003, 0.997);
      }

      vec3 rawCol = texture2D(tColor, pUv).rgb;
      vec3 col = unifyInkGrade(rawCol, uAmberAccent);

      if (live > 0.01) {
        float actLuma = dot(col, vec3(0.299, 0.587, 0.114));
        if (uActIndex < 0.5) {
          float puddleGlint =
            smoothstep(0.32, 0.82, actLuma) *
            (1.0 - smoothstep(0.06, 0.28, pUv.y)) *
            (0.5 + 0.5 * sin(pUv.x * 26.0 + uTime * 2.4 - pUv.y * 18.0));
          col += vec3(0.032, 0.030, 0.026) * puddleGlint * live;
        } else if (uActIndex < 1.5) {
          float rayNoise = texture2D(tPaper, pUv * vec2(1.8, 1.4) + vec2(-uTime * 0.024, uTime * 0.034)).r;
          float rayZone =
            smoothstep(0.34, 0.86, pUv.y) *
            smoothstep(0.28, 0.80, pUv.x) *
            smoothstep(0.18, 0.72, actLuma);
          col += vec3(0.055, 0.050, 0.042) * rayZone * (rayNoise - 0.32) * live;
        } else if (uActIndex < 2.5) {
          float phoneDist = length((pUv - vec2(0.52, 0.48)) * vec2(1.15, 1.0));
          float phonePulse = 0.5 + 0.5 * sin(uTime * 2.2) + 0.14 * sin(uTime * 5.7);
          float glowArea = smoothstep(0.42, 0.04, phoneDist) * smoothstep(0.05, 0.44, actLuma);
          col += vec3(0.090, 0.044, 0.010) * glowArea * phonePulse * live;
        } else if (uActIndex < 3.5) {
          float warmth = clamp((rawCol.r - rawCol.b) * 1.9, 0.0, 1.0);
          float surge = 0.5 + 0.5 * sin((pUv.x * 1.1 - pUv.y * 0.9) * 14.0 - uTime * 3.4);
          col += vec3(0.10, 0.042, 0.006) * warmth * surge * 0.55 * live;
        } else {
          float sunPaper = texture2D(tPaper, pUv * 1.6 - vec2(uTime * 0.018, uTime * 0.012)).r;
          float beam =
            (0.5 + 0.5 * sin((pUv.x * 1.35 + pUv.y * 0.65) * 9.0 - uTime * 0.95)) *
            (0.65 + 0.35 * sunPaper);
          float hlGuard = smoothstep(0.25, 0.72, actLuma) * (1.0 - smoothstep(0.84, 0.98, actLuma));
          col += vec3(0.065, 0.046, 0.018) * beam * hlGuard * live;
        }
      }

      col += (paper - 0.5) * 0.016;
      col = mix(col, uVeilTint, clamp(uDepthVeil, 0.0, 0.78));

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), frameAlpha);
    }
  `

  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      tColor: { value: colorMap },
      tDepth: { value: depthMap },
      tPaper: { value: textures.paper },
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uParallaxStrength: { value: parallaxStrength },
      uFocusDepth: { value: focusDepth },
      uOpacity: { value: 1 },
      uReveal: { value: 1 },
      uZoom: { value: 1.02 },
      uPan: { value: new THREE.Vector2(0, 0) },
      uDepthVeil: { value: 0 },
      uVeilTint: { value: new THREE.Color(0x181614) },
      uAmberAccent: { value: amberAccent },
      uFullBleed: { value: 0 },
      uActIndex: { value: actIndex },
      uLiving: { value: 1 },
    },
  })
}

/**
 * Foreground slanted trapezoid Cut-In panel sharing the EXACT same duotone ink grade LUT,
 * living 6 FPS bone-ivory outer stroke, and diagonal wet-ink reveal over the main frame.
 */
export function createEditorialCutInMaterial({
  colorMap,
  textures,
  shear = -0.11,
  amberAccent = 0,
  actIndex = 0,
}: {
  colorMap: THREE.Texture
  textures: InkTextureBundle
  shear?: number
  amberAccent?: number
  actIndex?: number
}): THREE.ShaderMaterial {
  const vert = /* glsl */ `
    precision highp float;
    uniform vec2 uMouse;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec3 pos = position;
      pos.x += uMouse.x * 0.028;
      pos.y += uMouse.y * 0.018;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `

  const frag = /* glsl */ `
    precision highp float;

    uniform sampler2D tColor;
    uniform sampler2D tPaper;
    uniform float uTime;
    uniform float uShear;
    uniform float uReveal;
    uniform float uKenBurns;
    uniform float uOpacity;
    uniform float uDepthVeil;
    uniform vec3 uVeilTint;
    uniform float uAmberAccent;
    uniform float uActIndex;
    uniform float uLiving;

    varying vec2 vUv;

    ${UNIFY_INK_GRADE_GLSL}

    void main() {
      float vis = uReveal * uOpacity;
      if (vis < 0.008) discard;

      float stepT = floor(uTime * 6.0) / 6.0;
      float paper = texture2D(tPaper, vUv * vec2(2.2, 1.3)).r;
      float xSlant = vUv.x + (vUv.y - 0.5) * uShear;
      float yCoord = vUv.y;

      float padX = 0.085;
      float padY = 0.095;
      vec2 innerUv = vec2(
        (xSlant - padX) / (1.0 - 2.0 * padX),
        (yCoord - padY) / (1.0 - 2.0 * padY)
      );

      float edgeWave =
        sin(vUv.x * 24.0 + vUv.y * 19.0) * 0.0009 +
        cos(vUv.y * 21.0 + stepT * 4.5) * 0.0006;
      float dx = min(innerUv.x, 1.0 - innerUv.x) + edgeWave;
      float dy = min(innerUv.y, 1.0 - innerUv.y) + edgeWave * 1.45;
      float dist = min(dx, dy);

      // Diagonal ink-wash wipe reveal across panel
      float wipePos = innerUv.x * 0.72 + (1.0 - innerUv.y) * 0.28 + (paper - 0.5) * 0.14;
      float wipeMask = smoothstep(wipePos - 0.09, wipePos + 0.07, uReveal * 1.18 - 0.04) * uOpacity;
      if (wipeMask < 0.015) discard;

      // Rich dark drop shadow anchoring foreground Cut-In above wide plate
      if (dist < -0.010) {
        vec2 shUv = innerUv - vec2(0.018, -0.024);
        float sdx = min(shUv.x, 1.0 - shUv.x);
        float sdy = min(shUv.y, 1.0 - shUv.y);
        float sDist = min(sdx, sdy);
        if (sDist > -0.062 && sDist < 0.02) {
          float shadowDist = clamp(-sDist / 0.062, 0.0, 1.0);
          float shAlpha = pow(1.0 - shadowDist, 2.2) * 0.52 * wipeMask;
          if (shAlpha < 0.008) discard;
          gl_FragColor = vec4(0.02, 0.018, 0.016, shAlpha);
          return;
        }
        discard;
      }

      // Crisp obsidian outer wrap + luminous bone-ivory / antique-amber inner frame hairline
      if (dist < 0.0) {
        float cutAA = smoothstep(-0.010, -0.007, dist);
        vec3 outerRim = mix(vec3(0.035, 0.032, 0.028), uVeilTint, clamp(uDepthVeil * 0.70, 0.0, 0.6));
        gl_FragColor = vec4(outerRim, mix(0.45, 0.98, cutAA) * wipeMask);
        return;
      }
      if (dist < 0.012) {
        vec3 accent = mix(vec3(0.88, 0.84, 0.76), vec3(0.93, 0.66, 0.36), clamp(uAmberAccent * 0.58, 0.0, 0.58));
        accent += vec3(0.05, 0.04, 0.03) * (0.5 + 0.5 * sin(uTime * 2.4 + uActIndex * 1.1)) * clamp(uLiving, 0.0, 1.0);
        vec3 boneLine = mix(accent, uVeilTint, clamp(uDepthVeil * 0.72, 0.0, 0.65));
        gl_FragColor = vec4(boneLine, 0.96 * wipeMask);
        return;
      }

      float zoom = max(1.0, uKenBurns);
      vec2 imgUv = clamp((clamp(innerUv, 0.0, 1.0) - 0.5) / zoom + 0.5, 0.003, 0.997);
      vec3 imgCol = texture2D(tColor, imgUv).rgb;
      imgCol = unifyInkGrade(imgCol, uAmberAccent);
      imgCol += (paper - 0.5) * 0.018;
      imgCol = mix(imgCol, uVeilTint, clamp(uDepthVeil, 0.0, 0.68));

      gl_FragColor = vec4(clamp(imgCol, 0.0, 1.0), wipeMask);
    }
  `

  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      tColor: { value: colorMap },
      tPaper: { value: textures.paper },
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uShear: { value: shear },
      uReveal: { value: 1 },
      uKenBurns: { value: 1 },
      uOpacity: { value: 1 },
      uDepthVeil: { value: 0 },
      uVeilTint: { value: new THREE.Color(0x181614) },
      uAmberAccent: { value: amberAccent },
      uFullBleed: { value: 0 },
      uActIndex: { value: actIndex },
      uLiving: { value: 1 },
    },
  })
}

/**
 * Hand-inked brutalist perspective stone avenue floor (Y = -1.32) leading continuously
 * along -Z from Act I (Z = 0) through the colonnade into Act II (Z = -13.5) and horizon (Z = -32).
 */
export function createCorridorRoadMaterial(textures: InkTextureBundle): THREE.ShaderMaterial {
  const vert = /* glsl */ `
    precision highp float;
    varying vec3 vWorldPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `

  const frag = /* glsl */ `
    precision highp float;

    uniform sampler2D tPaper;
    uniform sampler2D tHatch;
    uniform float uCamZ;
    uniform float uOpacity;
    uniform float uAmberProgress; // 0 = monochrome bone, 1 = ignited molten amber
    uniform float uDaylight;      // 0 = moody corridor, 1 = sunlit cathedral steps

    varying vec3 vWorldPos;

    void main() {
      if (uOpacity < 0.01) discard;

      float distZ = uCamZ - vWorldPos.z;
      if (distZ < 0.4) discard;

      float paper = texture2D(tPaper, vWorldPos.xz * 0.42).r;
      float hatch = texture2D(tHatch, vWorldPos.xz * 0.55).r;
      vec2 wPos = vWorldPos.xz + (paper - 0.5) * 0.04;

      // Crosswise stone slab joints receding every 1.8 units down -Z + wet bevel catchlight
      float slabPhase = fract(wPos.y / 1.8);
      float zGroove = 1.0 - smoothstep(0.0, 0.032, min(slabPhase, 1.0 - slabPhase));
      float zHighlight = smoothstep(0.030, 0.065, slabPhase) * (1.0 - smoothstep(0.065, 0.125, slabPhase));

      // Perspective avenue curb rails + delicate double center drafting lines
      float curbMain = 1.0 - smoothstep(0.015, 0.060, abs(abs(wPos.x) - 2.45));
      float curbOuter = 1.0 - smoothstep(0.015, 0.075, abs(abs(wPos.x) - 3.25));
      float centerGuide = 1.0 - smoothstep(0.008, 0.032, abs(abs(wPos.x) - 0.075));

      // Soft wet reflection core straight toward vanishing point
      float centerSheen = exp(-pow(vWorldPos.x * 0.44, 2.0));
      vec3 stoneWarm = mix(vec3(0.245, 0.225, 0.195), vec3(0.295, 0.220, 0.150), clamp(uAmberProgress, 0.0, 1.0));
      stoneWarm = mix(stoneWarm, vec3(0.390, 0.320, 0.225), clamp(uDaylight, 0.0, 1.0));
      vec3 baseStone = mix(
        mix(vec3(0.082, 0.078, 0.070), vec3(0.145, 0.118, 0.088), clamp(uDaylight, 0.0, 1.0)),
        stoneWarm,
        centerSheen * (0.45 + 0.55 * hatch)
      );
      baseStone += (paper - 0.5) * 0.03;
      baseStone = mix(baseStone, vec3(0.038, 0.036, 0.032), zGroove * 0.82);

      float lineMask = clamp(max(max(curbMain * 0.90, curbOuter * 0.55), max(zHighlight * 0.65, centerGuide * 0.78)), 0.0, 1.0);
      vec3 lineTint = mix(vec3(0.76, 0.71, 0.62), vec3(0.93, 0.60, 0.24), clamp(uAmberProgress, 0.0, 1.0));
      lineTint = mix(lineTint, vec3(0.96, 0.82, 0.58), clamp(uDaylight, 0.0, 1.0));
      vec3 roadCol = mix(baseStone, lineTint, lineMask * (0.55 + 0.45 * centerSheen));

      // Distance perspective fog & gentle near-camera fade
      float nearFade = smoothstep(0.55, 2.45, distZ);
      float farFog = exp(-max(0.0, distZ) * 0.054);
      float sideFade = 1.0 - smoothstep(3.6, 6.8, abs(vWorldPos.x));
      float alpha = clamp(nearFade * (0.28 + 0.72 * farFog) * sideFade * 0.92 * uOpacity, 0.0, 0.94);

      vec3 fogFloorTint = mix(vec3(0.085, 0.080, 0.072), vec3(0.115, 0.088, 0.062), clamp(uAmberProgress, 0.0, 1.0));
      fogFloorTint = mix(fogFloorTint, vec3(0.205, 0.165, 0.115), clamp(uDaylight, 0.0, 1.0));
      roadCol = mix(fogFloorTint, roadCol, clamp(farFog * 1.15, 0.0, 1.0));
      gl_FragColor = vec4(clamp(roadCol, 0.0, 1.0), alpha);
    }
  `

  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      tPaper: { value: textures.paper },
      tHatch: { value: textures.hatch },
      uCamZ: { value: 4.25 },
      uOpacity: { value: 1 },
      uAmberProgress: { value: 0 },
      uDaylight: { value: 0 },
    },
  })
}

/**
 * Hand-inked colonnade portal arch lining both flanks of the long corridor road.
 * Completely open interior (discarded center) with crosshatched charcoal pillars & amber/gold bevels.
 */
export function createCorridorArchMaterial(textures: InkTextureBundle): THREE.ShaderMaterial {
  const vert = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `

  const frag = /* glsl */ `
    precision highp float;

    uniform sampler2D tPaper;
    uniform sampler2D tHatch;
    uniform float uAlpha;
    uniform float uDistFade;      // 0 = near camera, 1 = far haze
    uniform float uAmberProgress; // 0 = monochrome bone, 1 = warm amber bevel
    uniform float uDaylight;      // 0 = charcoal gallery, 1 = golden cathedral haze

    varying vec2 vUv;

    void main() {
      if (uAlpha < 0.01) discard;

      float paper = texture2D(tPaper, vUv * vec2(2.0, 2.6)).r;
      float hatch = texture2D(tHatch, vUv * vec2(2.6, 3.2)).r;

      float ax = abs(vUv.x - 0.5);
      float ay = vUv.y;

      // Open central portal archway
      if (ax < 0.34 && ay < 0.80) discard;

      // Soft outer perimeter fade so quads melt invisibly into atmospheric sky
      float outerX = 1.0 - smoothstep(0.45, 0.50, ax);
      float outerY = 1.0 - smoothstep(0.92, 1.00, ay);
      float floorFade = smoothstep(0.0, 0.06, vUv.y);

      float pillarShade = smoothstep(0.34, 0.44, ax);
      float pillarSeam = 1.0 - smoothstep(0.0, 0.004, abs(ax - 0.405));
      vec3 pillarBase = mix(vec3(0.056, 0.052, 0.047), vec3(0.088, 0.072, 0.054), clamp(uDaylight, 0.0, 1.0));
      vec3 pillarInk = pillarBase
        + (hatch - 0.85) * 0.10
        + (paper - 0.5) * 0.020
        - vec3(0.011) * pillarShade
        - vec3(0.014) * pillarSeam;

      // Razor-fine inner archway catchlight catching corridor glow strictly along opening edge
      float rimX = step(0.34, ax) * (1.0 - smoothstep(0.34, 0.346, ax)) * step(ay, 0.806);
      float rimY = step(0.80, ay) * (1.0 - smoothstep(0.80, 0.806, ay)) * step(ax, 0.346);
      float innerRim = clamp(max(rimX, rimY), 0.0, 1.0);

      vec3 rimColor = mix(vec3(0.56, 0.51, 0.44), vec3(0.92, 0.58, 0.25), clamp(uAmberProgress, 0.0, 1.0));
      rimColor = mix(rimColor, vec3(0.98, 0.82, 0.54), clamp(uDaylight, 0.0, 1.0));

      vec3 col = mix(pillarInk, rimColor, innerRim * mix(0.78, 0.96, clamp(max(uAmberProgress, uDaylight), 0.0, 1.0)));

      vec3 hazeColor = mix(vec3(0.122, 0.114, 0.102), vec3(0.185, 0.140, 0.095), clamp(uAmberProgress, 0.0, 1.0));
      hazeColor = mix(hazeColor, vec3(0.245, 0.198, 0.142), clamp(uDaylight, 0.0, 1.0));
      col = mix(col, hazeColor, clamp(uDistFade * 0.76, 0.0, 0.76));

      float alpha = clamp(outerX * outerY * floorFade * uAlpha * mix(0.96, 0.84, clamp(uDaylight, 0.0, 1.0)), 0.0, 0.96);
      if (alpha < 0.01) discard;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), alpha);
    }
  `

  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      tPaper: { value: textures.paper },
      tHatch: { value: textures.hatch },
      uAlpha: { value: 1 },
      uDistFade: { value: 0 },
      uAmberProgress: { value: 0 },
      uDaylight: { value: 0 },
    },
  })
}

/**
 * Architectural colonnade wayfinder marker mounted discreetly along flanking walls.
 */
export function createCorridorWayfinderMaterial(tex: THREE.Texture, amberTint = 0): THREE.ShaderMaterial {
  const vert = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `
  const frag = /* glsl */ `
    precision highp float;
    uniform sampler2D tMap;
    uniform float uAlpha;
    uniform float uAmberTint;
    varying vec2 vUv;

    void main() {
      if (uAlpha < 0.01) discard;
      vec4 s = texture2D(tMap, vUv);
      float a = s.a * uAlpha;
      if (a < 0.01) discard;
      vec3 tint = mix(vec3(0.90, 0.85, 0.76), vec3(0.95, 0.66, 0.32), clamp(uAmberTint, 0.0, 1.0));
      gl_FragColor = vec4(s.rgb * tint, a);
    }
  `
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      tMap: { value: tex },
      uAlpha: { value: 1 },
      uAmberTint: { value: amberTint },
    },
  })
}

/**
 * Real-time Wet Stone Floor Mirror Reflection placed directly beneath each Act plate (Y = -1.305).
 * Grounds each plate physically into the damp dark stone corridor with ripple blur & amber sheen.
 */
export function createFloorReflectionMaterial({
  colorMap,
  textures,
  amberAccent = 0,
}: {
  colorMap: THREE.Texture
  textures: InkTextureBundle
  amberAccent?: number
}): THREE.ShaderMaterial {
  const vert = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `

  const frag = /* glsl */ `
    precision highp float;

    uniform sampler2D tColor;
    uniform sampler2D tPaper;
    uniform sampler2D tHatch;
    uniform float uTime;
    uniform float uOpacity;
    uniform float uAmberAccent;
    uniform float uPulse;

    varying vec2 vUv;

    ${UNIFY_INK_GRADE_GLSL}

    void main() {
      if (uOpacity < 0.01) discard;

      // vUv.y = 1.0 sits right under the base of the plate (near Z = stationZ),
      // vUv.y = 0.0 extends forward toward the camera (+Z) across damp stone slabs.
      float away = 1.0 - vUv.y;

      float paper = texture2D(tPaper, vec2(vUv.x * 2.4, vUv.y * 2.2)).r;
      float hatch = texture2D(tHatch, vec2(vUv.x * 3.0, vUv.y * 2.6)).r;
      float ripple = (paper - 0.5) * 0.022 * (0.35 + away) + sin(vUv.y * 34.0 + uTime * 0.65) * 0.005 * away;

      vec2 refUv = vec2(clamp(vUv.x + ripple, 0.01, 0.99), clamp(0.04 + away * 0.54, 0.01, 0.98));

      // Soft 3-tap blur mimicking wet honed brutalist stone roughness
      float blurSpan = 0.012 + away * 0.026;
      vec3 c0 = texture2D(tColor, refUv).rgb;
      vec3 c1 = texture2D(tColor, clamp(refUv + vec2(0.0, blurSpan), 0.01, 0.99)).rgb;
      vec3 c2 = texture2D(tColor, clamp(refUv - vec2(0.0, blurSpan * 0.7), 0.01, 0.99)).rgb;
      vec3 col = (c0 * 0.50 + c1 * 0.28 + c2 * 0.22);

      col = unifyInkGrade(col, uAmberAccent);
      float warmth = clamp((col.r - col.b) * 1.8, 0.0, 1.0) * uAmberAccent;
      col += vec3(0.28, 0.16, 0.04) * warmth * (0.55 + 0.45 * uPulse);
      col *= (0.72 + 0.28 * hatch);

      float sideFade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
      float baseContact = smoothstep(1.0, 0.94, vUv.y);
      float distAtten = pow(clamp(vUv.y, 0.0, 1.0), 1.65);

      float alpha = clamp(sideFade * baseContact * distAtten * uOpacity * (0.44 + 0.12 * uPulse), 0.0, 0.62);
      if (alpha < 0.008) discard;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), alpha);
    }
  `

  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      tColor: { value: colorMap },
      tPaper: { value: textures.paper },
      tHatch: { value: textures.hatch },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uAmberAccent: { value: amberAccent },
      uPulse: { value: 0.5 },
    },
  })
}

/**
 * Procedural 3D Diagonal Sumi-Ink Rain Curtain slicing across foreground of Act I.
 */
export function createInkRainMaterial(): THREE.ShaderMaterial {
  const vert = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `
  const frag = /* glsl */ `
    precision highp float;

    uniform float uTime;
    uniform float uOpacity;
    uniform vec2 uMouse;

    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float rainLayer(vec2 uv, float cols, float speed, float seed) {
      vec2 skewed = vec2(uv.x + uv.y * 0.24, uv.y);
      float colId = floor(skewed.x * cols);
      float colX = fract(skewed.x * cols) - 0.5;
      float r = hash12(vec2(colId, seed));
      if (r < 0.42) return 0.0;
      float yFlow = fract(skewed.y * (1.2 + r * 1.4) + uTime * speed * (0.75 + r * 0.55) + r * 13.7);
      float dropTail = smoothstep(0.0, 0.18, yFlow) * (1.0 - smoothstep(0.18, 0.58, yFlow));
      float thin = 1.0 - smoothstep(0.0, 0.055, abs(colX));
      return thin * dropTail * (0.45 + 0.55 * r);
    }

    void main() {
      if (uOpacity < 0.01) discard;
      vec2 uv = vUv + uMouse * vec2(-0.025, 0.012);
      float l1 = rainLayer(uv, 46.0, 1.35, 1.7);
      float l2 = rainLayer(uv * 1.12 + vec2(0.19, 0.0), 74.0, 0.92, 5.3) * 0.65;
      float l3 = rainLayer(uv * 0.85 + vec2(0.41, 0.0), 28.0, 1.80, 9.1) * 0.85;
      float streak = clamp(l1 + l2 + l3, 0.0, 1.0);
      float edgeMask = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) *
                       smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
      float alpha = streak * edgeMask * uOpacity;
      if (alpha < 0.01) discard;
      vec3 rainCol = mix(vec3(0.55, 0.52, 0.46), vec3(0.88, 0.84, 0.76), streak);
      gl_FragColor = vec4(rainCol, alpha);
    }
  `
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
    },
  })
}

/**
 * Low-lying swirling gym chalk mist hovering above the floor beneath Act II.
 */
export function createChalkMistMaterial(textures: InkTextureBundle): THREE.ShaderMaterial {
  const vert = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `
  const frag = /* glsl */ `
    precision highp float;

    uniform sampler2D tPaper;
    uniform float uTime;
    uniform float uOpacity;

    varying vec2 vUv;

    void main() {
      if (uOpacity < 0.01) discard;
      float n1 = texture2D(tPaper, vec2(vUv.x * 1.4 - uTime * 0.032, vUv.y * 1.1 + sin(uTime * 0.25) * 0.04)).r;
      float n2 = texture2D(tPaper, vec2(vUv.x * 2.2 + uTime * 0.021, vUv.y * 1.8 - uTime * 0.012)).r;
      float cloud = smoothstep(0.32, 0.82, n1 * 0.62 + n2 * 0.38);
      float maskX = smoothstep(0.0, 0.26, vUv.x) * smoothstep(1.0, 0.74, vUv.x);
      float maskY = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
      float alpha = cloud * maskX * maskY * uOpacity * 0.42;
      if (alpha < 0.008) discard;
      gl_FragColor = vec4(vec3(0.84, 0.79, 0.71), alpha);
    }
  `
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      tPaper: { value: textures.paper },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    },
  })
}

/**
 * Volumetric Cathedral God-Rays sweeping diagonally across Act V daylight climax.
 */
export function createGodRaysMaterial(): THREE.ShaderMaterial {
  const vert = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `
  const frag = /* glsl */ `
    precision highp float;

    uniform float uTime;
    uniform float uOpacity;
    uniform vec2 uMouse;

    varying vec2 vUv;

    float rayBeam(vec2 uv, float originX, float slope, float width, float phase) {
      float axis = (uv.x - originX) + (1.0 - uv.y) * slope;
      float spread = width * (0.42 + (1.0 - uv.y) * 1.15);
      float core = exp(-pow(axis / max(0.02, spread), 2.0));
      float shimmer = 0.84 + 0.16 * sin(uTime * 0.65 + phase + uv.y * 3.0);
      return core * shimmer;
    }

    void main() {
      if (uOpacity < 0.01) discard;
      float mx = uMouse.x * 0.14;
      float r1 = rayBeam(vUv, 0.48 + mx * 0.7, 0.34 - mx * 0.35, 0.11, 0.4);
      float r2 = rayBeam(vUv, 0.61 + mx * 0.5, 0.26 - mx * 0.25, 0.085, 2.1) * 0.82;
      float r3 = rayBeam(vUv, 0.36 + mx * 0.6, 0.42 - mx * 0.30, 0.075, 4.3) * 0.68;
      float r4 = rayBeam(vUv, 0.72 + mx * 0.4, 0.18 - mx * 0.20, 0.065, 5.7) * 0.55;

      float beams = clamp((r1 + r2 + r3 + r4) * 0.68, 0.0, 1.0);
      float vFade = smoothstep(0.05, 0.62, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
      float hFade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);

      float alpha = beams * vFade * hFade * uOpacity;
      if (alpha < 0.008) discard;
      vec3 sunGold = mix(vec3(0.95, 0.68, 0.32), vec3(1.0, 0.90, 0.70), beams);
      gl_FragColor = vec4(sunGold, alpha);
    }
  `
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
    },
  })
}

/**
 * Lightweight 1-pass Cinema Post-Processing Composite:
 * - Selective warm-amber bloom (only blooms fiery amber highlights, preserves deep obsidian blacks)
 * - Kinetic velocity optics (micro RGB chromatic aberration + outer speed streaks on bridge sprints)
 * - Dynamic 2.39:1 cinema letterbox opening smoothly into full IMAX matte at Act V
 * - Subtle 35mm theatrical film grain
 */
export function createCinemaPostFxMaterial(textures: InkTextureBundle): THREE.ShaderMaterial {
  const vert = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `

  const frag = /* glsl */ `
    precision highp float;

    uniform sampler2D tScene;
    uniform sampler2D tPaper;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uRush;
    uniform float uBloomStrength;
    uniform float uLetterbox;
    uniform float uDaylight;

    varying vec2 vUv;

    vec3 extractAmberBloom(vec3 c) {
      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      float warmth = max(0.0, c.r - c.b * 0.92);
      float mask = smoothstep(0.38, 0.88, luma) * smoothstep(0.10, 0.38, warmth);
      return c * mask;
    }

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float r2 = dot(centered, centered);
      float dist = sqrt(r2);

      // Dynamic 2.39:1 Cinema Letterbox (smoothly opens to 0.0 on Act V IMAX breakout & mobile)
      if (uLetterbox > 0.002) {
        float edgeY = min(vUv.y, 1.0 - vUv.y);
        float barMask = smoothstep(uLetterbox - 0.0025, uLetterbox + 0.0025, edgeY);
        if (barMask < 0.01) {
          gl_FragColor = vec4(0.028, 0.026, 0.024, 1.0);
          return;
        }
      }

      // Subtle velocity barrel optics during open corridor sprints
      vec2 uv = centered * (1.0 - r2 * uRush * 0.032) + 0.5;
      uv = clamp(uv, 0.001, 0.999);

      // Edge-weighted micro RGB chromatic aberration strictly proportional to velocity rush
      vec3 col;
      if (uRush > 0.02) {
        vec2 caOffset = centered * dist * uRush * 0.0052;
        col.r = texture2D(tScene, clamp(uv + caOffset, 0.001, 0.999)).r;
        col.g = texture2D(tScene, uv).g;
        col.b = texture2D(tScene, clamp(uv - caOffset, 0.001, 0.999)).b;
      } else {
        col = texture2D(tScene, uv).rgb;
      }

      // Selective 8-tap warm-amber anamorphic bloom (preserves cold deep blacks in Acts I-II)
      if (uBloomStrength > 0.01) {
        vec2 texel = 1.0 / max(vec2(1.0), uResolution);
        vec3 b = vec3(0.0);
        b += extractAmberBloom(texture2D(tScene, clamp(uv + vec2(4.0, 0.0) * texel, 0.001, 0.999)).rgb);
        b += extractAmberBloom(texture2D(tScene, clamp(uv - vec2(4.0, 0.0) * texel, 0.001, 0.999)).rgb);
        b += extractAmberBloom(texture2D(tScene, clamp(uv + vec2(0.0, 4.0) * texel, 0.001, 0.999)).rgb);
        b += extractAmberBloom(texture2D(tScene, clamp(uv - vec2(0.0, 4.0) * texel, 0.001, 0.999)).rgb);
        b += extractAmberBloom(texture2D(tScene, clamp(uv + vec2(9.0, 5.0) * texel, 0.001, 0.999)).rgb) * 0.72;
        b += extractAmberBloom(texture2D(tScene, clamp(uv + vec2(-9.0, 5.0) * texel, 0.001, 0.999)).rgb) * 0.72;
        b += extractAmberBloom(texture2D(tScene, clamp(uv + vec2(9.0, -5.0) * texel, 0.001, 0.999)).rgb) * 0.72;
        b += extractAmberBloom(texture2D(tScene, clamp(uv + vec2(-9.0, -5.0) * texel, 0.001, 0.999)).rgb) * 0.72;
        b /= 6.88;
        col += b * uBloomStrength * vec3(1.12, 0.94, 0.72);
      }

      // Subtle peripheral radial speed lines during high-speed portal sprints
      if (uRush > 0.14) {
        float angle = atan(centered.y, centered.x);
        float streakTex = texture2D(tPaper, vec2(angle * 3.8, dist * 1.4 - uTime * 1.6)).r;
        float periph = smoothstep(0.36, 0.72, dist);
        float streak = smoothstep(0.60, 0.92, streakTex) * periph * (uRush - 0.14) * 0.24;
        vec3 streakCol = mix(vec3(0.74, 0.70, 0.62), vec3(0.95, 0.68, 0.34), uDaylight * 0.6 + uBloomStrength);
        col = mix(col, streakCol, clamp(streak, 0.0, 0.22));
      }

      // Fine 35mm theatrical film grain
      float grain = (hash12(gl_FragCoord.xy + fract(uTime * 19.3) * 256.0) - 0.5) * 0.020;
      col += grain;

      // Soft cinema letterbox anti-aliased edge feather
      if (uLetterbox > 0.002) {
        float edgeY = min(vUv.y, 1.0 - vUv.y);
        float barMask = smoothstep(uLetterbox - 0.0025, uLetterbox + 0.0025, edgeY);
        col = mix(vec3(0.028, 0.026, 0.024), col, barMask);
      }

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `

  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      tScene: { value: null },
      tPaper: { value: textures.paper },
      uResolution: { value: new THREE.Vector2(1440, 900) },
      uTime: { value: 0 },
      uRush: { value: 0 },
      uBloomStrength: { value: 0 },
      uLetterbox: { value: 0 },
      uDaylight: { value: 0 },
    },
  })
}
