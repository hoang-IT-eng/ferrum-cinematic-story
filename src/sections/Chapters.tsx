import { InteractiveAppChapter } from './InteractiveAppChapter'
import { FinalCtaFooter } from './FinalCtaFooter'

export default function Chapters() {
  return (
    <div className="app-after-film">
      {/* Authored Torn-Ink Engraving Edge transitioning out of Act V Daylight */}
      <div className="torn-ink-bridge" aria-hidden="true">
        <svg viewBox="0 0 1440 84" preserveAspectRatio="none" className="torn-ink-svg">
          <path
            d="M0,48 L48,38 L112,54 L188,28 L272,44 L348,22 L430,49 L518,30 L604,52 L696,19 L782,42 L864,25 L948,47 L1038,24 L1124,45 L1210,27 L1298,50 L1378,31 L1440,42 L1440,84 L0,84 Z"
            fill="#0c0d0f"
          />
          <path
            d="M0,48 L48,38 L112,54 L188,28 L272,44 L348,22 L430,49 L518,30 L604,52 L696,19 L782,42 L864,25 L948,47 L1038,24 L1124,45 L1210,27 L1298,50 L1378,31 L1440,42"
            fill="none"
            stroke="#d98a3c"
            strokeOpacity="0.55"
            strokeWidth="1.2"
          />
        </svg>
      </div>

      <InteractiveAppChapter />
      <FinalCtaFooter />
    </div>
  )
}
