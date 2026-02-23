"""Content diversification for videos and templates.

Provides a modular effect pipeline that composes ffmpeg filter fragments
for generating numerous visual variations from the same base content.
"""

import random
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

from src.text_overlay import OverlayOptions


@dataclass
class EffectConfig:
    """Describes which visual effects to apply during rendering."""
    ken_burns: bool = False
    ken_burns_direction: str = "in"      # "in" | "out" | "random"
    mirror: bool = False
    border: Optional[str] = None         # hex color for border, e.g. "#333333"
    border_width: int = 20
    film_grain: bool = False
    shake: bool = False
    shake_intensity: int = 4             # pixels of shake amplitude
    rotation: float = 0.0                # degrees, small values like +-2
    zoom: float = 1.0
    brightness: float = 0.0
    contrast: float = 1.0
    saturation: float = 1.0
    noise: bool = False
    speed: float = 1.0
    subtitle_position: str = "bottom"    # "top" | "center" | "bottom"
    text_animation: str = "static"       # "static" | "line_by_line" | "fade_in"
    vignette: bool = False


@dataclass
class DiversifiedOverlayOptions(OverlayOptions):
    """Overlay options with randomization applied."""
    pass


def randomize_overlay_position() -> str:
    """Randomize text position."""
    return random.choice(["center", "bottom", "top"])


def randomize_font_size(base_size: int, variation: int = 10) -> int:
    """Randomize font size within variation."""
    return max(20, base_size + random.randint(-variation, variation))


def randomize_padding(base_padding: int, variation: int = 50) -> int:
    """Randomize padding within variation."""
    return max(100, base_padding + random.randint(-variation, variation))


def randomize_tag_combination(tags: List[str], tag_pools: Dict[str, List[str]]) -> List[str]:
    """
    Randomize tag combinations from candidate pools.

    Maintains structure: 2 fandom + 1 generic + 1 emotional + 1 traffic.
    """
    result = []

    fandom_tags = tag_pools.get("fandom", [])
    if fandom_tags:
        result.extend(random.sample(fandom_tags, min(2, len(fandom_tags))))

    generic_tags = tag_pools.get("generic", ["#animegaming", "#otakutok", "#gachagame"])
    if generic_tags:
        result.append(random.choice(generic_tags))

    emotional_tags = tag_pools.get("emotional", ["#relatable", "#mood", "#poll", "#animefeels"])
    if emotional_tags:
        result.append(random.choice(emotional_tags))

    traffic_tags = tag_pools.get("traffic", ["#fyp", "#foryou", "#viral"])
    if traffic_tags:
        result.append(random.choice(traffic_tags))

    return result


def diversify_overlay_options(base_opts: OverlayOptions) -> DiversifiedOverlayOptions:
    """Apply randomization to overlay options."""
    return DiversifiedOverlayOptions(
        font_path=base_opts.font_path,
        font_size=randomize_font_size(base_opts.font_size),
        color=base_opts.color,
        stroke_color=base_opts.stroke_color,
        stroke_width=base_opts.stroke_width,
        position=randomize_overlay_position(),
        padding=randomize_padding(base_opts.padding),
        wrap_width_chars=base_opts.wrap_width_chars,
    )


def get_video_diversification_filters() -> Dict[str, Any]:
    """Legacy helper -- returns a basic dict of filter parameters."""
    return {
        "zoom": random.uniform(1.0, 1.1),
        "brightness": random.uniform(-0.05, 0.05),
        "contrast": random.uniform(0.95, 1.05),
        "saturation": random.uniform(0.95, 1.05),
        "noise": random.choice([True, False]),
        "speed": random.uniform(0.95, 1.05),
    }


def get_random_effect_config() -> EffectConfig:
    """Generate a random EffectConfig for creating one unique variation."""
    kb_directions = ["in", "out"]
    positions = ["top", "center", "bottom"]
    text_anims = ["static", "line_by_line", "fade_in"]

    return EffectConfig(
        ken_burns=random.choice([True, False]),
        ken_burns_direction=random.choice(kb_directions),
        mirror=random.choice([True, False, False]),  # less frequent
        border=random.choice([None, None, "#333333", "#ffffff", "#1a1a2e"]),
        border_width=random.choice([10, 16, 20, 24]),
        film_grain=random.choice([True, False]),
        shake=random.choice([True, False, False]),
        shake_intensity=random.randint(2, 6),
        rotation=random.uniform(-2.0, 2.0) if random.random() < 0.3 else 0.0,
        zoom=random.uniform(1.0, 1.1),
        brightness=random.uniform(-0.05, 0.05),
        contrast=random.uniform(0.95, 1.05),
        saturation=random.uniform(0.95, 1.05),
        noise=random.choice([True, False]),
        speed=random.uniform(0.95, 1.05),
        subtitle_position=random.choice(positions),
        text_animation=random.choice(text_anims),
        vignette=random.choice([True, False, False]),
    )


