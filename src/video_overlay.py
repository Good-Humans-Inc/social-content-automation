import os
import shutil
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional, Dict, Any, List, Callable

from src.text_overlay import OverlayOptions, wrap_text


def _hex_to_ffmpeg_color(hex_color: str) -> str:
    c = hex_color.strip()
    if c.startswith("#"):
        c = c[1:]
    if len(c) == 3:
        c = "".join([ch * 2 for ch in c])
    return f"0x{c.lower()}"


def _escape_filter_path(path: str) -> str:
    """Normalise and escape a filesystem path for use inside an FFmpeg filter option."""
    import re
    p = os.path.abspath(path).replace("\\", "/")
    p = re.sub(r'^([A-Za-z]):', r'\1\\\\:', p)
    return p.replace(";", "\\;").replace(",", "\\,").replace("=", "\\=")


def _build_drawtext_filter(textfile_path: str, opts: OverlayOptions) -> str:
    """Build one or more chained drawtext filters with per-line centering.

    Each line in the textfile gets its own drawtext filter so that every line
    is individually centred (x=(w-tw)/2 uses that single line's width).
    """
    with open(textfile_path, "r", encoding="utf-8") as fh:
        raw = fh.read().strip()
    lines = [l.strip() for l in raw.split("\n") if l.strip()]
    if not lines:
        return "null"

    fontfile_escaped = _escape_filter_path(opts.font_path)
    fontcolor = _hex_to_ffmpeg_color(opts.color)
    bordercolor = _hex_to_ffmpeg_color(opts.stroke_color)
    fontsize = opts.font_size
    borderw = max(0, int(opts.stroke_width))
    line_spacing = 8
    line_height = fontsize + line_spacing
    total_height = len(lines) * fontsize + (len(lines) - 1) * line_spacing

    tmpdir = os.path.dirname(textfile_path)

    filters: List[str] = []
    for i, line in enumerate(lines):
        line_file = os.path.join(tmpdir, f"_line_{i}.txt")
        with open(line_file, "w", encoding="utf-8") as fh:
            fh.write(line)
        line_file_escaped = _escape_filter_path(line_file)

        if opts.position == "center":
            y_expr = f"(h-{total_height})/2+{i * line_height}"
        else:
            y_expr = f"h-{int(opts.padding)}-{total_height}+{i * line_height}"

        args = [
            f"fontfile={fontfile_escaped}",
            f"textfile={line_file_escaped}",
            f"fontsize={fontsize}",
            f"fontcolor={fontcolor}",
            f"borderw={borderw}",
            f"bordercolor={bordercolor}",
            "x=(w-tw)/2",
            f"y={y_expr}",
            "box=0",
        ]
        filters.append("drawtext=" + ":".join(args))

    return ",".join(filters)


def _build_animated_drawtext_filters(
    lines: List[str],
    opts: OverlayOptions,
    duration: float,
    animation: str = "line_by_line",
) -> str:
    """Build drawtext filters with time-based animation.

    animation modes:
      - "line_by_line": each line appears sequentially
      - "fade_in": all lines fade in from transparent to opaque
      - "static": plain drawtext (no animation), fallback
    """
    if not lines or animation == "static":
        return ""

    fontfile = os.path.abspath(opts.font_path)
    fontcolor = _hex_to_ffmpeg_color(opts.color)
    bordercolor = _hex_to_ffmpeg_color(opts.stroke_color)
    fontsize = opts.font_size
    borderw = max(0, int(opts.stroke_width))

    fontfile_normalized = fontfile.replace("\\", "/")
    import re
    fontfile_escaped = re.sub(r'^([A-Za-z]):', r'\1\\\\:', fontfile_normalized)
    fontfile_escaped = fontfile_escaped.replace(";", "\\;").replace(",", "\\,").replace("=", "\\=")

    filter_parts = []
    num_lines = len(lines)

    if animation == "line_by_line":
        time_per_line = duration / max(num_lines, 1)
        line_height = fontsize + 12
        total_text_height = num_lines * line_height
        base_y = f"(h-{total_text_height})/2"

        for i, line in enumerate(lines):
            safe_text = line.replace("'", "\\'").replace(":", "\\:")
            start_t = i * time_per_line
            y_offset = i * line_height
            y_expr = f"{base_y}+{y_offset}"
            enable_expr = f"gte(t\\,{start_t:.2f})"
            dt = f"drawtext=fontfile={fontfile_escaped}:text='{safe_text}':fontsize={fontsize}:fontcolor={fontcolor}:borderw={borderw}:bordercolor={bordercolor}:x=(w-tw)/2:y={y_expr}:enable='{enable_expr}'"
            filter_parts.append(dt)
    elif animation == "fade_in":
        fade_duration = min(1.5, duration * 0.3)
        alpha_expr = f"if(lt(t\\,{fade_duration:.2f})\\,t/{fade_duration:.2f}\\,1)"
        combined_text = "\\n".join(
            line.replace("'", "\\'").replace(":", "\\:") for line in lines
        )
        if opts.position == "center":
            y_expr = "(h-th)/2"
        elif opts.position == "top":
            y_expr = str(int(opts.padding))
        else:
            y_expr = f"h-th-{int(opts.padding)}"

        dt = (
            f"drawtext=fontfile={fontfile_escaped}:text='{combined_text}'"
            f":fontsize={fontsize}:fontcolor={fontcolor}@{{{alpha_expr}}}"
            f":borderw={borderw}:bordercolor={bordercolor}"
            f":line_spacing=8:x=(w-tw)/2:y={y_expr}"
        )
        filter_parts.append(dt)

    return ",".join(filter_parts)


