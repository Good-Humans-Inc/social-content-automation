"""Generate config.yaml from Supabase accounts."""

import yaml
import logging
from pathlib import Path
from typing import Optional

from src.supabase_client import ensure_supabase_client

logger = logging.getLogger(__name__)


def generate_config(
    output_path: str,
    persona: Optional[str] = None,
    geelark_api_key: Optional[str] = None,
    geelark_api_base: str = "https://openapi.geelark.com",
) -> None:
    """
    Generate config.yaml from Supabase accounts.

    Args:
        output_path: Path to output config.yaml
        persona: Optional persona filter
        geelark_api_key: GeeLark API key (or use env var)
        geelark_api_base: GeeLark API base URL
    """
    supabase = ensure_supabase_client()

    # Fetch accounts
    query = supabase.from_("accounts").select("*").order("id", desc=False)

    if persona:
        query = query.eq("persona", persona)

    response = query.execute()
    accounts_data = response.data if hasattr(response, "data") else []

    if not accounts_data:
        logger.warning("No accounts found")
        return

    # Build config structure
    config = {
        "geelark": {
            "api_base": geelark_api_base,
            "api_key": geelark_api_key or "${GEELARK_API_KEY}",
        },
        "posting": {
            "schedule_in_minutes": 120,
            "need_share_link": False,
            "mark_ai": False,
        },
        "overlay": {
            "font_path": "./fonts/AutourOne-Regular.ttf",
            "font_size": 60,
            "color": "#ffffff",  # white fill
            "stroke_color": "#000000",  # black outline
            "stroke_width": 12,
            "position": "bottom",
            "padding": 600,
            "wrap_width_chars": 18,
        },
        "template_library": {
            "path": "./input/anime_otome.jsonl",
            "persona": persona or accounts_data[0]["persona"] if accounts_data else "anime_otome",
            "intensity_weights": {
                "T0": 0.5,
                "T1": 0.3,
                "T2": 0.2,
            },
        },
        "accounts": [],
    }

    # Convert accounts to config format
    for account in accounts_data:
        account_config = {
            "id": account["id"],
            "display_name": account["display_name"],
            "env_id": account["env_id"],
            "cloud_phone_id": account.get("cloud_phone_id", account["env_id"]),
            "persona": account["persona"],
        }

        if account.get("preferred_fandoms"):
            account_config["preferred_fandoms"] = account["preferred_fandoms"]

        if account.get("preferred_intensity"):
            account_config["preferred_intensity"] = account["preferred_intensity"]

        if account.get("video_source"):
            account_config["video_source"] = account["video_source"]

        config["accounts"].append(account_config)

    # Write config file
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    with output_file.open("w", encoding="utf-8") as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)

    logger.info(f"Generated config.yaml with {len(config['accounts'])} accounts")