# ---------------------------------------------------------------------------
# ffmpeg filter fragment builders
# ---------------------------------------------------------------------------

def _hex_to_ffmpeg_color(hex_color: str) -> str:
    c = hex_color.strip().lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    return f"0x{c.lower()}"


def build_ken_burns_filter(
    width: int, height: int, duration: float, direction: str = "in"
) -> str:
    """Animated zoom/pan via the zoompan filter.

    - direction="in"  : slowly zoom in from full-frame
    - direction="out" : start zoomed in, slowly pull out
    """
    fps = 30
    total_frames = int(duration * fps)
    if direction == "out":
        zoom_expr = f"min(1.1,1.1-0.1*on/{total_frames})"
    else:
        zoom_expr = f"min(1.1,1+0.1*on/{total_frames})"

    return (
        f"zoompan=z='{zoom_expr}'"
        f":x='iw/2-(iw/zoom/2)'"
        f":y='ih/2-(ih/zoom/2)'"
        f":d={total_frames}:s={width}x{height}:fps={fps}"
    )


def build_shake_filter(intensity: int = 4) -> str:
    """Slight random crop offset each frame to simulate camera shake."""
    return (
        f"crop=iw-{intensity*2}:ih-{intensity*2}"
        f":{intensity}+random(0)*{intensity}"
        f":{intensity}+random(1)*{intensity}"
    )


def build_film_grain_filter() -> str:
    """Cinematic grain via noise + slight color curve shift."""
    return "noise=alls=12:allf=t+u"


def build_vignette_filter() -> str:
    """Subtle vignette darkening at edges."""
    return "vignette=PI/4"


def build_border_filter(width: int, height: int, border_w: int, color: str) -> str:
    """Add a colored border around the frame."""
    c = _hex_to_ffmpeg_color(color)
    inner_w = width - 2 * border_w
    inner_h = height - 2 * border_w
    return f"scale={inner_w}:{inner_h},pad={width}:{height}:{border_w}:{border_w}:color={c}"


def build_rotation_filter(degrees: float) -> str:
    """Small constant rotation in radians. Uses fillcolor=black for corners."""
    import math
    radians = math.radians(degrees)
    return f"rotate={radians}:fillcolor=black"


def build_effect_filters(
    cfg: EffectConfig,
    width: int = 1080,
    height: int = 1920,
    duration: float = 5.0,
) -> List[str]:
    """Compose a list of ffmpeg filter fragments from an EffectConfig.

    These should be joined with ',' and placed before the drawtext filter
    in a -vf pipeline. The Ken Burns filter is returned separately since
    it replaces the standard image-to-video loop input.
    """
    filters: List[str] = []

    if cfg.mirror:
        filters.append("hflip")

    if cfg.rotation and abs(cfg.rotation) > 0.1:
        filters.append(build_rotation_filter(cfg.rotation))

    if cfg.zoom != 1.0:
        filters.append(f"scale=iw*{cfg.zoom}:ih*{cfg.zoom},crop={width}:{height}")

    eq_parts = []
    if cfg.brightness:
        eq_parts.append(f"brightness={cfg.brightness}")
    if cfg.contrast != 1.0:
        eq_parts.append(f"contrast={cfg.contrast}")
    if cfg.saturation != 1.0:
        eq_parts.append(f"saturation={cfg.saturation}")
    if eq_parts:
        filters.append("eq=" + ":".join(eq_parts))

    if cfg.noise:
        filters.append("noise=alls=20:allf=t+u")

    if cfg.film_grain:
        filters.append(build_film_grain_filter())

    if cfg.shake:
        filters.append(build_shake_filter(cfg.shake_intensity))

    if cfg.vignette:
        filters.append(build_vignette_filter())

    if cfg.border and cfg.border_width > 0:
        filters.append(build_border_filter(width, height, cfg.border_width, cfg.border))

    return filters


def effect_config_to_dict(cfg: EffectConfig) -> Dict[str, Any]:
    """Convert EffectConfig to the legacy dict format consumed by video_overlay."""
    d: Dict[str, Any] = {
        "zoom": cfg.zoom,
        "brightness": cfg.brightness,
        "contrast": cfg.contrast,
        "saturation": cfg.saturation,
        "noise": cfg.noise,
        "speed": cfg.speed,
        "mirror": cfg.mirror,
        "film_grain": cfg.film_grain,
        "shake": cfg.shake,
        "shake_intensity": cfg.shake_intensity,
        "rotation": cfg.rotation,
        "vignette": cfg.vignette,
        "ken_burns": cfg.ken_burns,
        "ken_burns_direction": cfg.ken_burns_direction,
        "border": cfg.border,
        "border_width": cfg.border_width,
    }
    return d