def _build_diversification_filters(diversification: Dict[str, Any]) -> List[str]:
    """Build a list of ffmpeg filter fragments from a diversification dict.

    Supports legacy keys (zoom, brightness, contrast, saturation, noise) plus
    the new extended keys (mirror, film_grain, shake, rotation, vignette, border).
    """
    filters: List[str] = []

    if diversification.get("mirror"):
        filters.append("hflip")

    rotation = diversification.get("rotation", 0.0)
    if rotation and abs(rotation) > 0.1:
        import math
        radians = math.radians(rotation)
        filters.append(f"rotate={radians}:fillcolor=black")

    zoom = diversification.get("zoom", 1.0)
    if zoom != 1.0:
        filters.append(f"scale=iw*{zoom}:ih*{zoom},crop=iw:ih")

    eq_parts = []
    if diversification.get("brightness"):
        eq_parts.append(f"brightness={diversification['brightness']}")
    if diversification.get("contrast") and diversification["contrast"] != 1.0:
        eq_parts.append(f"contrast={diversification['contrast']}")
    if diversification.get("saturation") and diversification["saturation"] != 1.0:
        eq_parts.append(f"saturation={diversification['saturation']}")
    if eq_parts:
        filters.append("eq=" + ":".join(eq_parts))

    if diversification.get("noise"):
        filters.append("noise=alls=20:allf=t+u")

    if diversification.get("film_grain"):
        filters.append("noise=alls=12:allf=t+u")

    if diversification.get("shake"):
        intensity = diversification.get("shake_intensity", 4)
        filters.append(
            f"crop=iw-{intensity*2}:ih-{intensity*2}"
            f":{intensity}+random(0)*{intensity}"
            f":{intensity}+random(1)*{intensity}"
        )

    if diversification.get("vignette"):
        filters.append("vignette=PI/4")

    border_color = diversification.get("border")
    border_width = diversification.get("border_width", 20)
    if border_color and border_width > 0:
        c = _hex_to_ffmpeg_color(border_color)
        filters.append(f"drawbox=x=0:y=0:w=iw:h=ih:color={c}:t={border_width}")

    return filters


def _ensure_ffmpeg_available() -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found in PATH. Please install ffmpeg and try again.")


