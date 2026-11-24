#!/usr/bin/env python3
"""
Offline AI Depth Map Video Generator for FERRUM 3D Interactive Cinema:
  public/videos/scene-<N>.mp4 -> scene-<N>-depth.mp4 + scene-<N>-depth-poster.webp

Runs Depth-Anything-V2-Small on GPU (or CPU fallback) with clip-wide percentile
normalization, temporal EMA smoothing, and edge-safe smoothing for tear-free
WebGL 3D vertex relief & parallax occlusion mapping.
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation


ROOT = Path(__file__).resolve().parent.parent
VIDEO_DIR = ROOT / "public" / "videos"


def encode_depth_mp4(frames_u8: np.ndarray, out_mp4: Path, out_poster: Path, fps: float, crf: str) -> None:
    _, h, w = frames_u8.shape
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "-s",
        f"{w}x{h}",
        "-r",
        f"{fps:.6f}",
        "-i",
        "-",
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-level",
        "3.1",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        crf,
        "-preset",
        "medium",
        "-g",
        "24",
        "-an",
        "-movflags",
        "+faststart",
        str(out_mp4),
    ]
    proc = subprocess.run(cmd, input=frames_u8.tobytes(), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed for {out_mp4}: {proc.stderr.decode('utf-8', errors='ignore')}")

    poster_idx = min(len(frames_u8) - 1, max(0, int(fps * 0.5)))
    poster_img = Image.fromarray(frames_u8[poster_idx], mode="L")
    poster_img.save(out_poster, format="WEBP", quality=86)


def write_debug_strip(color_frames: list[np.ndarray], depth_frames: np.ndarray, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    idxs = [0, len(depth_frames) // 2, max(0, len(depth_frames) - 12)]
    rows = []
    _, dh, dw = depth_frames.shape
    for idx in idxs:
        bgr_small = cv2.resize(color_frames[idx], (dw, dh), interpolation=cv2.INTER_AREA)
        d_gray = cv2.cvtColor(depth_frames[idx], cv2.COLOR_GRAY2BGR)
        d_heat = cv2.applyColorMap(depth_frames[idx], cv2.COLORMAP_INFERNO)
        cv2.putText(bgr_small, f"f={idx}", (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (235, 225, 200), 1, cv2.LINE_AA)
        cv2.putText(d_gray, "depth-L", (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (220, 220, 220), 1, cv2.LINE_AA)
        cv2.putText(d_heat, "near=yellow", (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
        rows.append(np.hstack([bgr_small, d_gray, d_heat]))
    grid = np.vstack(rows)
    cv2.imwrite(str(out_path), grid)


def process_scene(
    scene_num: int,
    processor: AutoImageProcessor,
    model: AutoModelForDepthEstimation,
    device: str,
    width: int,
    height: int,
    crf: str,
    debug_dir: Path | None,
) -> None:
    in_mp4 = VIDEO_DIR / f"scene-{scene_num}.mp4"
    if not in_mp4.exists():
        raise FileNotFoundError(f"Missing video: {in_mp4}")

    cap = cv2.VideoCapture(str(in_mp4))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    bgr_frames: list[np.ndarray] = []
    pil_frames: list[Image.Image] = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        bgr_frames.append(frame)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_frames.append(Image.fromarray(rgb))
    cap.release()

    if not pil_frames:
        raise RuntimeError(f"No frames read from {in_mp4}")

    print(f"[build-depth] Scene {scene_num}: inferring depth across {len(pil_frames)} frames on {device}...")

    batch_size = 8 if device == "cuda" else 2
    raw_depths: list[np.ndarray] = []

    use_fp16 = device == "cuda"
    with torch.inference_mode():
        for i in range(0, len(pil_frames), batch_size):
            batch = pil_frames[i : i + batch_size]
            inputs = processor(images=batch, return_tensors="pt")
            inputs = {k: v.to(device) for k, v in inputs.items()}
            if use_fp16:
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    outputs = model(**inputs)
            else:
                outputs = model(**inputs)

            pred = outputs.predicted_depth
            interp = torch.nn.functional.interpolate(
                pred.unsqueeze(1).float(),
                size=(height, width),
                mode="bicubic",
                align_corners=False,
            ).squeeze(1)
            raw_depths.append(interp.cpu().numpy())

    stack = np.concatenate(raw_depths, axis=0)
    stack = np.nan_to_num(stack, nan=0.0, posinf=0.0, neginf=0.0)

    # Clip-wide global percentiles prevent depth flickering or brightness pumping
    # Exclude top/bottom letterbox margins when computing percentiles for scene 1
    sample_slice = stack[:, 18:-18, :] if scene_num == 1 else stack
    p_lo = float(np.percentile(sample_slice, 2.0))
    p_hi = float(np.percentile(sample_slice, 98.0))
    span = max(1e-4, p_hi - p_lo)

    norm = np.clip((stack - p_lo) / span, 0.0, 1.0)

    # Temporal EMA smoothing (stepped slightly organic without losing motion)
    smoothed = np.empty_like(norm)
    smoothed[0] = norm[0]
    for t in range(1, len(norm)):
        smoothed[t] = 0.65 * norm[t] + 0.35 * smoothed[t - 1]

    # Spatial edge-preserving soften + small Gaussian pass so relief vertices stay silky
    out_u8 = np.empty(smoothed.shape, dtype=np.uint8)
    for t in range(len(smoothed)):
        u8 = np.clip(smoothed[t] * 255.0, 0, 255).astype(np.uint8)
        u8 = cv2.bilateralFilter(u8, d=7, sigmaColor=24, sigmaSpace=5)
        u8 = cv2.GaussianBlur(u8, (5, 5), 1.1)
        if scene_num == 1:
            # Clamp baked letterbox margin depth rows cleanly to nearest valid interior row
            u8[:16, :] = u8[16:17, :]
            u8[-16:, :] = u8[-17:-16, :]
        out_u8[t] = u8

    out_mp4 = VIDEO_DIR / f"scene-{scene_num}-depth.mp4"
    out_poster = VIDEO_DIR / f"scene-{scene_num}-depth-poster.webp"
    encode_depth_mp4(out_u8, out_mp4, out_poster, fps, crf)

    size_kb = out_mp4.stat().st_size / 1024.0
    print(f"[build-depth]   Done {out_mp4.name}: {size_kb:.1f} KB ({width}x{height} @ {fps:.1f}fps)")

    if debug_dir is not None:
        dbg_file = debug_dir / f"depth_debug_scene{scene_num}.png"
        write_debug_strip(bgr_frames, out_u8, dbg_file)
        print(f"[build-depth]   Debug strip: {dbg_file}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build synced AI depth videos for FERRUM WebGL relief")
    parser.add_argument("--scenes", nargs="+", type=int, default=[1, 2], help="Scene numbers (1..5)")
    parser.add_argument("--model", default="depth-anything/Depth-Anything-V2-Small-hf")
    parser.add_argument("--width", type=int, default=384)
    parser.add_argument("--height", type=int, default=216)
    parser.add_argument("--crf", default="22")
    parser.add_argument("--debug-dir", default="", help="Optional folder for depth debug PNG comparisons")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[build-depth] Loading {args.model} on {device}...")
    processor = AutoImageProcessor.from_pretrained(args.model)
    model = AutoModelForDepthEstimation.from_pretrained(args.model).to(device).eval()

    debug_dir = Path(args.debug_dir) if args.debug_dir else None
    for s in args.scenes:
        process_scene(s, processor, model, device, args.width, args.height, args.crf, debug_dir)

    return 0


if __name__ == "__main__":
    sys.exit(main())
