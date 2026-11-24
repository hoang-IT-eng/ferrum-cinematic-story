import { useEffect, useRef, useState } from 'react'
import { hasFinePointer, motionDisabled } from './motion'

/** Velocity-reactive ink cursor ring with ±6px magnetic pull on [data-magnetic] controls. */
export function CustomCursor() {
  const ringRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState(false)
  const active = typeof window !== 'undefined' && hasFinePointer() && !motionDisabled()

  useEffect(() => {
    if (!active) return
    let x = -100
    let y = -100
    let tx = -100
    let ty = -100
    let rafId = 0

    const onMove = (e: PointerEvent) => {
      tx = e.clientX
      ty = e.clientY
      const target = e.target as HTMLElement | null
      const magnetic = target?.closest?.('[data-magnetic]') as HTMLElement | null
      setHover(Boolean(magnetic || target?.closest?.('a, button, input')))

      if (magnetic) {
        const rect = magnetic.getBoundingClientRect()
        const dx = ((e.clientX - (rect.left + rect.width / 2)) / Math.max(rect.width, 1)) * 12
        const dy = ((e.clientY - (rect.top + rect.height / 2)) / Math.max(rect.height, 1)) * 12
        magnetic.style.transform = `translate3d(${Math.max(-6, Math.min(6, dx))}px, ${Math.max(-6, Math.min(6, dy))}px, 0)`
      }
    }

    const onLeaveTarget = (e: PointerEvent) => {
      const magnetic = (e.target as HTMLElement | null)?.closest?.('[data-magnetic]') as HTMLElement | null
      if (magnetic) magnetic.style.transform = ''
    }

    const tick = () => {
      const vx = tx - x
      const vy = ty - y
      x += vx * 0.22
      y += vy * 0.22

      if (ringRef.current) {
        const half = ringRef.current.offsetWidth / 2
        const speed = Math.min(28, Math.hypot(vx, vy))
        const angle = (Math.atan2(vy, vx) * 180) / Math.PI
        const stretch = 1 + speed * 0.012
        const squash = 1 / Math.sqrt(stretch)
        ringRef.current.style.transform = `translate3d(${x - half}px, ${y - half}px, 0) rotate(${angle.toFixed(1)}deg) scale(${stretch.toFixed(3)}, ${squash.toFixed(3)})`
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerout', onLeaveTarget, { passive: true })

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerout', onLeaveTarget)
    }
  }, [active])

  if (!active) return null
  return <div ref={ringRef} className="cursor-ring" data-hover={hover} aria-hidden="true" />
}
