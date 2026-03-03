"""Generate slideshow videos from images with text overlay."""

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import List, Optional

from src.text_overlay import OverlayOptions, wrap_text


def _ensure_ffmpeg_available() -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found in PATH. Please install ffmpeg and try again.")


def _hex_to_ffmpeg_color(hex_color: str) -> str:
    c = hex_color.strip()
    if c.startswith("#"):
        c = c[1:]
    if len(c) == 3:
        c = "".join([ch * 2 for ch in c])
    return f"0x{c.lower()}"


def _quote_for_filter(value: str) -> str:
    """Quote a value for ffmpeg filter arguments."""
    return "'" + value.replace("'", r"\'") + "'"


def _escape_filter_path(path: str) -> str:
    """Normalise and escape a path for FFmpeg filter options."""
    import re
    p = os.path.abspath(path).replace("\\", "/")
    p = re.sub(r'^([A-Za-z]):', r'\1\\\\:', p)
    return p.replace(";", "\\;").replace(",", "\\,").replace("=", "\\=")


def _create_image_with_text(
    image_path: str, text: str, output_path: str, opts: OverlayOptions, duration: float = 3.0
) -> None:
    """Create a video frame from an image with text overlay."""
    fontfile_escaped = _escape_filter_path(opts.font_path)
    fontcolor = _hex_to_ffmpeg_color(opts.color)
    bordercolor = _hex_to_ffmpeg_color(opts.stroke_color)
    fontsize = opts.font_size
    borderw = max(0, int(opts.stroke_width))
    line_spacing = 8

    wrapped = wrap_text(text, opts.wrap_width_chars)
    lines = [l.strip() for l in wrapped.split("\n") if l.strip()]
    if not lines:
        lines = [""]

    line_height = fontsize + line_spacing
    total_height = len(lines) * fontsize + (len(lines) - 1) * line_spacing

    tmp_text_paths: list[str] = []
    try:
        drawtext_parts: list[str] = []
        for i, line in enumerate(lines):
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.txt', delete=False) as tmp:
                tmp.write(line)
                tmp_text_paths.append(tmp.name)
            line_escaped = _escape_filter_path(tmp_text_paths[-1])

            if opts.position == "center":
                y_expr = f"(h-{total_height})/2+{i * line_height}"
            else:
                y_expr = f"h-{int(opts.padding)}-{total_height}+{i * line_height}"

            drawtext_parts.append(
                f"drawtext=fontfile={fontfile_escaped}:"
                f"textfile={line_escaped}:"
                f"fontsize={fontsize}:"
                f"fontcolor={fontcolor}:"
                f"borderw={borderw}:"
                f"bordercolor={bordercolor}:"
                f"x=(w-tw)/2:"
                f"y={y_expr}:"
                f"box=0"
            )

        text_filter = "scale=trunc(iw/2)*2:trunc(ih/2)*2," + ",".join(drawtext_parts)
    except Exception:
        for p in tmp_text_paths:
            try:
                os.unlink(p)
            except Exception:
                pass
        raise

    # Normalize image and output paths for Windows
    image_path_normalized = image_path.replace("\\", "/")
    output_path_normalized = output_path.replace("\\", "/")

    image_path_abs = os.path.abspath(image_path).replace("\\", "/")
    loop_and_filter = f"loop=-1:1:0,setpts=N/30/TB,{text_filter}"
    cmd = [
        "ffmpeg",
        "-y",
        "-i", image_path_abs,
        "-vf", loop_and_filter,
        "-t", str(duration),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        output_path_normalized,
    ]

    try:
        result = subprocess.run(
            cmd, 
            check=True, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
    except subprocess.CalledProcessError as e:
        for p in tmp_text_paths:
            try:
                os.unlink(p)
            except Exception:
                pass

        stderr_output = e.stderr if isinstance(e.stderr, str) else (e.stderr.decode('utf-8', errors='replace') if e.stderr else "")
        error_msg = f"ffmpeg failed with code {e.returncode}"
        if stderr_output:
            error_msg += f"\nSTDERR: {stderr_output}"
        error_msg += f"\nCommand: {' '.join(cmd)}"
        error_msg += f"\nFilter: {text_filter}"
        raise RuntimeError(error_msg) from e

    for p in tmp_text_paths:
        try:
            os.unlink(p)
        except Exception:
            pass


def _create_text_only_slide(
    text_lines: List[str],
    output_path: str,
    opts: OverlayOptions,
    duration: float = 3.0,
    width: int = 1080,
    height: int = 1920,
) -> None:
    """Create a video slide with text only (no image background)."""
    import re
    
    # Create a solid color background (white or pastel)
    bg_color = "0xFFFFFF"  # White background
    
    # Filter out empty lines and strip whitespace
    filtered_lines = [line.strip() for line in text_lines if line.strip()]
    if not filtered_lines:
        filtered_lines = [" "]  # At least one line to avoid errors
    
    # Write text to temporary file with proper UTF-8 encoding (no BOM)
    # Write file using text mode with explicit encoding to avoid BOM issues
    import codecs
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.txt', delete=False, newline='\n') as tmp_text:
        # Write each line with LF line endings
        # Filter out any potential problematic characters
        clean_lines = []
        for line in filtered_lines:
            # Remove any non-printable characters except newlines
            clean_line = ''.join(char for char in line if char.isprintable() or char == '\n')
            clean_lines.append(clean_line)
        text_content = '\n'.join(clean_lines)
        tmp_text.write(text_content)
        tmp_text.flush()  # Ensure it's written
        tmp_text_path = tmp_text.name
    
    try:
        # Build text overlay filter using textfile
        fontfile = os.path.abspath(opts.font_path)
        fontfile_normalized = fontfile.replace("\\", "/")
        tmp_text_normalized = tmp_text_path.replace("\\", "/")
        
        # Escape Windows paths
        fontfile_escaped = re.sub(r'^([A-Za-z]):', r'\1\\\\:', fontfile_normalized)
        tmp_text_escaped = re.sub(r'^([A-Za-z]):', r'\1\\\\:', tmp_text_normalized)
        
        fontfile_escaped = fontfile_escaped.replace(";", "\\;").replace(",", "\\,").replace("=", "\\=")
        tmp_text_escaped = tmp_text_escaped.replace(";", "\\;").replace(",", "\\,").replace("=", "\\=")
        
        fontcolor = _hex_to_ffmpeg_color(opts.color)
        bordercolor = _hex_to_ffmpeg_color(opts.stroke_color)
        fontsize = opts.font_size
        borderw = max(0, int(opts.stroke_width))
        
        # Center text horizontally and vertically
        x_expr = "(w-tw)/2"
        y_expr = "(h-th)/2"
        
        drawtext_filter = (
            f"drawtext=fontfile={fontfile_escaped}:"
            f"textfile={tmp_text_escaped}:"
            f"fontsize={fontsize}:"
            f"fontcolor={fontcolor}:"
            f"borderw={borderw}:"
            f"bordercolor={bordercolor}:"
            f"line_spacing=8:"
            f"text_align=center:"
            f"x={x_expr}:"
            f"y={y_expr}:"
            f"box=0"
        )
        
        output_path_normalized = output_path.replace("\\", "/")
        
        # Create video with solid color background and text
        cmd = [
            "ffmpeg",
            "-y",
            "-f", "lavfi",
            "-i", f"color=c={bg_color}:s={width}x{height}:d={duration}",
            "-vf", drawtext_filter,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-r", "30",
            output_path_normalized,
        ]
        
        result = subprocess.run(
            cmd,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
    except subprocess.CalledProcessError as e:
        stderr_output = e.stderr if isinstance(e.stderr, str) else (e.stderr.decode('utf-8', errors='replace') if e.stderr else "")
        error_msg = f"ffmpeg failed with code {e.returncode}"
        if stderr_output:
            error_msg += f"\nSTDERR: {stderr_output}"
        raise RuntimeError(error_msg) from e
    finally:
        # Clean up temp file
        try:
            if 'tmp_text_path' in locals() and tmp_text_path and os.path.exists(tmp_text_path):
                os.unlink(tmp_text_path)
        except:
            pass


def _create_4_image_grid(
    image_paths: List[str],
    output_path: str,
    border_width: int = 10,
    border_color: str = "0x000000",
    duration: float = 3.0,
    overlay_text: Optional[str] = None,
    opts: Optional[OverlayOptions] = None,
) -> None:
    """
    Create a 2x2 grid of 4 images with borders.
    
    Args:
        image_paths: List of exactly 4 image paths
        output_path: Output video path
        border_width: Width of border between images in pixels
        border_color: Border color in hex format (e.g., "0x000000" for black)
        duration: Duration of the video in seconds
    """
    if len(image_paths) != 4:
        raise ValueError("Exactly 4 images are required for grid layout")
    
    _ensure_ffmpeg_available()
    
    # Video dimensions (vertical format for TikTok/Instagram)
    width = 1080
    height = 1920
    
    # Calculate grid dimensions (2x2)
    # Each image will be (width - 3*border) / 2 wide and (height - 3*border) / 2 tall
    img_width = (width - 3 * border_width) // 2
    img_height = (height - 3 * border_width) // 2
    
    # Normalize all paths
    normalized_paths = [path.replace("\\", "/") for path in image_paths]
    output_path_normalized = output_path.replace("\\", "/")
    
    # Build complex filter to create 2x2 grid
    # We'll use scale and pad filters to resize images and add borders
    # Then use overlay to position them
    
    # Scale all images to fit grid cell
    # The issue: pad filter requires output dimensions >= input dimensions
    # Solution: Use scale with force_original_aspect_ratio=decrease to fit within bounds,
    # then use pad with explicit dimensions. To avoid errors, ensure scale output is always <= target
    scale_filters = []
    for i in range(4):
        # Scale to fit within target dimensions, then crop/pad to exact size
        # Use scale with increase to ensure we can crop to exact size, or use a two-step approach
        # Better: scale to fit (may be smaller), then pad only if needed, or crop if larger
        # Actually, let's use scale with decrease, then pad with a check, or use crop
        # Simplest: scale to slightly larger than target, then crop to exact size
        # This avoids the pad dimension error
        scale_filters.append(f"[{i}:v]loop=-1:1:0,setpts=N/30/TB,scale={img_width}:{img_height}:force_original_aspect_ratio=increase[scaled{i}];[scaled{i}]crop={img_width}:{img_height}:(iw-{img_width})/2:(ih-{img_height})/2[v{i}]")
    
    # Create base canvas with border color
    base_filter = f"color={border_color}:size={width}x{height}:duration={duration}[base]"
    
    # Overlay images in 2x2 grid
    # Top-left: [v0] at (border, border)
    # Top-right: [v1] at (border*2 + img_width, border)
    # Bottom-left: [v2] at (border, border*2 + img_height)
    # Bottom-right: [v3] at (border*2 + img_width, border*2 + img_height)
    
    overlay1 = f"[base][v0]overlay={border_width}:{border_width}[tmp1]"
    overlay2 = f"[tmp1][v1]overlay={border_width*2 + img_width}:{border_width}[tmp2]"
    overlay3 = f"[tmp2][v2]overlay={border_width}:{border_width*2 + img_height}[tmp3]"
    overlay4_base = f"[tmp3][v3]overlay={border_width*2 + img_width}:{border_width*2 + img_height}"
    
    # Track temp file for cleanup
    temp_text_file = None
    
    # Add text overlay if provided
    if overlay_text and opts:
        import re
        import tempfile
        
        # Write text to temporary file
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.txt', delete=False) as tmp_text:
            tmp_text.write(overlay_text)
            temp_text_file = tmp_text.name
        
        try:
            # Build text overlay filter
            fontfile = os.path.abspath(opts.font_path)
            fontfile_normalized = fontfile.replace("\\", "/")
            tmp_text_normalized = temp_text_file.replace("\\", "/")
            
            # Escape Windows paths
            fontfile_escaped = re.sub(r'^([A-Za-z]):', r'\1\\\\:', fontfile_normalized)
            tmp_text_escaped = re.sub(r'^([A-Za-z]):', r'\1\\\\:', tmp_text_normalized)
            
            fontfile_escaped = fontfile_escaped.replace(";", "\\;").replace(",", "\\,").replace("=", "\\=")
            tmp_text_escaped = tmp_text_escaped.replace(";", "\\;").replace(",", "\\,").replace("=", "\\=")
            
            fontcolor = _hex_to_ffmpeg_color(opts.color)
            bordercolor = _hex_to_ffmpeg_color(opts.stroke_color)
            fontsize = opts.font_size
            borderw = max(0, int(opts.stroke_width))
            
            # Center text in the middle of the grid
            x_expr = "(w-tw)/2"
            y_expr = "(h-th)/2"
            
            text_overlay = f"[grid]drawtext=fontfile={fontfile_escaped}:textfile={tmp_text_escaped}:fontsize={fontsize}:fontcolor={fontcolor}:borderw={borderw}:bordercolor={bordercolor}:line_spacing=8:x={x_expr}:y={y_expr}:box=0[out]"
            
            # Combine all filters with text overlay
            filter_complex = ";".join(scale_filters) + ";" + base_filter + ";" + overlay1 + ";" + overlay2 + ";" + overlay3 + ";" + overlay4_base + "[grid];" + text_overlay
        except Exception as e:
            # If text overlay fails, use grid without text
            filter_complex = ";".join(scale_filters) + ";" + base_filter + ";" + overlay1 + ";" + overlay2 + ";" + overlay3 + ";" + overlay4_base + "[out]"
            # Clean up temp file
            try:
                if temp_text_file and os.path.exists(temp_text_file):
                    os.unlink(temp_text_file)
                    temp_text_file = None
            except:
                pass
    else:
        # No text overlay, just use grid
        filter_complex = ";".join(scale_filters) + ";" + base_filter + ";" + overlay1 + ";" + overlay2 + ";" + overlay3 + ";" + overlay4_base + "[out]"
    
    # Build ffmpeg command
    cmd = [
        "ffmpeg",
        "-y",
    ]
    
    for img_path in normalized_paths:
        cmd.extend(["-i", os.path.abspath(img_path).replace("\\", "/")])
    
    # Add filter and output settings
    cmd.extend([
        "-filter_complex", filter_complex,
        "-map", "[out]",
        "-t", str(duration),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        output_path_normalized,
    ])
    
    try:
        subprocess.run(
            cmd,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
    except subprocess.CalledProcessError as e:
        stderr_output = e.stderr if isinstance(e.stderr, str) else (e.stderr.decode('utf-8', errors='replace') if e.stderr else "")
        error_msg = f"ffmpeg grid creation failed with code {e.returncode}"
        if stderr_output:
            error_msg += f"\nSTDERR: {stderr_output}"
        error_msg += f"\nCommand: {' '.join(cmd)}"
        raise RuntimeError(error_msg) from e
    finally:
        # Clean up temp text file if it was created
        if 'temp_text_file' in locals() and temp_text_file and os.path.exists(temp_text_file):
            try:
                os.unlink(temp_text_file)
            except:
                pass


def render_carousel(
    first_slide_texts: List[str],
    image_paths: List[str],
    overlay_texts: List[str],
    output_dir: str,
    carousel_id: str,
    opts: OverlayOptions,
    slide_duration: float = 3.0,
    audio_path: Optional[str] = None,
    character_name: Optional[str] = None,
    grid_mode: bool = False,
    character_names: Optional[List[str]] = None,  # For multi-character carousels
) -> List[str]:
    """
    Render a carousel slideshow with first slide being text-only.
    Individual slides are kept as images (or temporary videos for text overlay),
    only the final concatenated video is saved as MP4.
    
    Args:
        first_slide_texts: Text lines for the first slide (e.g., ["Your month", "Your {character} character"])
        image_paths: List of image file paths for subsequent slides
        overlay_texts: List of text to overlay on each image slide (ignored in grid_mode)
        output_dir: Base output directory
        carousel_id: Unique identifier for this carousel (e.g., "carousel_1")
        opts: Overlay options for text styling
        slide_duration: Duration of each slide in seconds (for final video)
        audio_path: Optional audio file to add to slideshow
        character_name: Character name to substitute in first slide text (e.g., "pochita")
        grid_mode: If True, arrange images in 4-image grids (2x2) with borders. 
                   image_paths should be a multiple of 4. overlay_texts is ignored.
        character_names: Optional list of character names for each grid (for multi-character carousels)
    
    Returns:
        List of output file paths: [slide images..., final.mp4]
    """
    _ensure_ffmpeg_available()
    
    if grid_mode:
        # In grid mode, we need multiples of 4 images
        if len(image_paths) % 4 != 0:
            raise ValueError(f"In grid mode, number of images must be a multiple of 4. Got {len(image_paths)}")
        if not image_paths:
            raise ValueError("At least 4 images are required for grid mode")
        # In grid mode, overlay_texts is ignored, so we don't validate it
    else:
        # Normal mode: images must match overlay texts
        if len(image_paths) != len(overlay_texts):
            raise ValueError("Number of images must match number of overlay texts")
        if not image_paths:
            raise ValueError("At least one image is required")
    
    # Create carousel directory
    carousel_dir = os.path.join(output_dir, carousel_id)
    os.makedirs(carousel_dir, exist_ok=True)
    
    # Substitute character name in first slide text
    if character_name:
        first_slide_texts = [text.replace("{character}", character_name) for text in first_slide_texts]
    
    slide_files = []
    
    with tempfile.TemporaryDirectory() as tmpdir:
        # Temporary video files for concatenation (not saved permanently)
        temp_slide_videos = []
        
        # Create first slide (text only) - temporary video for concatenation
        first_slide_temp = os.path.join(tmpdir, "slide_000.mp4")
        _create_text_only_slide(first_slide_texts, first_slide_temp, opts, slide_duration)
        temp_slide_videos.append(first_slide_temp)
        # Save first slide as image (optional - for reference)
        first_slide_image = os.path.join(carousel_dir, "slide_000.jpg")
        # Extract frame from video as image
        cmd_extract = [
            "ffmpeg",
            "-y",
            "-i", first_slide_temp.replace("\\", "/"),
            "-vframes", "1",
            "-q:v", "2",
            first_slide_image.replace("\\", "/"),
        ]
        subprocess.run(cmd_extract, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        slide_files.append(first_slide_image)
        
        # Create image slides
        if grid_mode:
            # Grid mode: arrange images in 4-image grids
            num_grids = len(image_paths) // 4
            for grid_idx in range(num_grids):
                grid_images = image_paths[grid_idx * 4:(grid_idx + 1) * 4]
                
                # Verify all images exist
                for img_path in grid_images:
                    if not os.path.exists(img_path):
                        raise FileNotFoundError(f"Image not found: {img_path}")
                
                # Create grid slide
                slide_image = os.path.join(carousel_dir, f"slide_{grid_idx+1:03d}.jpg")
                slide_temp_video = os.path.join(tmpdir, f"slide_{grid_idx+1:03d}.mp4")
                
                # Get character name for this grid (if provided)
                grid_char_name = None
                if character_names and grid_idx < len(character_names):
                    grid_char_name = character_names[grid_idx].capitalize()
                
                # Create 4-image grid with optional character name overlay
                _create_4_image_grid(
                    grid_images, 
                    slide_temp_video, 
                    border_width=10, 
                    duration=slide_duration,
                    overlay_text=grid_char_name,
                    opts=opts if grid_char_name else None
                )
                temp_slide_videos.append(slide_temp_video)
                
                # Extract frame from video as final image
                cmd_extract = [
                    "ffmpeg",
                    "-y",
                    "-i", slide_temp_video.replace("\\", "/"),
                    "-vframes", "1",
                    "-q:v", "2",
                    slide_image.replace("\\", "/"),
                ]
                subprocess.run(cmd_extract, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                slide_files.append(slide_image)
        else:
            # Normal mode: create image slides with text overlay
            for i, (image_path, text) in enumerate(zip(image_paths, overlay_texts)):
                if not os.path.exists(image_path):
                    raise FileNotFoundError(f"Image not found: {image_path}")
                
                # Save final image with overlay (for GeeLark upload)
                slide_image = os.path.join(carousel_dir, f"slide_{i+1:03d}.jpg")
                
                # Create temporary video with text overlay for concatenation
                slide_temp_video = os.path.join(tmpdir, f"slide_{i+1:03d}.mp4")
                _create_image_with_text(image_path, text, slide_temp_video, opts, slide_duration)
                temp_slide_videos.append(slide_temp_video)
                
                # Extract frame from video as final image
                cmd_extract = [
                    "ffmpeg",
                    "-y",
                    "-i", slide_temp_video.replace("\\", "/"),
                    "-vframes", "1",
                    "-q:v", "2",
                    slide_image.replace("\\", "/"),
                ]
                subprocess.run(cmd_extract, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                slide_files.append(slide_image)
        
        # Create concatenated final video from temporary videos
        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w") as f:
            for slide_video in temp_slide_videos:
                f.write(f"file '{os.path.abspath(slide_video).replace(chr(92), '/')}'\n")
        
        # Concatenate all slides into final video
        final_video = os.path.join(carousel_dir, "final.mp4")
        cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file.replace("\\", "/"),
            "-c", "copy",
        ]
        
        # Add audio if provided
        if audio_path and os.path.exists(audio_path):
            audio_path_normalized = audio_path.replace("\\", "/")
            cmd.extend(["-i", audio_path_normalized, "-c:a", "aac", "-b:a", "192k", "-map", "0:v:0", "-map", "1:a:0", "-shortest"])  # video length wins, cut music
        else:
            cmd.extend(["-c:a", "aac", "-b:a", "192k"])
        
        final_video_normalized = final_video.replace("\\", "/")
        cmd.extend([
            "-movflags", "+faststart",
            final_video_normalized,
        ])
        
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except subprocess.CalledProcessError as e:
            raise RuntimeError(
                f"ffmpeg concatenation failed with code {e.returncode}: {e.stderr.decode('utf-8', errors='ignore')}"
            ) from e
    
    return slide_files + [final_video]  # Return individual slide images + final MP4 video


def render_slideshow(
    image_paths: List[str],
    overlay_texts: List[str],
    output_path: str,
    opts: OverlayOptions,
    slide_duration: float = 3.0,
    transition_duration: float = 0.5,
    audio_path: Optional[str] = None,
) -> None:
    """
    Render a slideshow video from images with text overlays.

    Args:
        image_paths: List of image file paths
        overlay_texts: List of text to overlay on each slide (must match image_paths length)
        output_path: Output video file path
        opts: Overlay options for text styling
        slide_duration: Duration of each slide in seconds
        transition_duration: Duration of transition between slides
        audio_path: Optional audio file to add to slideshow
    """
    _ensure_ffmpeg_available()

    if len(image_paths) != len(overlay_texts):
        raise ValueError("Number of images must match number of overlay texts")

    if not image_paths:
        raise ValueError("At least one image is required")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)

    with tempfile.TemporaryDirectory() as tmpdir:
        # Create individual slide videos
        slide_videos = []
        for i, (image_path, text) in enumerate(zip(image_paths, overlay_texts)):
            if not os.path.exists(image_path):
                raise FileNotFoundError(f"Image not found: {image_path}")

            slide_video = os.path.join(tmpdir, f"slide_{i:03d}.mp4")
            _create_image_with_text(image_path, text, slide_video, opts, slide_duration)
            slide_videos.append(slide_video)

        # Concatenate slides
        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w") as f:
            for slide_video in slide_videos:
                f.write(f"file '{os.path.abspath(slide_video)}'\n")

        # Concatenate videos
        cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-c", "copy",
        ]

        # Add audio if provided
        if audio_path and os.path.exists(audio_path):
            cmd.extend(["-i", audio_path, "-c:a", "aac", "-b:a", "192k", "-map", "0:v:0", "-map", "1:a:0", "-shortest"])  # video length wins, cut music
        else:
            cmd.extend(["-c:a", "aac", "-b:a", "192k"])

        cmd.extend([
            "-movflags", "+faststart",
            output_path,
        ])

        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except subprocess.CalledProcessError as e:
            raise RuntimeError(
                f"ffmpeg concatenation failed with code {e.returncode}: {e.stderr.decode('utf-8', errors='ignore')}"
            ) from e
