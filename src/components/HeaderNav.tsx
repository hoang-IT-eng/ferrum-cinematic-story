import { useEffect, useState } from 'react'
import { ACT_LABELS, soundEngine, type SoundState } from '../motion/soundEngine'
import {
  CloseIcon,
  FerrumEmblemIcon,
  MenuIndexIcon,
  PauseIcon,
  PlayIcon,
  SlidersIcon,
  SoundWaveIcon,
} from './Icons'

export interface HeaderNavProps {
  activeScene: number
  inAppSection: boolean
  curtainOpen: boolean
  autoCinema: boolean
  editorialTheme?: 'paper' | 'dark'
  onToggleAutoCinema: () => void
  onNavigateScene: (sceneIndex: number) => void
  onNavigateApp: () => void
}

const CHAPTER_DRAWER_ITEMS = [
  { id: 'scene-1', index: 0, roman: 'I', label: 'Chỉ trỏ', desc: 'Ánh nhìn & lời chê bai sau lưng' },
  { id: 'scene-2', index: 1, roman: 'II', label: 'Bế tắc', desc: 'Tám tháng mồ hôi, cân nặng dậm chân' },
  { id: 'scene-3', index: 2, roman: 'III', label: 'Mở App', desc: 'Khoảnh khắc ngừng tập mù cùng FERRUM' },
  { id: 'scene-4', index: 3, roman: 'IV', label: 'Bứt phá', desc: 'Tăng tải lũy tiến phá vỡ giới hạn cũ' },
  { id: 'scene-5', index: 4, roman: 'V', label: 'Lột xác', desc: '180 ngày kỷ luật bước ra ánh sáng' },
] as const

