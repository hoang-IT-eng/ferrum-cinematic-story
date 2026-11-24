import { useEffect, useRef, useState } from 'react'
import { canAttemptWebGL, prefersReducedMotion } from '../motion/motion'
import { createWorld3DEngine, type World3DEngineHandle, type World3DSnapshot } from './worldEngine'

export interface WorldStage3DProps {
  getState: () => World3DSnapshot
  onReady?: () => void
  onFallbackChange?: (active: boolean) => void
}

export function WorldStage3D({ getState, onReady, onFallbackChange }: WorldStage3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const getStateRef = useRef(getState)
  getStateRef.current = getState
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const onFallbackRef = useRef(onFallbackChange)
  onFallbackRef.current = onFallbackChange

  const [fallbackActive, setFallbackActive] = useState<boolean>(
    () => prefersReducedMotion() || !canAttemptWebGL(),
  )

  useEffect(() => {
    onFallbackRef.current?.(fallbackActive)
  }, [fallbackActive])

  useEffect(() => {
    if (fallbackActive) {
      onReadyRef.current?.()
      return
    }
    const host = hostRef.current
    if (!host) return

    let handle: World3DEngineHandle | null = null
    let cancelled = false

    try {
      handle = createWorld3DEngine({
        host,
        getState: () => getStateRef.current(),
        onReady: () => {
          if (!cancelled) onReadyRef.current?.()
        },
        onContextLost: () => {
          if (!cancelled) setFallbackActive(true)
        },
      })
    } catch {
      setFallbackActive(true)
    }

    return () => {
      cancelled = true
      handle?.dispose()
    }
  }, [fallbackActive])

  return (
    <div
      ref={hostRef}
      className="film-stage-host"
      data-reduced-fallback={fallbackActive ? 'true' : 'false'}
      aria-hidden="true"
    />
  )
}