def overlay_text_on_video(
    input_path: str,
    output_path: str,
    text: str,
    opts: OverlayOptions,
    diversification: Optional[Dict[str, Any]] = None,
    audio_path: Optional[str] = None,
) -> None:
    _ensure_ffmpeg_available()

    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)

    # Prepare wrapped text in a temp file (UTF-8)
    wrapped = wrap_text(text, opts.wrap_width_chars)
    with tempfile.TemporaryDirectory() as tmpdir:
        textfile = os.path.join(tmpdir, "overlay.txt")
        with open(textfile, "w", encoding="utf-8") as f:
            f.write(wrapped)

        # Verify the text file exists
        if not os.path.exists(textfile):
            raise FileNotFoundError(f"Overlay text file not found: {textfile}")

        # Build the filter using the helper function
        filtergraph = _build_drawtext_filter(textfile, opts)

        # Apply diversification filters if provided
        if diversification:
            filters = _build_diversification_filters(diversification)
            if filters:
                filtergraph = ",".join(filters) + "," + filtergraph

        # Speed variation
        speed = diversification.get("speed", 1.0) if diversification else 1.0
        atempo = 1.0 / speed if speed != 1.0 else None

        # Convert Windows paths to forward slashes for ffmpeg compatibility
        input_path_normalized = input_path.replace("\\", "/")
        output_path_normalized = output_path.replace("\\", "/")

        # Build ffmpeg command using -vf (video filter)
        # For Windows, we need to properly escape the colon in the filter string
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            input_path_normalized,
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
        ]

        # Add audio input if provided
        if audio_path:
            audio_path_normalized = audio_path.replace("\\", "/")
            cmd.extend(["-i", audio_path_normalized])
            # Map video and audio streams
            cmd.extend(["-map", "0:v:0", "-map", "1:a:0"])
            # Add audio filters for speed if needed
            if atempo:
                cmd.extend(["-filter:a", f"atempo={atempo}"])
            cmd.extend([
                "-c:a",
                "aac",
                "-b:a",
                "192k",
            ])
        else:
            # Add audio filters for speed if needed
            if atempo:
                cmd.extend(["-filter:a", f"atempo={atempo}"])
            cmd.extend([
                "-c:a",
                "aac",
                "-b:a",
                "192k",
            ])

        cmd.extend([
            "-movflags",
            "+faststart",
            output_path_normalized,
        ])

        try:
            # Log the command for debugging
            import logging
            logger = logging.getLogger(__name__)
            logger.debug(f"Running ffmpeg command: {' '.join(cmd)}")
            logger.debug(f"Filter graph: {filtergraph}")
            
            result = subprocess.run(
                cmd, 
                check=True, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE,
                text=True,
                encoding='utf-8',
                errors='replace'
            )
            
            # Log ffmpeg output for debugging
            if result.stderr:
                logger.debug(f"ffmpeg stderr: {result.stderr}")
            if result.stdout:
                logger.debug(f"ffmpeg stdout: {result.stdout}")
                
        except subprocess.CalledProcessError as e:
            # Surface ffmpeg stderr for easier debugging
            stderr_output = e.stderr if isinstance(e.stderr, str) else (e.stderr.decode('utf-8', errors='replace') if e.stderr else "")
            stdout_output = e.stdout if isinstance(e.stdout, str) else (e.stdout.decode('utf-8', errors='replace') if e.stdout else "")
            error_msg = f"ffmpeg failed with code {e.returncode}"
            if stderr_output:
                error_msg += f"\nSTDERR: {stderr_output}"
            if stdout_output:
                error_msg += f"\nSTDOUT: {stdout_output}"
            error_msg += f"\nCommand: {' '.join(cmd)}"
            error_msg += f"\nFilter graph: {filtergraph}"
            raise RuntimeError(error_msg) from e


