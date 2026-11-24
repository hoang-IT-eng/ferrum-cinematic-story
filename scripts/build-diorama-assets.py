#!/usr/bin/env python3
"""
Builds 4-layer 2.5D Graphic-Novel Diorama assets from bespoke European ink-wash art:
  public/diorama/raw/act{N}_{bg,hero_chroma,cutin}.jpg
    -> public/diorama/act-{N}/{bg,hero,depth,hero-depth,cutin}.webp
    + QA proof sheets (act{N}_hero_qa_dark.png)
"""

import argparse
from pathlib import Path
import sys

import cv2
import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "public" / "diorama" / "raw"
OUT_ROOT = ROOT / "public" / "diorama"

TARGET_W = 1600
TARGET_H = 900
DEPTH_W = 768
DEPTH_H = 432
CUTIN_W = 960
CUTIN_H = 436


def center_crop_aspect(img_bgr: np.ndarray, aspect: float, trim_pct: float = 0.015) -> np.ndarray:
    h, w = img_bgr.shape[:2]
    tx = int(w * trim_pct)
    ty = int(h * trim_pct)
    trimmed = img_bgr[ty : h - ty, tx : w - tx]
    th, tw = trimmed.shape[:2]
    cur = tw / max(1, th)
    if cur > aspect:
        new_w = int(round(th * aspect))
        x0 = (tw - new_w) // 2
        return trimmed[:, x0 : x0 + new_w]
    else:
        new_h = int(round(tw / aspect))
        y0 = (th - new_h) // 2
        return trimmed[y0 : y0 + new_h, :]


def extract_chroma_hero(img_bgr: np.ndarray) -> np.ndarray:
    """Cleanly keys pure green (#00FF00) background with despill & dark-ink edge preservation."""
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    h_ch = hsv[:, :, 0]
    s_ch = hsv[:, :, 1]

    rgb_f = img_bgr[:, :, ::-1].astype(np.float32) / 255.0
    r, g, b = rgb_f[:, :, 0], rgb_f[:, :, 1], rgb_f[:, :, 2]
    max_rb = np.maximum(r, b)
    excess = g - max_rb

    # Detect pure green & anti-aliased dark-ink-over-green edges cleanly (including closed arm/leg loops)
    green_hue = (h_ch >= 32) & (h_ch <= 96) & (s_ch >= 34)
    raw_bg_score = np.where(green_hue, np.clip((excess - 0.04) / 0.18, 0.0, 1.0), 0.0)
    # Any green-dominant chroma background (even slightly darker shadow/JPEG noise) keys cleanly to 0
    pure_screen = raw_bg_score * np.clip((0.42 - max_rb) / 0.24, 0.0, 1.0)
    alpha = 1.0 - np.clip(pure_screen, 0.0, 1.0)
    # Snap strict green-background pixels with negligible non-green luminance to exact 0 alpha
    hard_bg = green_hue & (excess > 0.11) & (max_rb < 0.28)
    alpha = np.where(hard_bg, 0.0, alpha)

    alpha_u8 = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    alpha_u8 = cv2.morphologyEx(alpha_u8, cv2.MORPH_OPEN, kernel, iterations=1)
    # Keep solid opaque ink core while feathering outer 1px cleanly without tinting outer background
    alpha_f = cv2.GaussianBlur(alpha_u8.astype(np.float32) / 255.0, (3, 3), 0.55)
    alpha_f = np.where((alpha_u8 == 0) | (alpha_f < 0.14), 0.0, np.clip((alpha_f - 0.08) / 0.92, 0.0, 1.0))

    # Despill green reflection everywhere + darken lifted green fringe on boundary dark contours
    g_clean = np.minimum(g, max_rb * 0.94)
    edge_band = ((alpha_f > 0.02) & (alpha_f < 0.96)).astype(np.float32)
    decon_scale = 1.0 - edge_band * np.clip(excess * 1.4, 0.0, 0.65)

    r_out = np.clip(r * decon_scale, 0.0, 1.0)
    g_out = np.clip(g_clean * decon_scale, 0.0, 1.0)
    b_out = np.clip(b * decon_scale, 0.0, 1.0)

    rgba = np.dstack([
        (r_out * 255.0).astype(np.uint8),
        (g_out * 255.0).astype(np.uint8),
        (b_out * 255.0).astype(np.uint8),
        np.clip(alpha_f * 255.0, 0, 255).astype(np.uint8),
    ])
    return rgba


