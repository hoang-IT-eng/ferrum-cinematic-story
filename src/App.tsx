import { useCallback, useEffect, useRef, useState } from 'react'
import { HeaderNav } from './components/HeaderNav'
import { FerrumEmblemIcon, PlayIcon } from './components/Icons'
import { HERO_COPY } from './content/story'
import { CustomCursor } from './motion/CustomCursor'
import { getLenis, motionDisabled, prefersReducedMotion } from './motion/motion'
import { soundEngine, type SoundAct } from './motion/soundEngine'
import { useSmoothScroll } from './motion/useSmoothScroll'
import Chapters from './sections/Chapters'
import { ComicStoryTrack } from './sections/ComicStoryTrack'
import { WorldStage3D } from './world3d/WorldStage3D'
import type { World3DSnapshot } from './world3d/worldEngine'

const SCENE_IDS = ['scene-1', 'scene-2', 'scene-3', 'scene-4', 'scene-5'] as const

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function getInitialCurtainOpen(): boolean {
  if (typeof window === 'undefined') return false
  if (prefersReducedMotion()) return true
  const params = new URLSearchParams(window.location.search)
  if (params.get('skip') === '1' || params.get('skip') === 'true') return true
  if (window.location.hash === '#blueprint') return true
  if ((window.scrollY || window.pageYOffset || 0) > 24) return true
  return false
}

