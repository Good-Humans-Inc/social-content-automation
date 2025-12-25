import os
import math
import random
from typing import Tuple, List

import numpy as np
from moviepy import VideoClip
import colorsys

# ==========================
# Config
# ==========================

W, H = 1080, 1920      # Vertical resolution for TikTok
DURATION = 6           # seconds
FPS = 30               # frames per second
N_VIDEOS = 100

OUTPUT_DIR = "pastel_backgrounds"


# ==========================
# Color helpers
# ==========================

def pastel_from_index(i: int, n: int) -> Tuple[float, float, float]:
    """Generate a soft pastel color from index."""
    h = (i / n) % 1.0
    s = 0.40
    l = 0.82
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return r, g, b


def shift_hue(rgb: Tuple[float, float, float], delta: float) -> Tuple[float, float, float]:
    r, g, b = rgb
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    h = (h + delta) % 1.0
    return colorsys.hls_to_rgb(h, l, s)


def lerp(a, b, t):
    return a + (b - a) * t


# ==========================
# Effect generator
# ==========================

class BackgroundConfig:
    def __init__(self, idx: int, total: int):
        random.seed(idx)

        self.idx = idx
        self.main = np.array(pastel_from_index(idx, total))
        self.secondary = np.array(shift_hue(tuple(self.main), 0.1))
        self.dark = self.main * 0.45

        # Gradient types
        self.gradient_type = idx % 3

        # Overlay animation types
        self.overlay_type = (idx // 3) % 3

        self.motion_speed = 0.1 + (idx % 7) * 0.02

        self.sparkles = self._generate_particles(25)
        self.blobs = self._generate_particles(6)

    def _generate_particles(self, count: int):
        items = []
        for _ in range(count):
            cx = random.randint(int(W * 0.05), int(W * 0.95))
            cy = random.randint(int(H * 0.05), int(H * 0.95))
            radius = random.randint(20, 110)
            phase = random.random() * 2 * math.pi
            items.append({"cx": cx, "cy": cy, "radius": radius, "phase": phase})
        return items


def make_frame_factory(cfg: BackgroundConfig):

    yy, xx = np.mgrid[0:H, 0:W]
    yy_norm = yy / (H - 1)
    xx_norm = xx / (W - 1)

    def frame(t: float) -> np.ndarray:

        # Drift the gradient center
        cx = 0.5 + 0.05 * math.sin(t * cfg.motion_speed * 2 * math.pi)
        cy = 0.5 + 0.05 * math.cos(t * cfg.motion_speed * 1.5 * math.pi)

        # Gradient selection
        if cfg.gradient_type == 0:
            g = yy_norm
        elif cfg.gradient_type == 1:
            dx = xx_norm - cx
            dy = yy_norm - cy
            g = np.clip(np.sqrt(dx * dx + dy * dy) * 1.8, 0, 1)
        else:
            g = np.clip(xx_norm * 0.6 + yy_norm * 0.4, 0, 1)

        # Two-step pastel gradient
        mid = 0.45
        g1 = np.clip(g / mid, 0, 1)
        g2 = np.clip((g - mid) / (1 - mid), 0, 1)

        base = np.where(
            g[..., None] <= mid,
            lerp(cfg.dark, cfg.main, g1[..., None]),
            lerp(cfg.main, cfg.secondary, g2[..., None])
        )

        frame = base.copy()

        if cfg.overlay_type == 0:
            add_sparkles(frame, cfg.sparkles, t)
        elif cfg.overlay_type == 1:
            add_blobs(frame, cfg.blobs, t)
        else:
            add_wave(frame, t)

        apply_vignette(frame)

        return (np.clip(frame, 0, 1) * 255).astype("uint8")

    return frame


def add_sparkles(frame, sparkles, t):
    h, w, _ = frame.shape
    yy, xx = np.ogrid[0:h, 0:w]

    for s in sparkles:
        cx, cy, r, phase = s["cx"], s["cy"], s["radius"], s["phase"]

        alpha = (math.sin(t * 3 + phase) + 1) / 2 * 0.6
        if alpha < 0.05:
            continue

        mask = (xx - cx) ** 2 + (yy - cy) ** 2 <= r ** 2
        frame[mask] = frame[mask] * (1 - alpha) + np.array([1, 1, 1]) * alpha


def add_blobs(frame, blobs, t):
    h, w, _ = frame.shape
    yy, xx = np.ogrid[0:h, 0:w]

    for b in blobs:
        cx0, cy0, r, phase = b["cx"], b["cy"], b["radius"], b["phase"]

        cx = cx0 + 60 * math.sin(t * 0.3 + phase)
        cy = cy0 + 80 * math.cos(t * 0.25 + phase)

        dist = (xx - cx) ** 2 + (yy - cy) ** 2
        mask = dist <= r ** 2

        edge = np.clip(1 - dist / (r ** 2), 0, 1)
        alpha = edge * 0.35

        frame[mask] = frame[mask] * (1 - alpha[mask, None]) + 1 * alpha[mask, None]


def add_wave(frame, t):
    h = frame.shape[0]
    yy = np.linspace(0, 1, h).reshape(h, 1)

    center = (math.sin(t * 0.7 * 2 * math.pi) + 1) / 2
    width = 0.25
    mask = (1 - np.clip(abs(yy - center) / width, 0, 1)) ** 2 * 0.35

    frame[:] = frame * (1 - mask) + 1 * mask


def apply_vignette(frame):
    h, w, _ = frame.shape
    yy, xx = np.mgrid[0:h, 0:w]
    yy = yy / (h - 1)
    xx = xx / (w - 1)

    dist = np.sqrt((xx - 0.5) ** 2 + (yy - 0.5) ** 2)
    vignette = 1 - np.clip((dist - 0.2) / 0.8, 0, 1) * 0.35

    frame[:] = frame * vignette[..., None]


# ==========================
# Main
# ==========================

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for i in range(N_VIDEOS):
        cfg = BackgroundConfig(i, N_VIDEOS)
        frame_fn = make_frame_factory(cfg)

        file = os.path.join(OUTPUT_DIR, f"bg_{i:03d}.mp4")
        print("Rendering", file)

        clip = VideoClip(make_frame=frame_fn, duration=DURATION)
        clip = clip.with_fps(FPS)

        clip.write_videofile(
            file,
            codec="libx264",
            audio=False,
            bitrate="4000k",
            preset="medium",
            fps=FPS
        )

    print("Done.")


if __name__ == "__main__":
    main()
