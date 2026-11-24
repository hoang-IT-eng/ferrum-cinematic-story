# FERRUM — Hành Lang Truyện Tranh Điện Ảnh 3D (5 Acts)

Trải nghiệm storytelling tương tác thời gian thực kết hợp **React 19**, **Three.js (custom GLSL shaders)**, **GSAP ScrollTrigger** và **Lenis** trong một hành lang phối cảnh kiến trúc 3D liên tục qua 5 hồi truyện (`I → V`).

## Điểm nổi bật kỹ thuật
- **Hành lang phối cảnh 3D thống nhất (Acts I → V):** Camera lướt liền mạch qua 26 cổng vòm brutalist dài 76 đơn vị cùng 5 biển mốc cột chạm khắc (`52 KG` → `64.5 KG`).
- **Tích hợp 6 video WebM/MP4 thời gian thực (`THREE.VideoTexture`):**
  - 5 ô Cut-In cận cảnh vòng lặp không tiếng (`960×480` tỷ lệ `2:1`) cho toàn bộ Acts I–V, nạp sẵn Acts I–II và warm lười Acts III–V với kỷ luật đơn luồng.
  - Tranh chính Hồi IV (`1280×720`) chạy video đẩy tạ đòn qua đầu đồng bộ với phản chiếu sàn đá ướt theo thời gian thực.
- **Living-Ink & Cinema Post-FX Shaders:**
  - Hiệu ứng thời tiết theo từng hồi (mưa mực chéo Act I, sương bụi phấn Act II, xung ánh sáng hổ phách Act III, luồng tàn lửa + rung chấn động Act IV, tia nắng khối God-Rays + phá khung IMAX tràn viền 100% ở Act V).
  - Hậu kỳ một lượt (`sceneRT` → `createCinemaPostFxMaterial`) xử lý bloom hổ phách chọn lọc, sắc sai vận tốc cầu nối và letterbox `2.39:1` động.
- **Auto-Cinema & Đồng bộ âm thanh Web Audio (`soundEngine`):** Nhịp tự chiếu theo tiến trình khung hình (`TỰ CHIẾU`) cùng bảng điều hướng Chapter Rail (`ferrum:scroll`).

## Chạy cục bộ

```bash
npm install
npm run dev
```

Kiểm tra type và build production:

```bash
npm run typecheck
npm run build
npm run preview
```