export function App() {
  useSmoothScroll({ duration: 1.2, idleTimeout: 600 })

  const initialOpen = useRef<boolean>(getInitialCurtainOpen()).current
  const [curtainOpen, setCurtainOpen] = useState<boolean>(initialOpen)
  const [curtainHidden, setCurtainHidden] = useState<boolean>(initialOpen)
  const [autoCinema, setAutoCinema] = useState<boolean>(false)
  const [stageFallback, setStageFallback] = useState<boolean>(false)

  const stateRef = useRef<World3DSnapshot>({
    curtain: initialOpen ? 0 : 1,
    appDim: 0,
    scrollVelocity: 0,
    filmProgress: 0,
  })
  const lastScrollY = useRef(0)
  const smoothedVel = useRef(0)

  const [uiState, setUiState] = useState({
    activeScene: 0,
    filmProgress: 0,
    progress: 0,
    inAppSection: false,
  })

  const measureScroll = useCallback(() => {
    const scrollY = window.scrollY || window.pageYOffset || 0
    const vh = Math.max(1, window.innerHeight)

    if (scrollY > 24) {
      setCurtainOpen(true)
    }

    const delta = scrollY - lastScrollY.current
    lastScrollY.current = scrollY
    smoothedVel.current = clamp(smoothedVel.current * 0.72 + delta * 0.04, -18, 18)

    const maxDocScroll = Math.max(1, document.documentElement.scrollHeight - vh)
    const scrollNorm = clamp(scrollY / maxDocScroll, 0, 1)

    let filmProgress = 0
    const anchors = SCENE_IDS.map((id) => {
      const el = document.getElementById(id)
      return el ? Math.max(0, el.getBoundingClientRect().top + scrollY) : null
    })

    if (anchors.every((a): a is number => a !== null)) {
      if (scrollY <= anchors[0]) {
        filmProgress = 0
      } else if (scrollY >= anchors[4]) {
        const s5 = document.getElementById('scene-5')
        const tailSpan = s5 ? Math.max(1, s5.offsetHeight * 0.55) : vh
        filmProgress = clamp(4 + (scrollY - anchors[4]) / tailSpan, 4, 4.95)
      } else {
        for (let i = 0; i < 4; i++) {
          if (scrollY >= anchors[i] && scrollY < anchors[i + 1]) {
            const span = Math.max(1, anchors[i + 1] - anchors[i])
            filmProgress = i + (scrollY - anchors[i]) / span
            break
          }
        }
      }
    } else {
      filmProgress = clamp(scrollNorm * 4.5, 0, 4)
    }

    let appDim = 0
    let inAppSection = false
    const bp = document.getElementById('blueprint')
    if (bp) {
      const top = bp.getBoundingClientRect().top
      appDim = clamp((vh * 0.96 - top) / Math.max(1, vh * 0.62), 0, 1)
      inAppSection = top <= vh * 0.55
    }

    stateRef.current.appDim = appDim
    stateRef.current.scrollVelocity = smoothedVel.current
    stateRef.current.filmProgress = filmProgress

    // Unified caption alignment across the 5-Act 3D perspective avenue
    const activeScene = Math.min(4, Math.max(0, Math.floor(filmProgress + 0.22)))
    const progress = clamp(filmProgress / 4, 0, 1)
    soundEngine.setAct(activeScene as SoundAct)

    setUiState((prev) =>
      prev.activeScene === activeScene &&
      Math.abs(prev.filmProgress - filmProgress) < 0.008 &&
      Math.abs(prev.progress - progress) < 0.008 &&
      prev.inAppSection === inAppSection
        ? prev
        : { activeScene, filmProgress, progress, inAppSection },
    )
  }, [])

  // Smooth WebGL Ink Curtain tear animation (1 -> 0) when Prelude opens
  useEffect(() => {
    if (!curtainOpen) {
      stateRef.current.curtain = 1
      return
    }
    if (motionDisabled()) {
      stateRef.current.curtain = 0
      setCurtainHidden(true)
      return
    }
    const startVal = stateRef.current.curtain
    if (startVal <= 0.001) {
      stateRef.current.curtain = 0
      setCurtainHidden(true)
      return
    }

    let rafId = 0
    const duration = 1150
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      stateRef.current.curtain = Math.max(0, startVal * (1 - eased))
      if (t < 1) {
        rafId = requestAnimationFrame(step)
      } else {
        stateRef.current.curtain = 0
        setCurtainHidden(true)
      }
    }
    rafId = requestAnimationFrame(step)

    const hideTimer = window.setTimeout(() => setCurtainHidden(true), 850)
    return () => {
      cancelAnimationFrame(rafId)
      window.clearTimeout(hideTimer)
    }
  }, [curtainOpen])

  // Non-trapping opener: scroll, swipe up, or navigation keys open Prelude automatically
  useEffect(() => {
    if (curtainOpen) return
    let touchStartY = 0

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 12) setCurtainOpen(true)
    }
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (e: TouchEvent) => {
      const curY = e.touches[0]?.clientY ?? touchStartY
      if (touchStartY - curY > 20) setCurtainOpen(true)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'Escape') {
        setCurtainOpen(true)
      }
    }

    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [curtainOpen])

  // Auto-Cinema glide down through all 5 3D Graphic Novel Panels (~9s per Act)
  useEffect(() => {
    if (!autoCinema) return
    setCurtainOpen(true)

    const stopOnUserInput = () => setAutoCinema(false)
    window.addEventListener('wheel', stopOnUserInput, { passive: true })
    window.addEventListener('touchstart', stopOnUserInput, { passive: true })

    let rafId = 0
    let lastTime = performance.now()
    let cruiseSpeed = Math.max(1, window.innerHeight) * 0.14

    const stepCruise = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now
      const vh = Math.max(1, window.innerHeight)
      const scene5 = document.getElementById('scene-5')
      const maxTarget = scene5
        ? Math.max(0, scene5.getBoundingClientRect().top + (window.scrollY || 0) + vh * 0.4)
        : document.documentElement.scrollHeight - vh

      const curY = window.scrollY || window.pageYOffset || 0
      if (curY >= maxTarget - 2) {
        setAutoCinema(false)
        return
      }

      // Director-paced cinema rhythm: linger slowly on each Act frame, surge through open portals
      const fpNow = stateRef.current.filmProgress
      const inStation =
        fpNow < 0.38 ||
        (fpNow > 1.06 && fpNow < 1.44) ||
        (fpNow > 2.06 && fpNow < 2.44) ||
        (fpNow > 3.06 && fpNow < 3.44) ||
        fpNow > 4.06
      const targetSpeed = vh * (inStation ? 0.11 : 0.56)
      cruiseSpeed += (targetSpeed - cruiseSpeed) * Math.min(1, dt * 4.5)

      const nextY = Math.min(maxTarget, curY + cruiseSpeed * dt)
      const lenis = getLenis()
      if (lenis) {
        lenis.scrollTo(nextY, { immediate: true })
      } else {
        window.scrollTo(0, nextY)
      }
      measureScroll()
      rafId = requestAnimationFrame(stepCruise)
    }

    rafId = requestAnimationFrame(stepCruise)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('wheel', stopOnUserInput)
      window.removeEventListener('touchstart', stopOnUserInput)
    }
  }, [autoCinema, measureScroll])

  useEffect(() => {
    measureScroll()
    const onScroll = () => measureScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('ferrum:scroll', onScroll)
    window.addEventListener('resize', onScroll, { passive: true })

    const decayId = window.setInterval(() => {
      if (Math.abs(smoothedVel.current) > 0.02) {
        smoothedVel.current *= 0.84
        stateRef.current.scrollVelocity = smoothedVel.current
      } else {
        smoothedVel.current = 0
        stateRef.current.scrollVelocity = 0
      }
    }, 32)

    const onStageClick = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest('button, a, input')) return
      soundEngine.playShockwave()
    }
    window.addEventListener('pointerdown', onStageClick)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('ferrum:scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      window.clearInterval(decayId)
      window.removeEventListener('pointerdown', onStageClick)
    }
  }, [measureScroll])

  const handleStageReady = useCallback(() => {
    const lcpHero = document.getElementById('lcp-hero')
    if (lcpHero) {
      lcpHero.style.opacity = '0'
      lcpHero.style.visibility = 'hidden'
    }
  }, [])

  const scrollToTarget = useCallback((elementId: string, duration = 1.15) => {
    const target = document.getElementById(elementId)
    if (!target) return
    const lenis = getLenis()
    if (lenis) {
      lenis.scrollTo(target, { duration })
    } else {
      target.scrollIntoView({ behavior: motionDisabled() ? 'auto' : 'smooth' })
    }
  }, [])

  const navigateToScene = useCallback(
    (sceneIndex: number) => {
      setAutoCinema(false)
      setCurtainOpen(true)
      const clamped = Math.max(0, Math.min(SCENE_IDS.length - 1, sceneIndex))
      const targetEl = document.getElementById(SCENE_IDS[clamped])
      if (!targetEl) return
      // Land cleanly in full focused framing at each 3D corridor station (Acts I..V)
      const top = targetEl.getBoundingClientRect().top + (window.scrollY || 0)
      const landingRatios = [0.10, 0.24, 0.24, 0.24, 0.24] as const
      const extraOffset = Math.round(targetEl.offsetHeight * (landingRatios[clamped] ?? 0))
      const lenis = getLenis()
      if (lenis) {
        lenis.scrollTo(top + extraOffset, { duration: 0.85 })
      } else {
        window.scrollTo({ top: top + extraOffset, behavior: motionDisabled() ? 'auto' : 'smooth' })
      }
    },
    [],
  )

  const navigateToApp = useCallback(() => {
    setAutoCinema(false)
    setCurtainOpen(true)
    scrollToTarget('blueprint', 1.2)
  }, [scrollToTarget])

  const startWithSound = async () => {
    setCurtainOpen(true)
    await soundEngine.enable()
    soundEngine.playCurtainOpen()
    if ((window.scrollY || 0) > 40) scrollToTarget('scene-1', 1.1)
  }

  const enterSilently = () => {
    setCurtainOpen(true)
    if ((window.scrollY || 0) > 40) scrollToTarget('scene-1', 1.1)
  }

  const editorialTheme: 'paper' | 'dark' = 'dark'

  return (
    <>
      <a className="skip-link" href="#story" onClick={() => setCurtainOpen(true)}>
        Bỏ qua màn mở đầu — Đến câu chuyện 3D
      </a>

      <CustomCursor />

      <HeaderNav
        activeScene={uiState.activeScene}
        inAppSection={uiState.inAppSection}
        curtainOpen={curtainOpen}
        autoCinema={autoCinema}
        editorialTheme={editorialTheme}
        onToggleAutoCinema={() => setAutoCinema((v) => !v)}
        onNavigateScene={navigateToScene}
        onNavigateApp={navigateToApp}
      />

      {/* Full-Viewport 100% Real-Time 3D WebGL Santioni Graphic Novel Stage */}
      <WorldStage3D
        getState={() => stateRef.current}
        onReady={handleStageReady}
        onFallbackChange={setStageFallback}
      />

      {/* Theatrical Prelude Ink Curtain Overlay */}
      {!curtainHidden && (
        <section
          id="hero"
          className="prelude-curtain"
          data-open={curtainOpen ? 'true' : 'false'}
          aria-hidden={curtainOpen}
          aria-labelledby="hero-title"
        >
          <div className="prelude-scrim" aria-hidden="true" />
          <div className="prelude-inner">
            <h1 id="hero-title" className="prelude-title">
              {HERO_COPY.headlineTop}
            </h1>

            <div className="prelude-center">
              <div className="prelude-emblem">
                <FerrumEmblemIcon size={34} />
              </div>

              <div className="prelude-actions">
                <button
                  type="button"
                  className="btn-primary"
                  data-magnetic
                  tabIndex={curtainOpen ? -1 : 0}
                  onClick={() => void startWithSound()}
                >
                  <PlayIcon size={14} />
                  <span>{HERO_COPY.ctaAudio}</span>
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  data-magnetic
                  tabIndex={curtainOpen ? -1 : 0}
                  onClick={enterSilently}
                >
                  <span>{HERO_COPY.ctaSilent}</span>
                </button>
              </div>
            </div>

            <div className="prelude-foot">
              <p className="prelude-subtitle-echo">{HERO_COPY.headlineBottom}</p>
              <p className="prelude-lead">{HERO_COPY.subhead}</p>
              <p className="prelude-hint">{HERO_COPY.hint}</p>
            </div>
          </div>
        </section>
      )}

      <main id="content">
        <ComicStoryTrack
          activeScene={uiState.activeScene}
          filmProgress={uiState.filmProgress}
          progress={uiState.progress}
          inAppSection={uiState.inAppSection}
          curtainOpen={curtainOpen}
          editorialTheme={editorialTheme}
          forceFallback={stageFallback}
          onJumpToBeat={navigateToScene}
          onJumpToApp={navigateToApp}
        />
        <Chapters />
      </main>
    </>
  )
}
