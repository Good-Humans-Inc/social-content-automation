import os
from dataclasses import dataclass
from typing import List, Optional, Dict, Any

import yaml
from dotenv import load_dotenv


@dataclass
class OpenAIConfig:
    model: str
    temperature: float


@dataclass
class GeeLarkConfig:
    api_base: str
    api_key: str


@dataclass
class PostingConfig:
    env_ids: List[str]
    task_type: str  # image_set | video | warmup
    schedule_in_minutes: int
    images_per_post: int
    video_desc_template: str
    video_title_template: str
    need_share_link: bool
    mark_ai: bool


@dataclass
class ImageOverlayConfig:
    font_path: str
    font_size: int
    color: str
    stroke_color: str
    stroke_width: int
    position: str  # center | bottom
    padding: int
    wrap_width_chars: int


@dataclass
class WarmupConfig:
    action: str
    keywords: List[str]
    duration_minutes: int


@dataclass
class AppConfig:
    openai: OpenAIConfig
    geelark: GeeLarkConfig
    posting: PostingConfig
    image_overlay: ImageOverlayConfig
    warmup: WarmupConfig
    default_prompt: Optional[str] = None


def load_config(config_path: Optional[str] = None) -> AppConfig:
    load_dotenv()

    data: Dict[str, Any] = {}
    # If no explicit config path, try ./config.yaml
    if config_path is None:
        default_path = os.path.join(os.getcwd(), "config.yaml")
        if os.path.exists(default_path):
            config_path = default_path

    if config_path and os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

    openai_cfg = OpenAIConfig(
        model=os.getenv("OPENAI_MODEL", data.get("openai", {}).get("model", "gpt-4o-mini")),
        temperature=float(os.getenv("OPENAI_TEMPERATURE", data.get("openai", {}).get("temperature", 0.8))),
    )

    geelark_cfg = GeeLarkConfig(
        api_base=os.getenv("GEELARK_API_BASE", data.get("geelark", {}).get("api_base", "https://openapi.geelark.com")),
        api_key=os.getenv("GEELARK_API_KEY", data.get("geelark", {}).get("api_key", "")),
    )

    posting_cfg = PostingConfig(
        env_ids=data.get("posting", {}).get("env_ids", []),
        task_type=data.get("posting", {}).get("task_type", "image_set"),
        schedule_in_minutes=int(data.get("posting", {}).get("schedule_in_minutes", 5)),
        images_per_post=int(data.get("posting", {}).get("images_per_post", 4)),
        video_desc_template=data.get("posting", {}).get("video_desc_template", "{text}"),
        video_title_template=data.get("posting", {}).get("video_title_template", "{text}"),
        need_share_link=bool(data.get("posting", {}).get("need_share_link", False)),
        mark_ai=bool(data.get("posting", {}).get("mark_ai", False)),
    )

    overlay_cfg = ImageOverlayConfig(
        font_path=os.getenv("FONT_PATH", data.get("image_overlay", {}).get("font_path", "./fonts/YourFont.ttf")),
        font_size=int(data.get("image_overlay", {}).get("font_size", 72)),
        color=data.get("image_overlay", {}).get("color", "#ffffff"),
        stroke_color=data.get("image_overlay", {}).get("stroke_color", "#000000"),
        stroke_width=int(data.get("image_overlay", {}).get("stroke_width", 2)),
        position=data.get("image_overlay", {}).get("position", "center"),
        padding=int(data.get("image_overlay", {}).get("padding", 48)),
        wrap_width_chars=int(data.get("image_overlay", {}).get("wrap_width_chars", 24)),
    )

    warmup_cfg = WarmupConfig(
        action=data.get("warmup", {}).get("action", "browse video"),
        keywords=data.get("warmup", {}).get("keywords", []),
        duration_minutes=int(data.get("warmup", {}).get("duration_minutes", 10)),
    )

    default_prompt = os.getenv("DEFAULT_PROMPT", data.get("default_prompt"))

    return AppConfig(
        openai=openai_cfg,
        geelark=geelark_cfg,
        posting=posting_cfg,
        image_overlay=overlay_cfg,
        warmup=warmup_cfg,
        default_prompt=default_prompt,
    )



