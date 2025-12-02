from dataclasses import dataclass
from typing import Tuple

from PIL import Image, ImageDraw, ImageFont


@dataclass
class OverlayOptions:
    font_path: str
    font_size: int
    color: str
    stroke_color: str
    stroke_width: int
    position: str
    padding: int
    wrap_width_chars: int


def _wrap_text(text: str, max_chars: int) -> str:
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


def _text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> Tuple[int, int]:
    bbox = draw.multiline_textbbox((0, 0), text, font=font, align="center")
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def overlay_text(input_path: str, output_path: str, text: str, opts: OverlayOptions) -> None:
    image = Image.open(input_path).convert("RGBA")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype(opts.font_path, opts.font_size)
    except OSError:
        # Fallback to a default font if the specified TTF cannot be opened
        # Note: Pillow's default font is bitmap and ignores font_size
        print(f"[image_overlay] Warning: could not open font '{opts.font_path}'. Using Pillow default font.")
        font = ImageFont.load_default()

    wrapped = _wrap_text(text, opts.wrap_width_chars)
    text_w, text_h = _text_size(draw, wrapped, font)
    img_w, img_h = image.size

    if opts.position == "center":
        x = (img_w - text_w) // 2
        y = (img_h - text_h) // 2
    else:  # bottom
        x = (img_w - text_w) // 2
        y = img_h - text_h - opts.padding

    draw.multiline_text(
        (x, y),
        wrapped,
        font=font,
        fill=opts.color,
        stroke_width=opts.stroke_width,
        stroke_fill=opts.stroke_color,
        align="center",
        spacing=8,
    )

    image.convert("RGB").save(output_path, quality=95)



