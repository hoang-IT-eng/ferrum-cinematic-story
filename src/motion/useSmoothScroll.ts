import { useEffect } from 'react'
import { afterIdle, motionDisabled, setLenis } from './motion'

/**
 * Mounts Lenis smooth scroll synced on GSAP's ticker only after main-thread idle,
 * keeping Lenis & GSAP completely out of the initial entry JS chunk.
 */
export function useSmoothScroll(options?: { duration?: number; idleTimeout?: number }) {
  const duration = options?.duration ?? 1.1
  const idleTimeout = options?.idleTimeout ?? 1000

  useEffect(() => {
    if (motionDisabled()) return
    let innerCleanup: (() => void) | undefined

    const cancelIdle = afterIdle(() => {
      let disposed = false
      void Promise.all([
        import('lenis'),
        import('lenis/dist/lenis.css'),
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]).then(([{ default: Lenis }, _css, { default: gsap }, { ScrollTrigger }]) => {
        if (disposed) return
        gsap.registerPlugin(ScrollTrigger)
        const lenis = new Lenis({
          duration,
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          smoothWheel: true,
          touchMultiplier: 1.35,
        })
        setLenis(lenis)
        const syncScroll = () => {
          ScrollTrigger.update()
          window.dispatchEvent(new Event('ferrum:scroll'))
        }
        lenis.on('scroll', syncScroll)
        const tick = (time: number) => lenis.raf(time * 1000)
        gsap.ticker.add(tick)
        gsap.ticker.lagSmoothing(0)
        ScrollTrigger.refresh()

        innerCleanup = () => {
          gsap.ticker.remove(tick)
          lenis.destroy()
          setLenis(null)
        }
      })

      return () => {
        disposed = true
        innerCleanup?.()
      }
    }, idleTimeout)

    return cancelIdle
  }, [duration, idleTimeout])
}
