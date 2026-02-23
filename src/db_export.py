"""Export templates from Supabase database to JSONL format."""

import json
import logging
from pathlib import Path
from typing import List, Optional

from src.supabase_client import ensure_supabase_client

logger = logging.getLogger(__name__)


def export_templates(
    output_path: str,
    persona: Optional[str] = None,
    unused_only: bool = True,
) -> int:
    """
    Export templates from Supabase to JSONL file.

    Args:
        output_path: Path to output JSONL file
        persona: Optional persona filter
        unused_only: Only export unused templates (used is null)

    Returns:
        Number of templates exported
    """
    supabase = ensure_supabase_client()

    # Build query
    query = supabase.from_("templates").select("*").order("id", desc=False)

    if persona:
        query = query.eq("persona", persona)

    if unused_only:
        query = query.is_("used", "null")

    # Fetch all templates
    response = query.execute()
    templates = response.data if hasattr(response, "data") else []

    if not templates:
        logger.warning("No templates found matching criteria")
        return 0

    # Write to JSONL
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    with output_file.open("w", encoding="utf-8") as f:
        for template in templates:
            # Convert to JSONL format matching existing structure
            jsonl_entry = {
                "id": template["id"],
                "persona": template["persona"],
                "fandom": template["fandom"],
                "intensity": template["intensity"],
                "overlay": template["overlay"],
                "caption": template["caption"],
                "tags": template["tags"],
                "used": template["used"],
            }
            f.write(json.dumps(jsonl_entry, ensure_ascii=False) + "\n")

    logger.info(f"Exported {len(templates)} templates to {output_path}")
    return len(templates)
