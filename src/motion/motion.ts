import type Lenis from 'lenis'

/**
 * Motion guards + shared Lenis singleton.
 * Every animated effect checks `motionDisabled()` first so reduced-motion
 * visitors and automation get a complete, immediately visible static page.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

let cachedWebGL: boolean | null = null

/** Shared WebGL2/WebGL capability probe cached after first check so re-renders never leak GPU contexts. */
export function canAttemptWebGL(): boolean {
  if (cachedWebGL !== null) return cachedWebGL
  if (typeof document === 'undefined') return false
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    cachedWebGL = Boolean(gl)
    if (gl && 'getExtension' in gl) {
      ;(gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext()
    }
    return cachedWebGL
  } catch {
    cachedWebGL = false
    return false
  }
}

export function isAutomation(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.webdriver)
}

export function motionDisabled(): boolean {
  if (typeof window !== 'undefined') {
    const qaMotion = new URLSearchParams(window.location.search).get('motion')
    if (qaMotion === 'on') return prefersReducedMotion()
  }
  return prefersReducedMotion() || isAutomation() || import.meta.env.MODE === 'test'
}

export function hasFinePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches === true
}

let lenisInstance: Lenis | null = null

export const setLenis = (l: Lenis | null): void => {
  lenisInstance = l
}

export const getLenis = (): Lenis | null => lenisInstance

/** Runs init once the main thread is idle so ScrollTrigger setup stays out of the boot task. */
export function afterIdle(init: () => (() => void) | void, timeout = 900): () => void {
  let cleanup: (() => void) | void
  let cancelled = false
  const run = () => {
    if (!cancelled) cleanup = init()
  }
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout })
    return () => {
      cancelled = true
      window.cancelIdleCallback(id)
      cleanup?.()
    }
  }
  const id = window.setTimeout(run, 120)
  return () => {
    cancelled = true
    window.clearTimeout(id)
    cleanup?.()
  }
}
