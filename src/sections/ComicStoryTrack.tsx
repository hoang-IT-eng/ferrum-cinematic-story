import { useMemo, type CSSProperties } from 'react'
import { ArrowDownIcon } from '../components/Icons'
import { FILM_SCENES } from '../content/story'
import { canAttemptWebGL, prefersReducedMotion } from '../motion/motion'
import { soundEngine } from '../motion/soundEngine'

export interface ComicStoryTrackProps {
  activeScene: number // 0..4
  filmProgress: number // 0..4 continuous scroll position
  progress: number // 0..1 across 5 acts
  inAppSection: boolean
  curtainOpen: boolean
  editorialTheme?: 'paper' | 'dark'
  forceFallback?: boolean
  onJumpToBeat: (sceneIndex: number) => void
  onJumpToApp: () => void
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export function ComicStoryTrack({
  activeScene,
  filmProgress,
  progress,
  inAppSection,
  curtainOpen,
  editorialTheme = 'dark',
  forceFallback = false,
  onJumpToBeat,
  onJumpToApp,
}: ComicStoryTrackProps) {
  // Show static accessible composite fallback ONLY when OS requests reduced motion or WebGL fails
  const reduced =
    forceFallback || (typeof window !== 'undefined' && (prefersReducedMotion() || !canAttemptWebGL()))

  const tokenizedScenes = useMemo(
    () => FILM_SCENES.map((beat) => ({ ...beat, words: beat.body.split(' ') })),
    [],
  )

  // Fade captions smoothly during all 4 open colonnade flights so portals stay unobstructed
  const inSpatialBridge =
    !reduced &&
    ((filmProgress > 0.48 && filmProgress < 1.02) ||
      (filmProgress > 1.52 && filmProgress < 2.02) ||
      (filmProgress > 2.52 && filmProgress < 3.02) ||
      (filmProgress > 3.52 && filmProgress < 4.02))

  return (
    <div
      id="story"
      className="comic-story-track"
      data-active-scene={String(activeScene)}
      data-curtain-open={curtainOpen ? 'true' : 'false'}
      aria-hidden={!curtainOpen}
    >
      {/* Naked Right-Edge Ink Thread Scrubber */}
      {curtainOpen && (
        <aside
          className="chapter-rail"
          data-in-app={inAppSection ? 'true' : 'false'}
          data-theme={editorialTheme}
          aria-label="Dòng thời gian 5 hồi truyện 2.5D"
        >
          <div className="rail-track" aria-hidden="true">
            <span
              className="rail-fill"
              style={{ transform: `scaleY(${Math.max(0.03, Math.min(1, progress))})` }}
            />
          </div>

          <ol className="rail-stops">
            {FILM_SCENES.map((beat) => {
              const isCurrent = !inAppSection && activeScene === beat.index
              return (
                <li key={beat.id}>
                  <button
                    type="button"
                    className="rail-stop-btn"
                    data-active={isCurrent ? 'true' : 'false'}
                    data-amber={beat.index >= 2 ? 'true' : 'false'}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-label={`Chuyển đến hồi ${beat.roman}: ${beat.shortLabel}`}
                    onClick={() => {
                      soundEngine.playUiClick(1 + beat.index * 0.06)
                      onJumpToBeat(beat.index)
                    }}
                  >
                    <span className="rail-label">{beat.shortLabel}</span>
                    <span className="rail-roman">{beat.roman}</span>
                  </button>
                </li>
              )
            })}
            <li>
              <button
                type="button"
                className="rail-stop-btn"
                data-active={inAppSection ? 'true' : 'false'}
                data-amber="true"
                aria-current={inAppSection ? 'step' : undefined}
                aria-label="Chuyển xuống giáo án FERRUM"
                onClick={() => {
                  soundEngine.playUiClick(1.3)
                  onJumpToApp()
                }}
              >
                <span className="rail-label">App</span>
                <span className="rail-roman">APP</span>
              </button>
            </li>
          </ol>
        </aside>
      )}

      {/* Fullscreen Sticky Cinema Subtitle Overlay — floats unobtrusively without shrinking the 100vw x 100vh stage */}
      {!reduced && (
        <div
          className="cinema-subtitle-stage"
          data-hidden={inAppSection ? 'true' : 'false'}
          data-theme={editorialTheme}
        >
          <div className="film-lower-scrim" aria-hidden="true" />
          <div className="film-beat-inner">
            <div className="cinema-caption-stack">
              {tokenizedScenes.map((beat) => {
                const isCurrent = !inAppSection && activeScene === beat.index && !inSpatialBridge
                const isAmber = beat.index >= 2
                const alignRight = beat.index === 2
                const localWordProgress =
                  beat.index === 0
                    ? clamp01(filmProgress / 0.42)
                    : clamp01((filmProgress - (beat.index + 0.04)) / 0.46)
                const karaokeSweep = 0.25 + localWordProgress * 1.15
                const captionX =
                  beat.index === 0
                    ? localWordProgress * 32
                    : beat.index === 1
                      ? (1 - localWordProgress) * 32
                      : beat.index === 2
                        ? (1 - localWordProgress) * -28
                        : 0

                return (
                  <article
                    key={beat.id}
                    className="cinema-caption-block"
                    data-active={isCurrent ? 'true' : 'false'}
                    data-amber={isAmber ? 'true' : 'false'}
                    data-align={alignRight ? 'right' : 'left'}
                    aria-hidden={!isCurrent}
                    style={{ '--caption-x': `${captionX.toFixed(1)}px` } as CSSProperties}
                  >
                    <div className="cinema-index-line cinema-index-minimal">
                      <span className="cinema-num">{`0${beat.index + 1}`}</span>
                      <span className="cinema-hairline" aria-hidden="true" />
                    </div>

                    <h2 id={`${beat.id}-title`} className="cinema-beat-title">
                      {beat.line}
                    </h2>

                    <p className="cinema-subtitles" aria-label={beat.body}>
                      {beat.words.map((word, wIdx) => {
                        const wordPos = wIdx / Math.max(1, beat.words.length - 1)
                        const lit = karaokeSweep >= wordPos
                        const currentWord = isCurrent && Math.abs(karaokeSweep - wordPos) < 0.085
                        return (
                          <span
                            key={wIdx}
                            className="karaoke-word"
                            data-lit={lit ? 'true' : 'false'}
                            data-lead={currentWord ? 'true' : 'false'}
                          >
                            {word}{' '}
                          </span>
                        )
                      })}
                    </p>

                    {beat.index === tokenizedScenes.length - 1 && (
                      <div className="cinema-cta-row">
                        <button
                          type="button"
                          className="btn-primary"
                          data-magnetic
                          onClick={() => {
                            soundEngine.playUiClick(1.2)
                            onJumpToApp()
                          }}
                        >
                          <span>Khám phá giáo án FERRUM</span>
                          <ArrowDownIcon size={14} />
                        </button>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Scroll Runway Anchors (2.5D Camera Scrubbing + Fluid Ink Wipe Intervals) */}
      <div className={reduced ? 'reduced-story-list' : 'comic-beat-anchors'}>
        {tokenizedScenes.map((beat) => (
          <section
            key={beat.id}
            id={beat.id}
            className={reduced ? 'reduced-beat-section' : `comic-beat comic-beat-${beat.index}`}
            data-comic-act={String(beat.index)}
            data-amber={beat.index >= 2 ? 'true' : 'false'}
            aria-labelledby={reduced ? `${beat.id}-reduced-title` : `${beat.id}-title`}
          >
            {reduced && (
              <div
                className="reduced-diorama-stage"
                data-paper-act="true"
              >
                <div className="reduced-frame-wrap">
                  <img
                    src={`/diorama/act-${beat.index + 1}/main.webp`}
                    alt={`${beat.line} — ${beat.shortLabel}`}
                    className="reduced-layer-main"
                  />
                </div>
                <img
                  src={`/diorama/act-${beat.index + 1}/cutin.webp`}
                  alt=""
                  className={`reduced-layer-cutin ${beat.index % 2 === 0 ? 'cutin-right' : 'cutin-left'}`}
                />

                <div className="film-lower-scrim" aria-hidden="true" />
                <div className="reduced-caption-wrap">
                  <div className="cinema-index-line cinema-index-minimal">
                    <span className="cinema-num">{`0${beat.index + 1}`}</span>
                    <span className="cinema-hairline" aria-hidden="true" />
                  </div>
                  <h2 id={`${beat.id}-reduced-title`} className="cinema-beat-title">
                    {beat.line}
                  </h2>
                  <p className="cinema-subtitles reduced-sub">{beat.body}</p>
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
