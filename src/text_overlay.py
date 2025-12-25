from dataclasses import dataclass


@dataclass
class OverlayOptions:
    """Font and layout settings shared by the ffmpeg text overlay helper."""

    font_path: str
    font_size: int
    color: str
    stroke_color: str
    stroke_width: int
    position: str
    padding: int
    wrap_width_chars: int


def wrap_text(text: str, max_chars: int) -> str:
    """Simple greedy word-wrap used by both image/video overlays."""

    words = text.split()
    if not words:
        return text

    lines = []
    current = words[0]
    for word in words[1:]:
        if len(current) + 1 + len(word) <= max_chars:
            current += " " + word
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return "\n".join(lines)