def compose_hero_16x9(rgba: np.ndarray, act_num: int) -> np.ndarray:
    """Places tightly bounded hero RGBA cleanly inside 1600x900 canvas ready for WebGL popOut."""
    ys, xs = np.where(rgba[:, :, 3] > 24)
    if len(xs) == 0 or len(ys) == 0:
        raise RuntimeError(f"Empty alpha mask for act {act_num} hero")

    crop = rgba[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    ch, cw = crop.shape[:2]

    canvas = np.zeros((TARGET_H, TARGET_W, 4), dtype=np.uint8)
    if act_num == 1:
        # Stand centered, filling ~91% vertical height anchored flush to bottom (head near top ~9% for popOut!)
        target_h = int(TARGET_H * 0.91)
        scale = target_h / ch
        new_w = int(round(cw * scale))
        resized = cv2.resize(crop, (new_w, target_h), interpolation=cv2.INTER_AREA)
        x0 = (TARGET_W - new_w) // 2
        y0 = TARGET_H - target_h
        canvas[y0 : y0 + target_h, x0 : x0 + new_w] = resized
    else:
        # Fit barbell wide (~88% width) and anchor bottom-center (head up high near top ~9%)
        scale = min((TARGET_W * 0.89) / cw, (TARGET_H * 0.90) / ch)
        new_w = int(round(cw * scale))
        new_h = int(round(ch * scale))
        resized = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_AREA)
        x0 = (TARGET_W - new_w) // 2
        y0 = TARGET_H - new_h - 6
        canvas[y0 : y0 + new_h, x0 : x0 + new_w] = resized

    return canvas