def create_video_from_images(
    image_paths: List[str],
    output_path: str,
    text: str,
    opts: OverlayOptions,
    image_duration: float = 3.0,
    transition_duration: float = 0.5,
    diversification: Optional[Dict[str, Any]] = None,
    rapid_mode: bool = False,
    audio_path: Optional[str] = None,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> None:
    """
    Create a video from multiple images with text overlay in the middle.

    Uses the loop video filter (loop=-1:1:0) to hold each single-image input
    for the desired duration. This avoids the -stream_loop hang on Debian FFmpeg
    and the removed -loop option on FFmpeg 6+.

    Args:
        image_paths: List of image file paths to convert to video
        output_path: Output video file path
        text: Text to overlay in the middle of the video
        opts: Overlay options for text styling
        image_duration: Duration each image is shown in seconds (ignored if rapid_mode=True)
        transition_duration: Duration of transition between images (0 = no transition)
        diversification: Optional diversification parameters
        rapid_mode: If True, images change rapidly (0.2s each) with static text overlay
        progress_callback: Optional callback(slides_done, total_slides) during slide creation
    """
    _ensure_ffmpeg_available()
    
    if not image_paths:
        raise ValueError("At least one image is required")
    
    # Verify all images exist
    for img_path in image_paths:
        if not os.path.exists(img_path):
            raise FileNotFoundError(f"Image not found: {img_path}")
    
    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
    
    # Prepare wrapped text in a temp file (UTF-8)
    wrapped = wrap_text(text, opts.wrap_width_chars)
    
    with tempfile.TemporaryDirectory() as tmpdir:
        textfile = os.path.join(tmpdir, "overlay.txt")
        with open(textfile, "w", encoding="utf-8") as f:
            f.write(wrapped)
        
        # Verify the text file exists
        if not os.path.exists(textfile):
            raise FileNotFoundError(f"Overlay text file not found: {textfile}")
        
        # Build the text overlay filter (always center for this function)
        # Force center positioning for middle overlay
        center_opts = OverlayOptions(
            font_path=opts.font_path,
            font_size=opts.font_size,
            color=opts.color,
            stroke_color=opts.stroke_color,
            stroke_width=opts.stroke_width,
            position="center",  # Force center for middle overlay
            padding=opts.padding,
            wrap_width_chars=opts.wrap_width_chars,
        )
        text_filter = _build_drawtext_filter(textfile, center_opts)
        
        # Normalize all paths
        normalized_image_paths = [path.replace("\\", "/") for path in image_paths]
        output_path_normalized = output_path.replace("\\", "/")
        textfile_normalized = textfile.replace("\\", "/")
        
        # Build filter complex to create slideshow with text overlay
        # Each image will be shown for image_duration seconds
        num_images = len(normalized_image_paths)
        
        # Rapid mode: images change quickly (0.2s each) with static text overlay
        if rapid_mode:
            # Use a shorter duration for rapid changes (0.2 seconds per image)
            rapid_duration = 0.2
            if progress_callback:
                progress_callback(0, num_images)  # signal "starting slides" so UI can show 51%
            # Standard video dimensions for consistent text size (vertical format for TikTok/Instagram)
            standard_width = 1080
            standard_height = 1920
            
            # Create individual short slide videos with text overlay
            slide_videos = []
            for i, img_path in enumerate(normalized_image_paths):
                slide_video = os.path.join(tmpdir, f"slide_{i:03d}.mp4")
                
                # Build filter: scale image to standard size (maintaining aspect ratio, then pad/crop to exact size)
                # This ensures text size is consistent across all images
                # First scale to fit within standard dimensions while maintaining aspect ratio
                # Then pad or crop to exact dimensions
                scale_filter = f"scale={standard_width}:{standard_height}:force_original_aspect_ratio=decrease"
                pad_filter = f"pad={standard_width}:{standard_height}:(ow-iw)/2:(oh-ih)/2:color=black"
                # Ensure dimensions are even (required for H.264 yuv420p)
                even_dim_filter = f"scale=trunc(iw/2)*2:trunc(ih/2)*2"
                # Use the loop video filter to hold the single image for the desired duration.
                # loop=-1:1:0 = infinite loops, 1 frame, start at frame 0.
                loop_filter = "loop=-1:1:0,setpts=N/30/TB"
                filtergraph = f"{loop_filter},{scale_filter},{pad_filter},{even_dim_filter},{text_filter}"
                
                if diversification:
                    div_filters = _build_diversification_filters(diversification)
                    if div_filters:
                        filtergraph = f"{loop_filter}," + ",".join(div_filters) + f",{scale_filter},{pad_filter},{even_dim_filter},{text_filter}"

                img_abs = os.path.abspath(img_path).replace("\\", "/")
                cmd = [
                    "ffmpeg",
                    "-y",
                    "-i", img_abs,
                    "-vf", filtergraph,
                    "-t", str(rapid_duration),
                    "-c:v", "libx264",
                    "-preset", "ultrafast",  # Faster encode for per-slide (final concat keeps veryfast)
                    "-crf", "18",
                    "-pix_fmt", "yuv420p",
                    "-r", "30",
                    slide_video.replace("\\", "/"),
                ]
                
                try:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.debug(f"Creating rapid slide {i+1}/{num_images}: {' '.join(cmd)}")
                    slide_timeout = int(os.environ.get("VIDEO_SLIDE_TIMEOUT_SECONDS", "120"))
                    subprocess.run(
                        cmd,
                        check=True,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        encoding='utf-8',
                        errors='replace',
                        timeout=slide_timeout,
                    )
                    slide_videos.append(slide_video)
                    if progress_callback:
                        progress_callback(i + 1, num_images)
                except subprocess.TimeoutExpired as e:
                    raise RuntimeError(f"ffmpeg timed out after {slide_timeout}s creating rapid slide {i+1}/{num_images}") from e
                except subprocess.CalledProcessError as e:
                    stderr_output = e.stderr if isinstance(e.stderr, str) else (e.stderr.decode('utf-8', errors='replace') if e.stderr else "")
                    error_msg = f"ffmpeg failed creating rapid slide {i+1} with code {e.returncode}"
                    if stderr_output:
                        error_msg += f"\nSTDERR: {stderr_output}"
                    error_msg += f"\nCommand: {' '.join(cmd)}"
                    raise RuntimeError(error_msg) from e
            
            # Concatenate all rapid slide videos (text stays static in middle throughout)
            concat_file = os.path.join(tmpdir, "concat.txt")
            with open(concat_file, "w", encoding="utf-8") as f:
                for slide_video in slide_videos:
                    abs_path = os.path.abspath(slide_video).replace("\\", "/")
                    f.write(f"file '{abs_path}'\n")
            
            # Concatenate videos
            # For TikTok compatibility: re-encode to ensure consistent frame rate and proper encoding
            # TikTok requirements: MP4, H.264, 1080x1920, 30fps, AAC audio
            # All inputs must come first; then output options (else ffmpeg treats -c:v as decoder for next -i)
            cmd = [
                "ffmpeg",
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", concat_file.replace("\\", "/"),
            ]
            if audio_path and os.path.exists(audio_path):
                audio_path_normalized = audio_path.replace("\\", "/")
                cmd.extend(["-i", audio_path_normalized])
            cmd.extend([
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "192k",
            ])
            if audio_path and os.path.exists(audio_path):
                cmd.extend(["-map", "0:v:0", "-map", "1:a:0", "-shortest"])
            cmd.extend([
                "-movflags", "+faststart",  # Fast start for web streaming/TikTok upload
                output_path_normalized,
            ])
            
            try:
                import logging
                logger = logging.getLogger(__name__)
                logger.debug(f"Concatenating rapid slides: {' '.join(cmd)}")
                
                result = subprocess.run(
                    cmd,
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding='utf-8',
                    errors='replace'
                )
                
                if result.stderr:
                    logger.debug(f"ffmpeg stderr: {result.stderr}")
                if result.stdout:
                    logger.debug(f"ffmpeg stdout: {result.stdout}")
                    
            except subprocess.CalledProcessError as e:
                stderr_output = e.stderr if isinstance(e.stderr, str) else (e.stderr.decode('utf-8', errors='replace') if e.stderr else "")
                stdout_output = e.stdout if isinstance(e.stdout, str) else (e.stdout.decode('utf-8', errors='replace') if e.stdout else "")
                error_msg = f"ffmpeg rapid concatenation failed with code {e.returncode}"
                if stderr_output:
                    error_msg += f"\nSTDERR: {stderr_output}"
                if stdout_output:
                    error_msg += f"\nSTDOUT: {stdout_output}"
                error_msg += f"\nCommand: {' '.join(cmd)}"
                raise RuntimeError(error_msg) from e
            
            return  # Exit early for rapid mode
        
        # Normal mode: Create individual slide videos with text overlay
        # Standard video dimensions for consistent text size (vertical format for TikTok/Instagram)
        standard_width = 1080
        standard_height = 1920
        scale_filter = f"scale={standard_width}:{standard_height}:force_original_aspect_ratio=decrease"
        pad_filter = f"pad={standard_width}:{standard_height}:(ow-iw)/2:(oh-ih)/2:color=black"
        even_dim_filter = f"scale=trunc(iw/2)*2:trunc(ih/2)*2"
        loop_filter = "loop=-1:1:0,setpts=N/30/TB"
        if diversification:
            div_filters = _build_diversification_filters(diversification)
            filtergraph_base = f"{loop_filter}," + (",".join(div_filters) + f",{scale_filter},{pad_filter},{even_dim_filter},{text_filter}" if div_filters else f"{scale_filter},{pad_filter},{even_dim_filter},{text_filter}")
        else:
            filtergraph_base = f"{loop_filter},{scale_filter},{pad_filter},{even_dim_filter},{text_filter}"

        max_workers = int(os.environ.get("VIDEO_SLIDE_WORKERS", "1"))
        if max_workers < 1:
            max_workers = 1
        if progress_callback:
            progress_callback(0, num_images)  # signal "starting slides" so UI can show 51%

        def _create_one_slide(item: tuple) -> tuple:
            i, img_path = item
            import logging
            _log = logging.getLogger(__name__)
            _log.info("Creating slide %s/%s", i + 1, num_images)
            slide_video = os.path.join(tmpdir, f"slide_{i:03d}.mp4")
            img_abs = os.path.abspath(img_path).replace("\\", "/")
            cmd = [
                "ffmpeg", "-y", "-i", img_abs,
                "-vf", filtergraph_base, "-t", str(image_duration),
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
                "-pix_fmt", "yuv420p", "-r", "30", slide_video.replace("\\", "/"),
            ]
            slide_timeout = int(os.environ.get("VIDEO_SLIDE_TIMEOUT_SECONDS", "120"))
            try:
                subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace", timeout=slide_timeout)
            except subprocess.TimeoutExpired as e:
                raise RuntimeError(f"ffmpeg timed out after {slide_timeout}s on slide {i+1}/{num_images}") from e
            return (i, slide_video)

        slide_videos = [None] * num_images  # type: List[Optional[str]]
        if max_workers == 1:
            for i, img_path in enumerate(normalized_image_paths):
                _i, path = _create_one_slide((i, img_path))
                slide_videos[_i] = path
                if progress_callback:
                    progress_callback(_i + 1, num_images)
        else:
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(_create_one_slide, (i, img_path)): i for i, img_path in enumerate(normalized_image_paths)}
                done = 0
                for future in as_completed(futures):
                    i, path = future.result()
                    slide_videos[i] = path
                    done += 1
                    if progress_callback:
                        progress_callback(done, num_images)
        slide_videos = [p for p in slide_videos if p is not None]

        # Concatenate all slide videos
        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w", encoding="utf-8") as f:
            for slide_video in slide_videos:
                # Use absolute path and normalize for Windows
                abs_path = os.path.abspath(slide_video).replace("\\", "/")
                f.write(f"file '{abs_path}'\n")
        
        # Concatenate videos
        # For TikTok compatibility: re-encode to ensure consistent frame rate and proper encoding
        # TikTok requirements: MP4, H.264, 1080x1920, 30fps, AAC audio
        # All inputs must come first; then output options (else ffmpeg treats -c:v as decoder for next -i)
        cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file.replace("\\", "/"),
        ]
        if audio_path and os.path.exists(audio_path):
            audio_path_normalized = audio_path.replace("\\", "/")
            cmd.extend(["-i", audio_path_normalized])
        cmd.extend([
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
        ])
        if audio_path and os.path.exists(audio_path):
            cmd.extend(["-map", "0:v:0", "-map", "1:a:0", "-shortest"])
        cmd.extend([
            "-movflags", "+faststart",  # Fast start for web streaming/TikTok upload
            output_path_normalized,
        ])
        
        try:
            import logging
            logger = logging.getLogger(__name__)
            logger.debug(f"Concatenating slides: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding='utf-8',
                errors='replace'
            )
            
            if result.stderr:
                logger.debug(f"ffmpeg stderr: {result.stderr}")
            if result.stdout:
                logger.debug(f"ffmpeg stdout: {result.stdout}")
                
        except subprocess.CalledProcessError as e:
            stderr_output = e.stderr if isinstance(e.stderr, str) else (e.stderr.decode('utf-8', errors='replace') if e.stderr else "")
            stdout_output = e.stdout if isinstance(e.stdout, str) else (e.stdout.decode('utf-8', errors='replace') if e.stdout else "")
            error_msg = f"ffmpeg concatenation failed with code {e.returncode}"
            if stderr_output:
                error_msg += f"\nSTDERR: {stderr_output}"
            if stdout_output:
                error_msg += f"\nSTDOUT: {stdout_output}"
            error_msg += f"\nCommand: {' '.join(cmd)}"
            raise RuntimeError(error_msg) from e


