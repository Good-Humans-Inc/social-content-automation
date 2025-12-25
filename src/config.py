import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import yaml
from dotenv import load_dotenv


@dataclass
class GeeLarkConfig:
    api_base: str
    api_key: str


@dataclass
class PostingConfig:
    schedule_in_minutes: int
    need_share_link: bool
    mark_ai: bool


@dataclass
class OverlayConfig:
    font_path: str
    font_size: int
    color: str
    stroke_color: str
    stroke_width: int
    position: str  # center | bottom
    padding: int
    wrap_width_chars: int


@dataclass
class TemplateLibraryConfig:
    path: str
    persona: str
    intensity_weights: Dict[str, float]


@dataclass
class AccountConfig:
    id: str
    display_name: str
    env_id: str
    cloud_phone_id: str
    persona: str
    preferred_fandoms: List[str]
    preferred_intensity: Optional[str] = None
    video_source: Optional[str] = None


@dataclass
class AppConfig:
    geelark: GeeLarkConfig
    posting: PostingConfig
    overlay: OverlayConfig
    template_library: TemplateLibraryConfig
    accounts: List[AccountConfig]


def _resolve_config_path(config_path: Optional[str]) -> Optional[str]:
    if config_path:
        return config_path
    default_path = os.path.join(os.getcwd(), "config.yaml")
    return default_path if os.path.exists(default_path) else None


def _load_yaml(path: Optional[str]) -> Dict[str, Any]:
    if not path:
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _intensity_weights(raw: Dict[str, Any]) -> Dict[str, float]:
    if not raw:
        return {"T0": 1.0, "T1": 1.0, "T2": 1.0}
    weights = {k: float(v) for k, v in raw.items()}
    # Filter out non-positive weights
    return {k: w for k, w in weights.items() if w > 0}


def load_config(config_path: Optional[str] = None) -> AppConfig:
    load_dotenv()
    resolved_path = _resolve_config_path(config_path)
    data = _load_yaml(resolved_path)

    geelark_cfg = GeeLarkConfig(
        api_base=os.getenv("GEELARK_API_BASE", data.get("geelark", {}).get("api_base", "https://openapi.geelark.com")),
        api_key=os.getenv("GEELARK_API_KEY", data.get("geelark", {}).get("api_key", "")),
    )

    posting_cfg = PostingConfig(
        schedule_in_minutes=int(data.get("posting", {}).get("schedule_in_minutes", 120)),
        need_share_link=bool(data.get("posting", {}).get("need_share_link", False)),
        mark_ai=bool(data.get("posting", {}).get("mark_ai", False)),
    )

    overlay_cfg = OverlayConfig(
        font_path=os.getenv("FONT_PATH", data.get("overlay", data.get("image_overlay", {})).get("font_path", "./fonts/AutourOne-Regular.ttf")),
        font_size=int(data.get("overlay", data.get("image_overlay", {})).get("font_size", 60)),
        color=data.get("overlay", data.get("image_overlay", {})).get("color", "#ff6ec7"),
        stroke_color=data.get("overlay", data.get("image_overlay", {})).get("stroke_color", "#ffffff"),
        stroke_width=int(data.get("overlay", data.get("image_overlay", {})).get("stroke_width", 12)),
        position=data.get("overlay", data.get("image_overlay", {})).get("position", "bottom"),
        padding=int(data.get("overlay", data.get("image_overlay", {})).get("padding", 600)),
        wrap_width_chars=int(data.get("overlay", data.get("image_overlay", {})).get("wrap_width_chars", 18)),
    )

    template_data = data.get("template_library", {})
    template_cfg = TemplateLibraryConfig(
        path=template_data.get("path", "./input/anime_otome.jsonl"),
        persona=template_data.get("persona", "anime_otome"),
        intensity_weights=_intensity_weights(template_data.get("intensity_weights", {})),
    )

    accounts_cfg: List[AccountConfig] = []
    for entry in data.get("accounts", []):
        accounts_cfg.append(
            AccountConfig(
                id=entry["id"],
                display_name=entry["display_name"],
                env_id=entry["env_id"],
                cloud_phone_id=entry.get("cloud_phone_id", entry["env_id"]),
                persona=entry.get("persona", template_cfg.persona),
                preferred_fandoms=entry.get("preferred_fandoms", []),
                preferred_intensity=entry.get("preferred_intensity"),
                video_source=entry.get("video_source"),
            )
        )

    if not accounts_cfg:
        raise ValueError("No accounts configured. Please add entries under accounts[].")

    return AppConfig(
        geelark=geelark_cfg,
        posting=posting_cfg,
        overlay=overlay_cfg,
        template_library=template_cfg,
        accounts=accounts_cfg,
    )

