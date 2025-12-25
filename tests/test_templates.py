import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.templates import TemplateLibrary, UsedMeta


def _write_templates(tmp_path: Path, rows):
    data = "\n".join(json.dumps(row) for row in rows) + "\n"
    path = tmp_path / "library.jsonl"
    path.write_text(data, encoding="utf-8")
    return path


def test_choose_and_mark_used(tmp_path):
    rows = [
        {
            "id": "template_1",
            "persona": "anime_otome",
            "fandom": "genshin_impact",
            "intensity": "T0",
            "overlay": ["line a"],
            "caption": "caption a",
            "tags": ["#a"],
            "used": None,
        },
        {
            "id": "template_2",
            "persona": "anime_otome",
            "fandom": "jjk",
            "intensity": "T1",
            "overlay": ["line b"],
            "caption": "caption b",
            "tags": ["#b"],
            "used": None,
        },
    ]
    path = _write_templates(tmp_path, rows)

    library = TemplateLibrary.load(str(path))
    pick = library.choose(persona="anime_otome", fandom_preferences=["genshin_impact"])
    assert pick is not None
    assert pick.fandom == "genshin_impact"

    meta = UsedMeta(
        timestamp=datetime.now(timezone.utc).isoformat(),
        account_id="acc_01",
        account_display_name="account",
        cloud_phone_id="env",
    )
    library.mark_used(pick.id, meta)
    library.save()

    reloaded = TemplateLibrary.load(str(path))
    used_templates = [t for t in reloaded.templates if t.used]
    assert len(used_templates) == 1
    assert used_templates[0].used.account_id == "acc_01"