def infer_smooth_depth(
    pil_rgb: Image.Image,
    processor: AutoImageProcessor,
    model: AutoModelForDepthEstimation,
    device: str,
    alpha_mask_768: np.ndarray | None = None,
) -> np.ndarray:
    inputs = processor(images=pil_rgb, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.inference_mode():
        if device == "cuda":
            with torch.autocast(device_type="cuda", dtype=torch.float16):
                pred = model(**inputs).predicted_depth
        else:
            pred = model(**inputs).predicted_depth

        interp = torch.nn.functional.interpolate(
            pred.unsqueeze(1).float(),
            size=(DEPTH_H, DEPTH_W),
            mode="bicubic",
            align_corners=False,
        ).squeeze(1)
    raw = interp[0].cpu().numpy()
    raw = np.nan_to_num(raw, nan=0.0, posinf=0.0, neginf=0.0)

    if alpha_mask_768 is not None:
        fg = alpha_mask_768 > 0.35
        # Erode 4px inward before nearest-neighbor extrapolation so dilated rim takes interior depth cleanly
        fg_core = cv2.erode(fg.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
        if not np.any(fg_core):
            fg_core = fg
        vals = raw[fg_core] if np.any(fg_core) else raw.ravel()
        lo = float(np.percentile(vals, 3.0))
        hi = float(np.percentile(vals, 97.0))
        span = max(1e-4, hi - lo)
        # Hero pixels carry high foreground depth [0.45 .. 1.0]
        norm = 0.45 + 0.55 * np.clip((raw - lo) / span, 0.0, 1.0)
        # Nearest-neighbor Voronoi dilation from interior core mask outward 28px
        if np.any(fg_core):
            from scipy.ndimage import distance_transform_edt

            dists, nearest_idx = distance_transform_edt(~fg_core, return_indices=True)
            filled = norm[nearest_idx[0], nearest_idx[1]]
            norm = np.where(dists <= 28.0, filled, 0.35)
        u8 = np.clip(norm * 255.0, 0, 255).astype(np.uint8)
        u8 = cv2.GaussianBlur(u8, (15, 15), 5.2)
        return u8

    lo = float(np.percentile(raw, 2.0))
    hi = float(np.percentile(raw, 98.0))
    span = max(1e-4, hi - lo)
    norm = np.clip((raw - lo) / span, 0.0, 1.0)
    u8 = np.clip(norm * 255.0, 0, 255).astype(np.uint8)
    u8 = cv2.bilateralFilter(u8, d=11, sigmaColor=36, sigmaSpace=9)
    u8 = cv2.GaussianBlur(u8, (21, 21), 7.5)
    return u8


def build_spatial_act(
    act_num: int,
    processor: AutoImageProcessor,
    model: AutoModelForDepthEstimation,
    device: str,
) -> None:
    out_dir = OUT_ROOT / f"act-{act_num}"
    out_dir.mkdir(parents=True, exist_ok=True)

    main_path = RAW_DIR / f"act{act_num}_main.jpg"
    main_bgr = cv2.imread(str(main_path), cv2.IMREAD_COLOR)
    if main_bgr is None:
        raise FileNotFoundError(main_path)

    main_crop = center_crop_aspect(main_bgr, TARGET_W / TARGET_H, trim_pct=0.012)
    main_resized = cv2.resize(main_crop, (TARGET_W, TARGET_H), interpolation=cv2.INTER_AREA)
    main_rgb = cv2.cvtColor(main_resized, cv2.COLOR_BGR2RGB)
    main_pil = Image.fromarray(main_rgb, mode="RGB")
    main_pil.save(out_dir / "main.webp", format="WEBP", quality=90, method=6)

    main_depth = infer_smooth_depth(main_pil, processor, model, device)
    Image.fromarray(main_depth, mode="L").save(out_dir / "main-depth.webp", format="WEBP", quality=88, method=6)

    cutin_out = out_dir / "cutin.webp"
    cutin_path = RAW_DIR / f"act{act_num}_cutin.jpg"
    if not cutin_out.exists() and cutin_path.exists():
        cut_bgr = cv2.imread(str(cutin_path), cv2.IMREAD_COLOR)
        if cut_bgr is not None:
            crop_cutin_pil(cut_bgr, act_num).save(cutin_out, format="WEBP", quality=88, method=6)

    for obsolete in (
        "bg.webp",
        "hero.webp",
        "hero-depth.webp",
        "depth.webp",
        "mockers-left.webp",
        "mockers-right.webp",
        "cutin-kf1.webp",
    ):
        (out_dir / obsolete).unlink(missing_ok=True)

    sizes = {p.name: f"{p.stat().st_size / 1024:.1f}KB" for p in sorted(out_dir.glob("*.webp"))}
    print(f"[build-diorama] Spatial Act {act_num} built:", sizes)


def crop_cutin_pil(cut_bgr: np.ndarray, act_num: int) -> Image.Image:
    ch, cw = cut_bgr.shape[:2]
    if act_num == 2:
        # Trim top/bottom rule lines & margins completely (central dark grip strip ~ y=0.22..0.75)
        y1 = int(ch * 0.225)
        y2 = int(ch * 0.745)
        x1 = int(cw * 0.025)
        x2 = int(cw * 0.975)
        sub = cut_bgr[y1:y2, x1:x2]
        cut_crop = center_crop_aspect(sub, CUTIN_W / CUTIN_H, trim_pct=0.0)
    else:
        cut_crop = center_crop_aspect(cut_bgr, CUTIN_W / CUTIN_H, trim_pct=0.02)
    cut_resized = cv2.resize(cut_crop, (CUTIN_W, CUTIN_H), interpolation=cv2.INTER_AREA)
    cut_rgb = cv2.cvtColor(cut_resized, cv2.COLOR_BGR2RGB)
    return Image.fromarray(cut_rgb, mode="RGB")


def build_act(
    act_num: int,
    processor: AutoImageProcessor,
    model: AutoModelForDepthEstimation,
    device: str,
) -> None:
    if (RAW_DIR / f"act{act_num}_main.jpg").exists():
        build_spatial_act(act_num, processor, model, device)
        return

    out_dir = OUT_ROOT / f"act-{act_num}"
    out_dir.mkdir(parents=True, exist_ok=True)

    bg_empty = RAW_DIR / f"act{act_num}_bg_empty.jpg"
    bg_path = bg_empty if (act_num == 1 and bg_empty.exists()) else RAW_DIR / f"act{act_num}_bg.jpg"
    hero_path = RAW_DIR / f"act{act_num}_hero_chroma.jpg"
    cutin_path = RAW_DIR / f"act{act_num}_cutin.jpg"

    # 1. Background 1600x900 RGB WebP
    bg_bgr = cv2.imread(str(bg_path), cv2.IMREAD_COLOR)
    if bg_bgr is None:
        raise FileNotFoundError(bg_path)
    bg_crop = center_crop_aspect(bg_bgr, TARGET_W / TARGET_H, trim_pct=0.015)
    bg_resized = cv2.resize(bg_crop, (TARGET_W, TARGET_H), interpolation=cv2.INTER_AREA)
    bg_rgb = cv2.cvtColor(bg_resized, cv2.COLOR_BGR2RGB)
    bg_pil = Image.fromarray(bg_rgb, mode="RGB")
    bg_pil.save(out_dir / "bg.webp", format="WEBP", quality=88, method=6)

    # 2. Hero 1600x900 RGBA WebP + Dark QA proof composite
    hero_bgr = cv2.imread(str(hero_path), cv2.IMREAD_COLOR)
    if hero_bgr is None:
        raise FileNotFoundError(hero_path)
    hero_rgba_raw = extract_chroma_hero(hero_bgr)
    hero_rgba = compose_hero_16x9(hero_rgba_raw, act_num)
    Image.fromarray(hero_rgba, mode="RGBA").save(out_dir / "hero.webp", format="WEBP", quality=92, method=6)

    # Composite onto dark #101114 for instant visual QA
    dark_bg = np.full((TARGET_H, TARGET_W, 3), [16, 17, 20], dtype=np.float32)
    a_f = (hero_rgba[:, :, 3:4].astype(np.float32)) / 255.0
    qa_rgb = hero_rgba[:, :, :3].astype(np.float32) * a_f + dark_bg * (1.0 - a_f)
    Image.fromarray(np.clip(qa_rgb, 0, 255).astype(np.uint8), mode="RGB").save(
        RAW_DIR / f"act{act_num}_hero_qa_dark.png"
    )

    # Act I separated flanking mockers (left/right 800x900 RGBA WebPs)
    mockers_path = RAW_DIR / "act1_mockers_chroma.jpg"
    if act_num == 1 and mockers_path.exists():
        mock_bgr = cv2.imread(str(mockers_path), cv2.IMREAD_COLOR)
        if mock_bgr is None:
            raise FileNotFoundError(mockers_path)
        mock_crop = center_crop_aspect(mock_bgr, TARGET_W / TARGET_H, trim_pct=0.015)
        mock_resized = cv2.resize(mock_crop, (TARGET_W, TARGET_H), interpolation=cv2.INTER_AREA)
        mock_rgba = extract_chroma_hero(mock_resized)
        half_w = TARGET_W // 2
        mock_left = mock_rgba[:, :half_w]
        mock_right = mock_rgba[:, half_w:]
        Image.fromarray(mock_left, mode="RGBA").save(out_dir / "mockers-left.webp", format="WEBP", quality=92, method=6)
        Image.fromarray(mock_right, mode="RGBA").save(out_dir / "mockers-right.webp", format="WEBP", quality=92, method=6)

        m_af = (mock_rgba[:, :, 3:4].astype(np.float32)) / 255.0
        m_qa = mock_rgba[:, :, :3].astype(np.float32) * m_af + dark_bg * (1.0 - m_af)
        Image.fromarray(np.clip(m_qa, 0, 255).astype(np.uint8), mode="RGB").save(
            RAW_DIR / "act1_mockers_qa_dark.png"
        )

    # 3. Background & Hero Depth Maps (768x432 smooth WebP)
    bg_depth = infer_smooth_depth(bg_pil, processor, model, device)
    Image.fromarray(bg_depth, mode="L").save(out_dir / "depth.webp", format="WEBP", quality=88, method=6)

    neutral_bg = np.full((TARGET_H, TARGET_W, 3), [48, 49, 54], dtype=np.float32)
    hero_on_gray = hero_rgba[:, :, :3].astype(np.float32) * a_f + neutral_bg * (1.0 - a_f)
    hero_gray_pil = Image.fromarray(np.clip(hero_on_gray, 0, 255).astype(np.uint8), mode="RGB")
    alpha_768 = cv2.resize(a_f[:, :, 0], (DEPTH_W, DEPTH_H), interpolation=cv2.INTER_AREA)
    hero_depth = infer_smooth_depth(hero_gray_pil, processor, model, device, alpha_mask_768=alpha_768)
    Image.fromarray(hero_depth, mode="L").save(out_dir / "hero-depth.webp", format="WEBP", quality=88, method=6)

    # 4. Cut-In 960x436 (2.2:1) WebP (+ Act II Keyframe 1 pre-grip frame)
    cut_bgr = cv2.imread(str(cutin_path), cv2.IMREAD_COLOR)
    if cut_bgr is None:
        raise FileNotFoundError(cutin_path)
    crop_cutin_pil(cut_bgr, act_num).save(out_dir / "cutin.webp", format="WEBP", quality=88, method=6)

    kf1_path = RAW_DIR / f"act{act_num}_cutin_kf1.jpg"
    if act_num == 2 and kf1_path.exists():
        kf1_bgr = cv2.imread(str(kf1_path), cv2.IMREAD_COLOR)
        if kf1_bgr is None:
            raise FileNotFoundError(kf1_path)
        crop_cutin_pil(kf1_bgr, act_num).save(out_dir / "cutin-kf1.webp", format="WEBP", quality=88, method=6)

    sizes = {p.name: f"{p.stat().st_size / 1024:.1f}KB" for p in sorted(out_dir.glob("*.webp"))}
    print(f"[build-diorama] Act {act_num} built:", sizes)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--acts", nargs="+", type=int, default=[1, 2])
    parser.add_argument("--model", default="depth-anything/Depth-Anything-V2-Small-hf")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[build-diorama] Loading {args.model} on {device}...")
    processor = AutoImageProcessor.from_pretrained(args.model)
    model = AutoModelForDepthEstimation.from_pretrained(args.model).to(device).eval()

    for act in args.acts:
        build_act(act, processor, model, device)
    return 0


if __name__ == "__main__":
    sys.exit(main())
