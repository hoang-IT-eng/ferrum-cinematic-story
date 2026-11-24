import { useEffect, useRef } from 'react'
import { BlueprintConfigurator } from '../components/BlueprintConfigurator'
import { TURNING_POINT } from '../content/story'
import { afterIdle, motionDisabled } from '../motion/motion'
import { soundEngine } from '../motion/soundEngine'

export function InteractiveAppChapter() {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || motionDisabled()) return
    let killed = false
    let cleanupTrigger: (() => void) | undefined

    const cancelIdle = afterIdle(() => {
      void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
        ([{ default: gsap }, { ScrollTrigger }]) => {
          if (killed) return
          gsap.registerPlugin(ScrollTrigger)
          const st = ScrollTrigger.create({
            trigger: el,
            start: 'top 65%',
            end: 'bottom 35%',
            onEnter: () => soundEngine.setAct(4),
          })
          cleanupTrigger = () => st.kill()
        },
      )
    })

    return () => {
      killed = true
      cancelIdle()
      cleanupTrigger?.()
    }
  }, [])

  return (
    <section id="blueprint" ref={ref} className="config-section" aria-labelledby="bp-title">
      <div className="config-container">
        <h2 id="bp-title" className="section-heading">
          Nhập chỉ số hiện tại. Xem giáo án tăng cơ 12 tuần của chính bạn.
        </h2>
        <p className="section-lead" style={{ maxWidth: '64ch' }}>
          Đây chính là hệ thống đã đưa cậu thanh niên 52 kg thoát khỏi tám tháng tập mù: tự tính thặng dư calo sạch,
          từng gram Đạm và lịch tăng tải lũy tiến từng hiệp tạ.
        </p>

        <div className="app-pillars-strip" aria-label="Ba nguyên lý tăng cơ cốt lõi của FERRUM">
          {TURNING_POINT.pillars.map((p) => (
            <div key={p.index} className="app-pillar-mini">
              <span className="pillar-idx">{p.index}</span>
              <div>
                <h3>{p.title}</h3>
                <p>{p.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <BlueprintConfigurator />
      </div>
    </section>
  )
}
