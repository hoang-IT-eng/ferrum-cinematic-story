import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRightIcon, CloseIcon } from '../components/Icons'
import { soundEngine } from '../motion/soundEngine'

export function FinalCtaFooter() {
  const [modalOpen, setModalOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [email, setEmail] = useState('')
  const [goalKg, setGoalKg] = useState('64')

  useEffect(() => {
    if (!modalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    soundEngine.playChapterSwell()
    setSubmitted(true)
  }

  return (
    <footer className="cta-footer" aria-labelledby="cta-title">
      <div className="cta-box">
        <h2 id="cta-title" className="section-heading">
          Đừng đợi thêm một năm đứng ngoài cuộc.
        </h2>
        <p className="section-lead" style={{ marginInline: 'auto', maxWidth: '54ch' }}>
          Biến mọi buổi tập thành dữ liệu tiến bộ đo được từng kilogram cùng FERRUM. Khởi tạo giáo án cá nhân cho
          12 tuần đầu tiên ngay hôm nay.
        </p>

        <button
          type="button"
          className="btn-primary"
          data-magnetic
          onClick={() => {
            soundEngine.playUiClick(1.15)
            setSubmitted(false)
            setModalOpen(true)
          }}
        >
          <span>Kích hoạt lộ trình FERRUM miễn phí</span>
          <ArrowRightIcon size={14} />
        </button>
      </div>

      <div className="footer-bar">
        <span>FERRUM · Kỷ Luật Thép &amp; Cơ Sinh Học Tăng Cơ</span>
        <span>Nguyên bản bởi FERRUM Studio · Interactive WebGL Cinema · 2026</span>
      </div>

      {modalOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-heading"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false)
          }}
        >
          <div className="modal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span className="modal-tag">KHỞI TẠO HỒ SƠ FERRUM</span>
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: '6px 12px' }}
                onClick={() => setModalOpen(false)}
                aria-label="Đóng hộp thoại"
              >
                <span>Đóng</span>
                <CloseIcon size={13} />
              </button>
            </div>

            {submitted ? (
              <div>
                <h3 id="modal-heading" className="panel-line" style={{ fontSize: '1.8rem' }}>
                  Lộ trình 12 tuần đã sẵn sàng.
                </h3>
                <p className="panel-body">
                  Chúng tôi đã lưu mục tiêu <strong>{goalKg} kg</strong> cho tài khoản{' '}
                  <strong>{email}</strong>. Chúc bạn giữ vững nhịp tăng tải kỷ luật ngay từ buổi tập đầu tiên.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h3 id="modal-heading" className="panel-line" style={{ fontSize: '1.75rem' }}>
                  Nhận bản giáo án tuần đầu vào App
                </h3>
                <div className="field-group">
                  <label className="field-label" htmlFor="lead-email">
                    <span>Email nhận tài khoản FERRUM</span>
                  </label>
                  <input
                    id="lead-email"
                    type="email"
                    required
                    placeholder="ban@vidu.vn"
                    className="modal-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="lead-goal">
                    <span>Cân nặng mục tiêu (kg)</span>
                  </label>
                  <input
                    id="lead-goal"
                    type="number"
                    min={45}
                    max={110}
                    className="modal-input"
                    value={goalKg}
                    onChange={(e) => setGoalKg(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  <span>Xác nhận tạo giáo án</span>
                  <ArrowRightIcon size={14} />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </footer>
  )
}