# ---------------------------------------------------------------------------
# Unified visual rendering (Type A / B / C)
# ---------------------------------------------------------------------------

def render_visual(
    output_path: str,
    overlay_lines: List[str],
    opts: OverlayOptions,
    visual_type: str = "A",
    image_path: Optional[str] = None,
    video_path: Optional[str] = None,
    duration: float = 8.0,
    diversification: Optional[Dict[str, Any]] = None,
    audio_path: Optional[str] = None,
    text_animation: str = "static",
) -> None:
    """Render a single TikTok-format video using one of three visual types.

    Type A - Static Image + Text: image shown with optional Ken Burns / grain.
    Type B - Static Image + Minimal Motion: image is still, text appears
             line-by-line or fades in.
    Type C - Video Base + Text: short loopable video background with overlay.

    Args:
        output_path: destination mp4
        overlay_lines: list of text lines to overlay
        opts: text styling
        visual_type: "A", "B", or "C"
        image_path: required for A and B
        video_path: required for C
        duration: target video duration in seconds
        diversification: dict of effect params (from EffectConfig or legacy)
        audio_path: optional background music
        text_animation: "static" | "line_by_line" | "fade_in"
    """
    _ensure_ffmpeg_available()
    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)

    overlay_text = "\n".join(overlay_lines)
    diversification = diversification or {}

    if visual_type == "C":
        # Type C: loopable video background with text overlay
        if not video_path or not os.path.exists(video_path):
            raise FileNotFoundError(f"Video source required for Type C: {video_path}")
        _render_type_c(video_path, output_path, overlay_text, overlay_lines,
                       opts, duration, diversification, audio_path, text_animation)
    elif visual_type == "B":
        # Type B: still image + animated text
        if not image_path or not os.path.exists(image_path):
            raise FileNotFoundError(f"Image required for Type B: {image_path}")
        _render_type_b(image_path, output_path, overlay_lines,
                       opts, duration, diversification, audio_path, text_animation)
    else:
        # Type A (default): static image + text (with optional Ken Burns)
        if not image_path or not os.path.exists(image_path):
            raise FileNotFoundError(f"Image required for Type A: {image_path}")
        _render_type_a(image_path, output_path, overlay_text, overlay_lines,
                       opts, duration, diversification, audio_path, text_animation)


