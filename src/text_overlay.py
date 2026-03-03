import re
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


_EMOJI_RE = re.compile(
    "["
    "\U00010000-\U0010FFFF"  # supplementary planes (most emoji live here)
    "\u2600-\u27BF"          # misc symbols & dingbats
    "\uFE00-\uFE0F"          # variation selectors
    "\u200B-\u200F"           # zero-width chars
    "\u200D"                  # zero-width joiner (emoji sequences)
    "\u2028\u2029"            # line/paragraph separators
    "]+",
    flags=re.UNICODE,
)


def strip_unsupported_chars(text: str) -> str:
    """Remove emoji and control characters that render as boxes in most fonts."""
    text = _EMOJI_RE.sub("", text)
    text = re.sub(r"  +", " ", text)
    return text.strip()


def wrap_text(text: str, max_chars: int) -> str:
    """Simple greedy word-wrap used by both image/video overlays."""

    text = strip_unsupported_chars(text)

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

