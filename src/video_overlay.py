import os
import shutil
import subprocess
import tempfile

from src.image_overlay import OverlayOptions, _wrap_text


def _hex_to_ffmpeg_color(hex_color: str) -> str:
    c = hex_color.strip()
    if c.startswith("#"):
        c = c[1:]
    if len(c) == 3:
        c = "".join([ch * 2 for ch in c])
    return f"0x{c.lower()}"


def _quote_for_filter(value: str) -> str:
    """Quote a value for ffmpeg filter arguments to handle spaces and special chars."""
    return "'" + value.replace("'", r"\'") + "'"


def _build_drawtext_filter(textfile_path: str, opts: OverlayOptions) -> str:
    fontfile = os.path.abspath(opts.font_path)
    fontcolor = _hex_to_ffmpeg_color(opts.color)
    bordercolor = _hex_to_ffmpeg_color(opts.stroke_color)
    fontsize = opts.font_size
    borderw = max(0, int(opts.stroke_width))

    # Positioning
    if opts.position == "center":
        x_expr = "(w-tw)/2"
        y_expr = "(h-th)/2"
    else:
        x_expr = "(w-tw)/2"
        y_expr = f"h-th-{int(opts.padding)}"

    # Note: using textfile to avoid escaping issues for multiline/UTF-8 text
    # line_spacing mirrors PIL's spacing=8 used in image overlay
    args = [
        f"fontfile={_quote_for_filter(fontfile)}",
        f"textfile={_quote_for_filter(textfile_path)}",
        f"fontsize={fontsize}",
        f"fontcolor={fontcolor}",
        f"borderw={borderw}",
        f"bordercolor={bordercolor}",
        "line_spacing=8",
        f"x={x_expr}",
        f"y={y_expr}",
        "box=0",
    ]
    return "drawtext=" + ":".join(args)


def _ensure_ffmpeg_available() -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found in PATH. Please install ffmpeg and try again.")


def overlay_text_on_video(input_path: str, output_path: str, text: str, opts: OverlayOptions) -> None:
    _ensure_ffmpeg_available()

    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)

    # Prepare wrapped text in a temp file (UTF-8)
    wrapped = _wrap_text(text, opts.wrap_width_chars)
    with tempfile.TemporaryDirectory() as tmpdir:
        textfile = os.path.join(tmpdir, "overlay.txt")
        with open(textfile, "w", encoding="utf-8") as f:
            f.write(wrapped)

        filtergraph = _build_drawtext_filter(textfile, opts)

        # Re-encode video with overlay. Keep audio stream if present.
        # Use H.264 + AAC for broad compatibility and add faststart for web upload.
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            input_path,
            "-vf",
            filtergraph,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            output_path,
        ]

        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except subprocess.CalledProcessError as e:
            # Surface ffmpeg stderr for easier debugging
            raise RuntimeError(
                f"ffmpeg failed with code {e.returncode}: {e.stderr.decode('utf-8', errors='ignore')}"
            ) from e