def _render_type_a(
    image_path: str, output_path: str, overlay_text: str, overlay_lines: List[str],
    opts: OverlayOptions, duration: float, diversification: Dict[str, Any],
    audio_path: Optional[str], text_animation: str,
) -> None:
    """Type A: static image with optional Ken Burns, grain, and text overlay."""
    W, H = 1080, 1920

    with tempfile.TemporaryDirectory() as tmpdir:
        filters: List[str] = ["loop=-1:1:0", "setpts=N/30/TB"]
        input_args = ["-i", os.path.abspath(image_path).replace("\\", "/")]

        ken_burns = diversification.get("ken_burns", False)
        if ken_burns:
            from src.diversifier import build_ken_burns_filter
            kb_dir = diversification.get("ken_burns_direction", "in")
            filters.append(build_ken_burns_filter(W, H, duration, kb_dir))
        else:
            filters.append(f"scale={W}:{H}:force_original_aspect_ratio=decrease")
            filters.append(f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black")

        div_filters = _build_diversification_filters(diversification)
        filters.extend(div_filters)

        filters.append("scale=trunc(iw/2)*2:trunc(ih/2)*2")

        if text_animation != "static" and overlay_lines:
            anim_filter = _build_animated_drawtext_filters(overlay_lines, opts, duration, text_animation)
            if anim_filter:
                filters.append(anim_filter)
            else:
                textfile = os.path.join(tmpdir, "overlay.txt")
                from src.text_overlay import wrap_text
                with open(textfile, "w", encoding="utf-8") as f:
                    f.write(wrap_text(overlay_text, opts.wrap_width_chars))
                filters.append(_build_drawtext_filter(textfile, opts))
        else:
            textfile = os.path.join(tmpdir, "overlay.txt")
            from src.text_overlay import wrap_text
            with open(textfile, "w", encoding="utf-8") as f:
                f.write(wrap_text(overlay_text, opts.wrap_width_chars))
            filters.append(_build_drawtext_filter(textfile, opts))

        filtergraph = ",".join(filters)

        cmd = ["ffmpeg", "-y"] + input_args + [
            "-vf", filtergraph,
            "-t", str(duration),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-pix_fmt", "yuv420p", "-r", "30",
        ]
        _append_audio_args(cmd, audio_path, diversification.get("speed", 1.0))
        cmd.extend(["-movflags", "+faststart", output_path.replace("\\", "/")])
        _run_ffmpeg(cmd)


def _render_type_b(
    image_path: str, output_path: str, overlay_lines: List[str],
    opts: OverlayOptions, duration: float, diversification: Dict[str, Any],
    audio_path: Optional[str], text_animation: str,
) -> None:
    """Type B: still image background + animated text (line-by-line or fade)."""
    W, H = 1080, 1920

    if text_animation == "static":
        text_animation = "line_by_line"

    with tempfile.TemporaryDirectory() as tmpdir:
        filters: List[str] = ["loop=-1:1:0", "setpts=N/30/TB"]
        input_args = ["-i", os.path.abspath(image_path).replace("\\", "/")]

        filters.append(f"scale={W}:{H}:force_original_aspect_ratio=decrease")
        filters.append(f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black")

        div_filters = _build_diversification_filters(diversification)
        filters.extend(div_filters)

        filters.append("scale=trunc(iw/2)*2:trunc(ih/2)*2")

        anim_filter = _build_animated_drawtext_filters(overlay_lines, opts, duration, text_animation)
        if anim_filter:
            filters.append(anim_filter)

        filtergraph = ",".join(filters)

        cmd = ["ffmpeg", "-y"] + input_args + [
            "-vf", filtergraph,
            "-t", str(duration),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-pix_fmt", "yuv420p", "-r", "30",
        ]
        _append_audio_args(cmd, audio_path, diversification.get("speed", 1.0))
        cmd.extend(["-movflags", "+faststart", output_path.replace("\\", "/")])
        _run_ffmpeg(cmd)


def _render_type_c(
    video_path: str, output_path: str, overlay_text: str, overlay_lines: List[str],
    opts: OverlayOptions, duration: float, diversification: Dict[str, Any],
    audio_path: Optional[str], text_animation: str,
) -> None:
    """Type C: loopable video base with text overlay.

    Uses -stream_loop to repeat short clips to fill the target duration.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        filters: List[str] = []
        video_normalized = video_path.replace("\\", "/")
        input_args = ["-stream_loop", "-1", "-i", video_normalized]

        div_filters = _build_diversification_filters(diversification)
        filters.extend(div_filters)

        filters.append("scale=trunc(iw/2)*2:trunc(ih/2)*2")

        if text_animation != "static" and overlay_lines:
            anim_filter = _build_animated_drawtext_filters(overlay_lines, opts, duration, text_animation)
            if anim_filter:
                filters.append(anim_filter)
            else:
                textfile = os.path.join(tmpdir, "overlay.txt")
                from src.text_overlay import wrap_text
                with open(textfile, "w", encoding="utf-8") as f:
                    f.write(wrap_text(overlay_text, opts.wrap_width_chars))
                filters.append(_build_drawtext_filter(textfile, opts))
        else:
            textfile = os.path.join(tmpdir, "overlay.txt")
            from src.text_overlay import wrap_text
            with open(textfile, "w", encoding="utf-8") as f:
                f.write(wrap_text(overlay_text, opts.wrap_width_chars))
            filters.append(_build_drawtext_filter(textfile, opts))

        filtergraph = ",".join(filters)

        cmd = ["ffmpeg", "-y"] + input_args + [
            "-vf", filtergraph,
            "-t", str(duration),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-pix_fmt", "yuv420p", "-r", "30",
        ]
        _append_audio_args(cmd, audio_path, diversification.get("speed", 1.0))
        cmd.extend(["-movflags", "+faststart", output_path.replace("\\", "/")])
        _run_ffmpeg(cmd)


# ---------------------------------------------------------------------------
# Shared ffmpeg helpers
# ---------------------------------------------------------------------------

def _append_audio_args(cmd: List[str], audio_path: Optional[str], speed: float = 1.0) -> None:
    """Append audio input/encoding arguments to an ffmpeg command list."""
    atempo = 1.0 / speed if speed != 1.0 else None
    if audio_path and os.path.exists(audio_path):
        cmd.extend(["-i", audio_path.replace("\\", "/")])
        cmd.extend(["-map", "0:v:0", "-map", "1:a:0", "-shortest"])  # video length wins, cut music
        if atempo:
            cmd.extend(["-filter:a", f"atempo={atempo}"])
        cmd.extend(["-c:a", "aac", "-b:a", "192k"])
    else:
        if atempo:
            cmd.extend(["-filter:a", f"atempo={atempo}"])
        cmd.extend(["-c:a", "aac", "-b:a", "192k"])


def _run_ffmpeg(cmd: List[str]) -> None:
    """Execute an ffmpeg command, raising RuntimeError on failure."""
    import logging as _logging
    _logger = _logging.getLogger(__name__)
    _logger.debug("Running ffmpeg: %s", " ".join(cmd))
    try:
        result = subprocess.run(
            cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", errors="replace",
        )
        if result.stderr:
            _logger.debug("ffmpeg stderr: %s", result.stderr)
    except subprocess.CalledProcessError as e:
        stderr_output = e.stderr if isinstance(e.stderr, str) else (
            e.stderr.decode("utf-8", errors="replace") if e.stderr else ""
        )
        error_msg = f"ffmpeg failed with code {e.returncode}"
        if stderr_output:
            error_msg += f"\nSTDERR: {stderr_output}"
        error_msg += f"\nCommand: {' '.join(cmd)}"
        raise RuntimeError(error_msg) from e