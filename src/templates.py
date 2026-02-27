import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional


Intensity = str  # "T0" | "T1" | "T2"


@dataclass
class UsedMeta:
    timestamp: str
    account_id: str
    account_display_name: str
    cloud_phone_id: str

    @classmethod
    def from_dict(cls, data: Dict) -> "UsedMeta":
        # Dashboard auto-generate uses used_at, job_id, character; legacy uses timestamp, account_display_name, cloud_phone_id
        timestamp = data.get("timestamp") or data.get("used_at") or ""
        account_id = data.get("account_id") or ""
        account_display_name = data.get("account_display_name") or data.get("character") or ""
        cloud_phone_id = data.get("cloud_phone_id") or ""
        return cls(
            timestamp=timestamp,
            account_id=account_id,
            account_display_name=account_display_name,
            cloud_phone_id=cloud_phone_id,
        )

    def to_dict(self) -> Dict[str, str]:
        return {
            "timestamp": self.timestamp,
            "account_id": self.account_id,
            "account_display_name": self.account_display_name,
            "cloud_phone_id": self.cloud_phone_id,
        }


@dataclass
class Template:
    id: str
    persona: str
    fandom: str
    intensity: Intensity
    overlay: List[str]
    caption: str
    tags: List[str]
    used: Optional[UsedMeta]

    @classmethod
    def from_dict(cls, data: Dict) -> "Template":
        used_data = data.get("used")
        used = UsedMeta.from_dict(used_data) if isinstance(used_data, dict) else None
        return cls(
            id=data["id"],
            persona=data["persona"],
            fandom=data["fandom"],
            intensity=data.get("intensity", "T0"),
            overlay=list(data.get("overlay", [])),
            caption=data.get("caption", ""),
            tags=list(data.get("tags", [])),
            used=used,
        )

    def to_dict(self) -> Dict:
        payload = {
            "id": self.id,
            "persona": self.persona,
            "fandom": self.fandom,
            "intensity": self.intensity,
            "overlay": self.overlay,
            "caption": self.caption,
            "tags": self.tags,
            "used": self.used.to_dict() if self.used else None,
        }
        return payload


class TemplateLibrary:
    def __init__(self, path: Path, templates: List[Template]):
        self.path = path
        self.templates = templates
        self._index = {template.id: template for template in templates}

    @classmethod
    def load(cls, path: str) -> "TemplateLibrary":
        file_path = Path(path)
        if not file_path.exists():
            raise FileNotFoundError(f"Template dataset not found: {path}")
        templates: List[Template] = []
        with file_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                templates.append(Template.from_dict(json.loads(line)))
        return cls(file_path, templates)

    def save(self) -> None:
        lines = [json.dumps(template.to_dict(), ensure_ascii=False) for template in self.templates]
        with self.path.open("w", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + ("\n" if lines else ""))

    def unused(self, persona: str) -> List[Template]:
        return [t for t in self.templates if t.persona == persona and t.used is None]

    def _apply_fandom_preferences(self, candidates: List[Template], fandoms: Iterable[str]) -> List[Template]:
        for fandom in fandoms:
            prioritized = [t for t in candidates if t.fandom == fandom]
            if prioritized:
                return prioritized
        return candidates

    def _filter_intensity(self, candidates: List[Template], preferred: Optional[Intensity]) -> List[Template]:
        if not preferred:
            return candidates
        preferred_matches = [t for t in candidates if t.intensity == preferred]
        return preferred_matches or candidates

    def choose(
        self,
        persona: str,
        intensity_weights: Optional[Dict[Intensity, float]] = None,
        fandom_preferences: Optional[Iterable[str]] = None,
        preferred_intensity: Optional[Intensity] = None,
    ) -> Optional[Template]:
        candidates = self.unused(persona)
        if not candidates:
            return None

        if fandom_preferences:
            candidates = self._apply_fandom_preferences(candidates, fandom_preferences)

        candidates = self._filter_intensity(candidates, preferred_intensity)

        if intensity_weights:
            weights = [max(0.0, intensity_weights.get(t.intensity, 0.0)) for t in candidates]
            total = sum(weights)
            if total > 0:
                return random.choices(candidates, weights=weights, k=1)[0]

        return random.choice(candidates)

    def mark_used(self, template_id: str, meta: UsedMeta) -> None:
        template = self._index.get(template_id)
        if not template:
            raise KeyError(f"Unknown template id {template_id}")
        template.used = meta



