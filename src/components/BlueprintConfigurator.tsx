import { useMemo, useState } from 'react'
import { computeFerrumBlueprint, type BlueprintInput } from '../content/story'
import { soundEngine } from '../motion/soundEngine'

/**
 * Real working Hardgainer Blueprint Configurator for Chapter III.
 * Calculates TDEE, Lean-Bulk surplus, exact P/C/F macros, 12-week trajectory curve,
 * and tailored Week-1 compound split dynamically from user biometrics.
 */
export function BlueprintConfigurator() {
  const [input, setInput] = useState<BlueprintInput>({
    weightKg: 52,
    heightCm: 172,
    daysPerWeek: 4,
    benchKg: 30,
  })

  const result = useMemo(() => computeFerrumBlueprint(input), [input])

  const update = <K extends keyof BlueprintInput>(key: K, value: BlueprintInput[K], pitch = 1) => {
    setInput((prev) => ({ ...prev, [key]: value }))
    soundEngine.playUiClick(pitch)
  }

  // Build SVG polyline coordinates for 12-week progress comparison
  const w = 540
  const h = 150
  const padX = 24
  const padY = 18
  const minW = Math.min(...result.weeklyWeights) - 0.8
  const maxW = Math.max(...result.weeklyWeights) + 0.8
  const scaleX = (idx: number) => padX + (idx / 12) * (w - padX * 2)
  const scaleY = (kg: number) => h - padY - ((kg - minW) / Math.max(0.5, maxW - minW)) * (h - padY * 2)

  const ferrumPoints = result.weeklyWeights.map((kg, idx) => `${scaleX(idx).toFixed(1)},${scaleY(kg).toFixed(1)}`).join(' ')
  const flatY = scaleY(input.weightKg).toFixed(1)
  const blindPoints = `24,${flatY} 140,${(Number(flatY) - 2).toFixed(1)} 280,${(Number(flatY) + 3).toFixed(1)} 420,${(Number(flatY) - 1).toFixed(1)} 516,${flatY}`

  return (
    <div className="config-grid">
      <div className="panel-box">
        <div className="field-group">
          <label className="field-label" htmlFor="cfg-weight">
            <span>Cân nặng hiện tại</span>
            <strong>{input.weightKg} kg</strong>
          </label>
          <input
            id="cfg-weight"
            className="range-slider"
            type="range"
            min={42}
            max={88}
            step={1}
            value={input.weightKg}
            onChange={(e) => update('weightKg', Number(e.target.value), 1.05)}
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="cfg-height">
            <span>Chiều cao</span>
            <strong>{input.heightCm} cm</strong>
          </label>
          <input
            id="cfg-height"
            className="range-slider"
            type="range"
            min={155}
            max={195}
            step={1}
            value={input.heightCm}
            onChange={(e) => update('heightCm', Number(e.target.value), 0.95)}
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="cfg-bench">
            <span>Mức tạ Đẩy ngực (Bench)</span>
            <strong>{input.benchKg} kg</strong>
          </label>
          <input
            id="cfg-bench"
            className="range-slider"
            type="range"
            min={20}
            max={100}
            step={2.5}
            value={input.benchKg}
            onChange={(e) => update('benchKg', Number(e.target.value), 1.12)}
          />
        </div>

        <div className="field-group" style={{ marginBottom: 0 }}>
          <span className="field-label">
            <span>Lịch tập khả dụng</span>
            <strong>{input.daysPerWeek} buổi / tuần</strong>
          </span>
          <div className="freq-tabs" role="group" aria-label="Số buổi tập mỗi tuần">
            {([3, 4, 5] as const).map((days) => (
              <button
                key={days}
                type="button"
                className="freq-btn"
                aria-pressed={input.daysPerWeek === days}
                onClick={() => update('daysPerWeek', days, 1.2)}
              >
                {days} Buổi
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="metrics-row" aria-live="polite">
          <div className="metric-cell">
            <small>Calo tăng cơ / ngày</small>
            <div className="metric-val accent" data-testid="cfg-calories">
              {result.targetCalories.toLocaleString('vi-VN')} kcal
            </div>
          </div>
          <div className="metric-cell">
            <small>Đạm / Bột / Béo</small>
            <div className="metric-val" data-testid="cfg-macros">
              {result.proteinG}P · {result.carbG}C · {result.fatG}F
            </div>
          </div>
          <div className="metric-cell">
            <small>Dự kiến sau 12 tuần</small>
            <div className="metric-val accent">+{result.projectedGain12W} kg</div>
          </div>
          <div className="metric-cell">
            <small>Mục tiêu Bench W12</small>
            <div className="metric-val">{result.projectedBench12W} kg</div>
          </div>
        </div>

        <div className="chart-box">
          <div className="chart-legend">
            <span style={{ color: 'var(--chalk-muted)' }}>--- Tập cảm tính (dậm chân {input.weightKg} kg)</span>
            <span style={{ color: 'var(--volt)' }}>
              ━━ Theo hệ thống FERRUM (đạt {result.weeklyWeights[12]} kg ở Tuần 12)
            </span>
          </div>
          <svg
            viewBox={`0 0 ${w} ${h}`}
            width="100%"
            height="150"
            role="img"
            aria-label={`Biểu đồ dự báo cân nặng 12 tuần từ ${input.weightKg} kg lên ${result.weeklyWeights[12]} kg`}
          >
            <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="#2a2d33" strokeWidth="1" />
            <polyline
              fill="none"
              stroke="#787d87"
              strokeWidth="2"
              strokeDasharray="6 6"
              points={blindPoints}
            />
            <polyline fill="none" stroke="#d98a3c" strokeWidth="3" points={ferrumPoints} />
            <circle cx={scaleX(0)} cy={scaleY(input.weightKg)} r="4" fill="#f4f0e8" />
            <circle cx={scaleX(12)} cy={scaleY(result.weeklyWeights[12])} r="5" fill="#d98a3c" />
          </svg>
        </div>

        <h3 className="split-summary-title">{result.splitTitle}</h3>
        <div className="split-grid">
          {result.weekOneSample.map((day) => (
            <div key={day.day} className="day-card">
              <h3>{day.day}</h3>
              <p className="day-focus">{day.focus}</p>
              {day.exercises.map((ex) => (
                <div key={ex.name} className="ex-row">
                  <span>{ex.name}</span>
                  <span className="ex-meta">
                    {ex.setsReps} · {ex.loadKg} · {ex.rpe}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
