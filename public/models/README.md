# Thư mục Drop-in Nhân vật Mixamo 3D cho FERRUM

Engine 3D tự động hỗ trợ nạp nhân vật `.fbx` hoặc `.glb` tải miễn phí từ **mixamo.com** (không cần qua Blender) và tự động bọc bộ shader mực khắc **8 FPS + viền Ink Inverted-Hull**, đồng thời khóa chuyển động xương theo con lăn chuột.

### Cách nâng cấp nhân vật Mixamo trong 5 phút

1. Vào [https://www.mixamo.com](https://www.mixamo.com) (đăng nhập miễn phí).
2. Chọn nhân vật nam trẻ gầy hoặc bình thường (ví dụ: *Remy*, *Y Bot*, *Adam*), tải các animation sau định dạng **FBX Binary (.fbx)**, Skin: **With Skin**, **30 fps**:
   - `boy-sad.fbx`: tìm animation `"Sad Idle"` hoặc `"Defeated"` (Hồi I)
   - `boy-strain.fbx`: tìm animation `"Lifting Heavy"` hoặc `"Heavy Effort"` (Hồi II)
   - `boy-press.fbx`: tìm animation `"Overhead Press"` hoặc `"Victory"` (Hồi IV)
   - `boy-walk.fbx`: tìm animation `"Walking Up Stairs"` hoặc `"Walking"` (Hồi V — chọn nhân vật cơ bắp hơn hoặc giữ cùng nhân vật)
3. Chép các file `.fbx` vào thư mục này (`public/models/`) và khai báo trong `manifest.json`:

```json
{
  "models": {
    "act1": { "file": "boy-sad.fbx", "tone": "parchment" },
    "act2": { "file": "boy-strain.fbx", "tone": "parchment" },
    "act4": { "file": "boy-press.fbx", "tone": "charcoal" },
    "act5": { "file": "boy-walk.fbx", "tone": "charcoal" }
  }
}
```

Tải lại trang là các nhân vật Mixamo sẽ tự động thay thế và khớp đồng bộ với góc máy 3D!