export function HeaderNav({
  activeScene,
  inAppSection,
  curtainOpen,
  autoCinema,
  editorialTheme = 'dark',
  onToggleAutoCinema,
  onNavigateScene,
  onNavigateApp,
}: HeaderNavProps) {
  const [sound, setSound] = useState<SoundState>(() => soundEngine.getState())
  const [mixOpen, setMixOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    return soundEngine.subscribe(setSound)
  }, [])

  useEffect(() => {
    if (!drawerOpen && !mixOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false)
        setMixOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, mixOpen])

  const isPlaying = sound.enabled && !sound.muted

  return (
    <>
      <header
        className="site-header"
        data-curtain-open={curtainOpen ? 'true' : 'false'}
        data-theme={editorialTheme}
        role="banner"
      >
        <a
          href="#scene-1"
          className="brand-mark"
          aria-label="FERRUM Interactive Cinema — Về hồi đầu"
          onClick={(e) => {
            e.preventDefault()
            setDrawerOpen(false)
            onNavigateScene(0)
          }}
        >
          <FerrumEmblemIcon size={16} className="brand-emblem" />
          <span>FERRUM</span>
        </a>

        <div className="header-controls">
          <button
            type="button"
            className="cinema-ctrl-btn"
            aria-expanded={drawerOpen}
            aria-label="Mở mục lục 5 hồi phim"
            data-magnetic
            onClick={() => {
              soundEngine.playUiClick(1.05)
              setMixOpen(false)
              setDrawerOpen((v) => !v)
            }}
          >
            <MenuIndexIcon size={14} />
            <span>Chương</span>
          </button>

          {curtainOpen && (
            <button
              type="button"
              className="cinema-ctrl-btn"
              aria-pressed={autoCinema}
              aria-label={autoCinema ? 'Tạm dừng tự động chiếu phim' : 'Bật chế độ tự động chiếu phim'}
              data-active={autoCinema ? 'true' : 'false'}
              data-magnetic
              onClick={() => {
                soundEngine.playUiClick(1.12)
                onToggleAutoCinema()
              }}
            >
              {autoCinema ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
              <span className="ctrl-label-desktop">{autoCinema ? 'Đang chiếu' : 'Tự chiếu'}</span>
            </button>
          )}

          <div className="audio-hud-wrap">
            <div className="audio-hud" data-playing={isPlaying ? 'true' : 'false'}>
              <button
                type="button"
                className="audio-btn"
                onClick={() => void soundEngine.toggle()}
                aria-label={isPlaying ? 'Tắt âm thanh gốc và nhạc nền' : 'Bật âm thanh gốc và nhạc nền'}
                aria-pressed={isPlaying}
                data-magnetic
              >
                <SoundWaveIcon size={14} muted={!isPlaying} />
                <span className="audio-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                <span className="audio-status-label">
                  {isPlaying ? ACT_LABELS[sound.act] : 'Âm thanh'}
                </span>
              </button>

              {sound.enabled && (
                <button
                  type="button"
                  className="audio-mix-toggle"
                  aria-expanded={mixOpen}
                  aria-label="Cân bằng tiếng gốc và nhạc nền"
                  onClick={() => {
                    soundEngine.playUiClick(1.1)
                    setDrawerOpen(false)
                    setMixOpen((v) => !v)
                  }}
                >
                  <SlidersIcon size={13} />
                  <span className="ctrl-label-desktop">Mix</span>
                </button>
              )}
            </div>

            {sound.enabled && mixOpen && (
              <div className="audio-mix-popover" role="region" aria-label="Bộ trộn âm thanh">
                <label className="mix-row">
                  <span>Âm lượng tổng ({Math.round(sound.volume * 100)}%)</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={sound.muted ? 0 : sound.volume}
                    onChange={(e) => soundEngine.setVolume(Number(e.target.value))}
                    className="audio-vol"
                    aria-label="Âm lượng tổng"
                  />
                </label>
                <label className="mix-row">
                  <span>Hiệu ứng 3D Foley ({Math.round(sound.sfxLevel * 100)}%)</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={sound.sfxLevel}
                    onChange={(e) => soundEngine.setSfxLevel(Number(e.target.value))}
                    className="audio-vol"
                    aria-label="Âm lượng hiệu ứng 3D Foley"
                  />
                </label>
                <label className="mix-row">
                  <span>Nhạc nền 5 hồi ({Math.round(sound.musicLevel * 100)}%)</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={sound.musicLevel}
                    onChange={(e) => soundEngine.setMusicLevel(Number(e.target.value))}
                    className="audio-vol"
                    aria-label="Âm lượng nhạc nền"
                  />
                </label>
                <button
                  type="button"
                  className="mix-quick-btn"
                  onClick={() => {
                    soundEngine.playUiClick(1.05)
                    soundEngine.setMusicLevel(sound.musicLevel > 0.05 ? 0 : 0.55)
                  }}
                >
                  {sound.musicLevel > 0.05 ? 'Tắt nhạc nền (chỉ hiệu ứng Foley)' : 'Khôi phục nhạc nền (55%)'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Full-Bleed Editorial Chapter Index Drawer */}
      {drawerOpen && (
        <div
          className="chapter-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Mục lục 5 hồi phim FERRUM"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false)
          }}
        >
          <div className="chapter-drawer-inner">
            <div className="drawer-top">
              <span className="drawer-label">MỤC LỤC PHIM TƯƠNG TÁC</span>
              <button
                type="button"
                className="cinema-ctrl-btn"
                aria-label="Đóng mục lục"
                onClick={() => setDrawerOpen(false)}
              >
                <CloseIcon size={14} />
                <span>Đóng</span>
              </button>
            </div>

            <nav aria-label="Chọn hồi để xem">
              <ol className="drawer-list">
                {CHAPTER_DRAWER_ITEMS.map((item) => {
                  const isCurrent = !inAppSection && activeScene === item.index
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="drawer-item"
                        data-active={isCurrent ? 'true' : 'false'}
                        data-amber={item.index >= 2 ? 'true' : 'false'}
                        onClick={() => {
                          soundEngine.playUiClick(1 + item.index * 0.06)
                          setDrawerOpen(false)
                          onNavigateScene(item.index)
                        }}
                      >
                        <span className="drawer-roman">{item.roman}</span>
                        <span className="drawer-title-group">
                          <strong>{item.label}</strong>
                          <small>{item.desc}</small>
                        </span>
                      </button>
                    </li>
                  )
                })}
                <li>
                  <button
                    type="button"
                    className="drawer-item drawer-item-app"
                    data-active={inAppSection ? 'true' : 'false'}
                    data-amber="true"
                    onClick={() => {
                      soundEngine.playUiClick(1.3)
                      setDrawerOpen(false)
                      onNavigateApp()
                    }}
                  >
                    <span className="drawer-roman">VI</span>
                    <span className="drawer-title-group">
                      <strong>Giáo án FERRUM 12 Tuần</strong>
                      <small>Tính calo sạch &amp; mức tăng tải cho cơ địa của bạn</small>
                    </span>
                  </button>
                </li>
              </ol>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
