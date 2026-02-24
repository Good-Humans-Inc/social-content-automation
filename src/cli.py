import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import typer

from src.config import AccountConfig, AppConfig, load_config
from src.geelark_client import GeeLarkClient
from src.templates import Template, TemplateLibrary, UsedMeta
from src.text_overlay import OverlayOptions
from src.video_overlay import overlay_text_on_video, create_video_from_images
from src.db_export import export_templates
from src.slideshow_renderer import render_slideshow, render_carousel
from src.db_logger import log_post
from src.db_config import generate_config
from src.retry import retry_with_backoff
from src.scheduler import get_scheduled_time
from src.supabase_client import ensure_supabase_client
from src.video_storage import upload_video_to_supabase
from src.job_worker import run_worker


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

app = typer.Typer(help="Persona-based TikTok automation")


@dataclass
class PreparedPost:
    account: AccountConfig
    template: Template
    video_path: str
    caption: str
    resource_url: Optional[str] = None


def _build_overlay_options(cfg: AppConfig) -> OverlayOptions:
    return OverlayOptions(
        font_path=cfg.overlay.font_path,
        font_size=cfg.overlay.font_size,
        color=cfg.overlay.color,
        stroke_color=cfg.overlay.stroke_color,
        stroke_width=cfg.overlay.stroke_width,
        position=cfg.overlay.position,
        padding=cfg.overlay.padding,
        wrap_width_chars=cfg.overlay.wrap_width_chars,
    )


def _build_caption(caption: str, tags: List[str]) -> str:
    caption = caption.strip()
    tags_str = " ".join(tag.strip() for tag in tags if tag.strip())
    return f"{caption} {tags_str}".strip()


def _resolve_path(path_str: str) -> str:
    path = Path(path_str).expanduser()
    return str(path if path.is_absolute() else path.resolve())


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _compute_asset_hash(*parts: str) -> str:
    """Create a short hash from material-combination identifiers for dedup."""
    import hashlib
    combined = "|".join(str(p) for p in parts if p)
    return hashlib.sha256(combined.encode()).hexdigest()[:16]


def _filter_accounts(accounts: List[AccountConfig], persona: str, account_id: Optional[str]) -> List[AccountConfig]:
    filtered = [acct for acct in accounts if acct.persona == persona]
    if account_id:
        filtered = [acct for acct in filtered if acct.id == account_id]
    return filtered


def _render_video(base_video: str, output_video: str, text: str, overlay_opts: OverlayOptions) -> None:
    logger.info("Rendering overlay: %s -> %s", base_video, output_video)
    overlay_text_on_video(base_video, output_video, text, overlay_opts)
def _resolve_base_video(account: AccountConfig, fallback_video: Optional[str]) -> str:
    candidates: List[str] = []
    if account.video_source:
        candidates.append(account.video_source)
    if fallback_video:
        candidates.append(fallback_video)

    for candidate in candidates:
        path = _resolve_path(candidate)
        if os.path.exists(path):
            return path
    search_paths = ", ".join(candidates) if candidates else "<none>"
    raise FileNotFoundError(f"No video source found for account {account.id}. Checked: {search_paths}")



def _upload_video(client: GeeLarkClient, video_path: str) -> str:
    file_type = client.infer_file_type(video_path)
    urls = client.get_upload_url(file_type)
    client.upload_file_via_put(urls["uploadUrl"], video_path)
    return urls["resourceUrl"]


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
    config_path: Optional[str] = typer.Option(None, help="Path to YAML config"),
    templates_path: Optional[str] = typer.Option(None, help="Override template JSONL path"),
    persona: Optional[str] = typer.Option(None, help="Persona to process"),
    account_id: Optional[str] = typer.Option(None, help="Limit to a single account id"),
    output_dir: str = typer.Option("./output", help="Directory for rendered videos"),
    plan_name: str = typer.Option("auto-plan", help="GeeLark plan name"),
    dry_run: bool = typer.Option(False, help="Render only; skip GeeLark + template writes"),
):
    if ctx.invoked_subcommand is not None:
        return
    autopost(
        config_path=config_path,
        templates_path=templates_path,
        persona=persona,
        account_id=account_id,
        output_dir=output_dir,
        plan_name=plan_name,
        dry_run=dry_run,
    )


def _ensure_geelark_client(cfg: AppConfig) -> GeeLarkClient:
    if not cfg.geelark.api_key:
        typer.secho("Missing GEELARK_API_KEY (env or config)", fg=typer.colors.RED)
        raise typer.Exit(code=1)
    app_id = os.getenv("GEELARK_APP_ID")
    return GeeLarkClient(cfg.geelark.api_base, cfg.geelark.api_key, app_id=app_id)


def _print_phone_row(item: dict, verbose: bool) -> None:
    phone_id = item.get("id", "")
    name = item.get("serialName", "")
    serial_no = item.get("serialNo", "")
    status = item.get("status", "")
    if verbose:
        group = item.get("group", {}) or {}
        remark = item.get("remark", "")
        typer.echo(
            f"{phone_id}\tserialNo={serial_no}\t{name}\tstatus={status}\tgroup={group.get('name','')}\tremark={remark}"
        )
    else:
        typer.echo(phone_id)


@app.command()
def autopost(
    config_path: Optional[str] = typer.Option(None, help="Path to YAML config"),
    templates_path: Optional[str] = typer.Option(None, help="Override template JSONL path"),
    persona: Optional[str] = typer.Option(None, help="Persona to process"),
    account_id: Optional[str] = typer.Option(None, help="Limit to a single account id"),
    output_dir: str = typer.Option("./output", help="Directory for rendered videos"),
    plan_name: str = typer.Option("auto-plan", help="GeeLark plan name"),
    dry_run: bool = typer.Option(False, help="Render videos but skip GeeLark + template writes"),
    default_video: Optional[str] = typer.Option(
        None,
        help="Fallback video file used when an account is missing video_source or the file is absent",
    ),
    post_type: str = typer.Option("video", help="Post type: 'video', 'slideshow', or 'carousel'"),
    slide_images: Optional[str] = typer.Option(
        None,
        help="Comma-separated image paths for slideshow/carousel (required if post_type=slideshow or carousel)",
    ),
    carousel_id: Optional[str] = typer.Option(
        None,
        help="Carousel ID for organizing output (e.g., 'carousel_1'). Auto-generated if not provided.",
    ),
    character_name: Optional[str] = typer.Option(
        None,
        help="Character name for carousel first slide (e.g., 'pochita', 'xavier'). Extracted from template if not provided.",
    ),
    music_path: Optional[str] = typer.Option(
        None,
        help="Path to music/audio file for carousel or slideshow",
    ),
    video_images: Optional[str] = typer.Option(
        None,
        help="Comma-separated image paths to create video from (instead of using base video). Text overlay will be in the middle.",
    ),
    image_duration: float = typer.Option(
        3.0,
        help="Duration each image is shown in seconds (when using --video-images)",
    ),
    rapid_mode: bool = typer.Option(
        False,
        help="Rapid image changes (0.2s per image) with static text overlay in middle (when using --video-images)",
    ),
):
    logger.info("=== Starting persona autopost ===")
    cfg = load_config(config_path)

    persona_to_use = persona or cfg.template_library.persona
    template_file = templates_path or cfg.template_library.path
    overlay_opts = _build_overlay_options(cfg)
    accounts = _filter_accounts(cfg.accounts, persona_to_use, account_id)

    if not accounts:
        typer.secho(f"No accounts found for persona '{persona_to_use}'", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    library = TemplateLibrary.load(template_file)
    logger.info("Loaded %s templates from %s", len(library.templates), template_file)

    os.makedirs(output_dir, exist_ok=True)

    prepared_posts: List[PreparedPost] = []
    for account in accounts:
        template = library.choose(
            persona=persona_to_use,
            intensity_weights=cfg.template_library.intensity_weights,
            fandom_preferences=account.preferred_fandoms,
            preferred_intensity=account.preferred_intensity,
        )
        if not template:
            logger.warning("No unused templates left for persona %s", persona_to_use)
            break

        # Determine if we're using base video or images for video generation
        use_images_for_video = video_images is not None
        
        if not use_images_for_video:
            try:
                base_video = _resolve_base_video(account, default_video)
            except FileNotFoundError as exc:
                typer.secho(str(exc), fg=typer.colors.RED)
                raise typer.Exit(code=1) from exc
        else:
            # Validate images exist
            image_paths_for_video = [img.strip() for img in video_images.split(",")]
            for img_path in image_paths_for_video:
                if not os.path.exists(img_path):
                    typer.secho(f"Error: Image not found: {img_path}", fg=typer.colors.RED)
                    raise typer.Exit(code=1)

        if post_type == "carousel":
            if not slide_images:
                typer.secho("Error: --slide-images required for carousel posts", fg=typer.colors.RED)
                raise typer.Exit(code=1)
            
            image_paths = [img.strip() for img in slide_images.split(",")]
            
            # Check if this is a character grid template
            grid_mode = template.carousel_type == 'character_grid' or template.grid_images == 4
            
            if grid_mode:
                # Grid mode: images must be multiple of 4
                if len(image_paths) % 4 != 0:
                    typer.secho(
                        f"Error: Number of images ({len(image_paths)}) must be a multiple of 4 for grid layout (4, 8, 12, etc.)",
                        fg=typer.colors.RED,
                    )
                    raise typer.Exit(code=1)
            else:
                # Normal mode: images must match overlay lines
                if len(image_paths) != len(template.overlay):
                    typer.secho(
                        f"Error: Number of images ({len(image_paths)}) must match number of overlay lines ({len(template.overlay)})",
                        fg=typer.colors.RED,
                    )
                    raise typer.Exit(code=1)
            
            # Generate carousel ID if not provided
            if not carousel_id:
                carousel_id = f"carousel_{account.id}_{template.id}"
            
            # Extract character name from template or use provided
            char_name = character_name or template.fandom.lower().replace(" ", "_")
            
            # Check if this is a character grid template
            grid_mode = template.carousel_type == 'character_grid' or template.grid_images == 4
            
            # First slide texts (can be customized in template later)
            if grid_mode:
                # For character grid: "Your {character} character"
                first_slide_texts = [f"Your {char_name} character"]
            else:
                # For month format: "Your month" / "Your {character} character"
                first_slide_texts = ["Your month", f"Your {char_name} character"]
            
            # Render carousel
            from src.slideshow_renderer import render_carousel
            slide_files = render_carousel(
                first_slide_texts=first_slide_texts,
                image_paths=image_paths,
                overlay_texts=template.overlay if not grid_mode else [],
                output_dir=output_dir,
                carousel_id=carousel_id,
                opts=overlay_opts,
                slide_duration=3.0,
                audio_path=music_path,
                character_name=char_name,
                grid_mode=grid_mode,
            )
            
            # Use final video for posting
            output_video = os.path.join(output_dir, carousel_id, "final.mp4")
            if not os.path.exists(output_video):
                typer.secho(f"Error: Carousel final video not found: {output_video}", fg=typer.colors.RED)
                raise typer.Exit(code=1)
        
        elif post_type == "slideshow":
            if not slide_images:
                typer.secho("Error: --slide-images required for slideshow posts", fg=typer.colors.RED)
                raise typer.Exit(code=1)
            
            image_paths = [img.strip() for img in slide_images.split(",")]
            if len(image_paths) != len(template.overlay):
                typer.secho(
                    f"Error: Number of images ({len(image_paths)}) must match number of overlay lines ({len(template.overlay)})",
                    fg=typer.colors.RED,
                )
                raise typer.Exit(code=1)
            
            output_video = os.path.join(output_dir, f"{account.id}-{template.id}-slideshow.mp4")
            render_slideshow(
                image_paths=image_paths,
                overlay_texts=template.overlay,
                output_path=output_video,
                opts=overlay_opts,
                slide_duration=3.0,
            )
        else:
            # Regular video post type
            output_video = os.path.join(output_dir, f"{account.id}-{template.id}.mp4")
            overlay_text = "\n".join(template.overlay)
            
            if use_images_for_video:
                # Use multiple images to create video with text overlay in the middle
                image_paths_for_video = [img.strip() for img in video_images.split(",")]
                logger.info("Creating video from %d images with text overlay (rapid_mode=%s)", len(image_paths_for_video), rapid_mode)
                create_video_from_images(
                    image_paths=image_paths_for_video,
                    output_path=output_video,
                    text=overlay_text,
                    opts=overlay_opts,
                    image_duration=image_duration,
                    rapid_mode=rapid_mode,
                )
            else:
                # Use base video with text overlay
                _render_video(base_video, output_video, overlay_text, overlay_opts)
        
        caption = _build_caption(template.caption, template.tags)
        prepared_posts.append(PreparedPost(account=account, template=template, video_path=output_video, caption=caption))

    if not prepared_posts:
        typer.secho("No posts prepared. Check template availability.", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    if dry_run:
        for post in prepared_posts:
            logger.info("[dry-run] Would post %s with template %s using caption: %s", post.account.id, post.template.id, post.caption)
        typer.secho(f"✓ Dry-run complete for {len(prepared_posts)} account(s)", fg=typer.colors.GREEN)
        return

    client = _ensure_geelark_client(cfg)

    tasks = []
    created_ids: List[str] = []
    failed_posts: List[PreparedPost] = []

    # Process each post with retry logic
    for post in prepared_posts:
        try:
            # Get scheduled time with time windows
            schedule_at = get_scheduled_time(post.account.id, cfg.posting.schedule_in_minutes)

            # Handle carousel vs regular video/slideshow
            if post_type == "carousel":
                # Upload all carousel slides (as images, not videos)
                @retry_with_backoff(max_retries=3)
                def upload_carousel_slides():
                    carousel_dir = os.path.dirname(post.video_path)
                    # Get image files (jpg/png) for slides, not MP4
                    slide_files = [f for f in os.listdir(carousel_dir) 
                                  if f.startswith("slide_") and (f.endswith(".jpg") or f.endswith(".png") or f.endswith(".jpeg"))]
                    slide_files.sort()  # Ensure order: slide_000, slide_001, etc.
                    
                    slide_urls = []
                    for slide_file in slide_files:
                        slide_path = os.path.join(carousel_dir, slide_file)
                        # Upload as image
                        file_type = client.infer_file_type(slide_path)
                        urls = client.get_upload_url(file_type)
                        client.upload_file_via_put(urls["uploadUrl"], slide_path)
                        slide_urls.append(urls["resourceUrl"])
                    
                    return slide_urls
                
                slide_urls = upload_carousel_slides()
                
                # Upload music if provided
                music_url = None
                if music_path and os.path.exists(music_path):
                    @retry_with_backoff(max_retries=3)
                    def upload_music():
                        return _upload_video(client, music_path)
                    music_url = upload_music()
                
                # Create carousel task
                @retry_with_backoff(max_retries=3)
                def create_carousel_task():
                    return client.add_carousel_task(
                        slide_urls=slide_urls,
                        caption=post.caption,
                        plan_name=plan_name,
                        music_url=music_url,
                        env_id=post.account.env_id,
                        cloud_phone_id=post.account.cloud_phone_id,
                        schedule_at=schedule_at,
                        need_share_link=cfg.posting.need_share_link,
                        mark_ai=cfg.posting.mark_ai,
                    )
                
                task_id = create_carousel_task()
                post.resource_url = slide_urls[0] if slide_urls else None
            else:
                # Upload video to Supabase Storage for temporary storage and viewing
                video_url = None
                if post.video_path and os.path.exists(post.video_path):
                    video_url = upload_video_to_supabase(
                        video_path=post.video_path,
                        account_id=post.account.id,
                        template_id=post.template.id,
                    )

                # Upload video with retry
                @retry_with_backoff(max_retries=3)
                def upload_with_retry():
                    return _upload_video(client, post.video_path)

                resource_url = upload_with_retry()
                post.resource_url = resource_url

                # Create task with retry
                @retry_with_backoff(max_retries=3)
                def create_task_with_retry():
                    task_data = {
                        "scheduleAt": schedule_at,
                        "envId": post.account.env_id,
                        "video": resource_url,
                        "videoDesc": post.caption,
                        "needShareLink": cfg.posting.need_share_link,
                        "markAI": cfg.posting.mark_ai,
                    }
                    # For slideshows, GeeLark API might need different task_type
                    # Using task_type=1 for now (video), adjust if needed
                    task_ids = client.add_tasks(task_type=1, tasks=[task_data], plan_name=plan_name)
                    return task_ids[0] if task_ids else None

                task_id = create_task_with_retry()

            if task_id:
                created_ids.append(task_id)
                tasks.append({
                    "scheduleAt": schedule_at,
                    "envId": post.account.env_id,
                    "video": resource_url,
                    "videoDesc": post.caption,
                    "needShareLink": cfg.posting.need_share_link,
                    "markAI": cfg.posting.mark_ai,
                })

                # Log success to database
                log_post(
                    template_id=post.template.id,
                    account_id=post.account.id,
                    post_type=post_type,
                    status="success",
                    scheduled_time=datetime.fromtimestamp(schedule_at, tz=timezone.utc),
                    render_path=post.video_path,
                    resource_url=resource_url,
                    video_url=video_url,
                )

                # Mark template as used with success status and asset hash
                used_meta = UsedMeta(
                    timestamp=_timestamp(),
                    account_id=post.account.id,
                    account_display_name=post.account.display_name,
                    cloud_phone_id=post.account.cloud_phone_id,
                    status="success",
                    asset_hash=_compute_asset_hash(
                        post.template.id, post.account.id, post.video_path
                    ),
                )
                library.mark_used(post.template.id, used_meta)
            else:
                raise Exception("Failed to create task")

        except Exception as e:
            logger.error(f"Failed to post {post.account.id} with template {post.template.id}: {e}")
            failed_posts.append(post)

            # Log failure to database
            log_post(
                template_id=post.template.id,
                account_id=post.account.id,
                post_type=post_type,
                status="failed",
                error_message=str(e),
                render_path=post.video_path,
            )

    # Save template library (only mark successful ones as used)
    library.save()

    if created_ids:
        typer.secho(f"✓ Created {len(created_ids)} GeeLark task(s)", fg=typer.colors.GREEN)
        logger.info("Task IDs: %s", created_ids)

    if failed_posts:
        typer.secho(f"⚠ Failed to post {len(failed_posts)} item(s)", fg=typer.colors.YELLOW)
        for post in failed_posts:
            logger.warning(f"Failed: {post.account.id} - {post.template.id}")


@app.command()
def overlay_video(
    input_video: str = typer.Argument(..., help="Path to input video (.mov or .mp4)"),
    output_video: str = typer.Argument(..., help="Path to output .mp4 file"),
    text: str = typer.Option(..., "--text", help="Caption text to overlay"),
    config_path: Optional[str] = typer.Option(None, help="Path to YAML config"),
):
    """Overlay caption text onto a single video using ffmpeg."""

    logger.info("Overlaying video: %s -> %s", input_video, output_video)
    cfg = load_config(config_path)
    overlay_opts = _build_overlay_options(cfg)
    overlay_text_on_video(input_video, output_video, text, overlay_opts)
    typer.secho("✓ Video overlay complete", fg=typer.colors.GREEN)


@app.command()
def gui():
    """Launch the GUI dashboard for asset processing."""
    from src.gui_dashboard import main
    main()


@app.command()
def reset_assets(
    category: Optional[str] = typer.Option(None, help="Reset only assets with this category (e.g., 'uncategorized')"),
    all_processed: bool = typer.Option(False, help="Reset all processed assets (removes file_hash to allow reprocessing)"),
):
    """Reset processed assets to allow reprocessing with updated categorization logic.
    
    Note: Asset processing is now automatic during upload in the dashboard.
    This command is mainly for resetting old assets to be reprocessed with updated logic.
    """
    from rich.console import Console
    from rich.table import Table
    from rich import box
    
    console = Console()
    supabase = ensure_supabase_client()
    
    # Build query
    query = supabase.table('assets').select('*').not_.is_('file_hash', 'null')
    
    if category:
        query = query.eq('category', category)
    
    result = query.execute()
    assets = result.data if hasattr(result, 'data') else []
    
    if not assets:
        console.print(f"[yellow]No assets found to reset[/yellow]")
        return
    
    console.print(f"\n[bold yellow]Found {len(assets)} assets to reset[/bold yellow]")
    console.print("[yellow]This will clear file_hash, category, subcategory, width, height, aspect_ratio[/yellow]")
    console.print("[yellow]Assets will need to be reprocessed to extract metadata again[/yellow]\n")
    
    # Show preview
    if category:
        console.print(f"[cyan]Category filter: {category}[/cyan]")
    
    # Confirm
    confirm = typer.confirm("Are you sure you want to reset these assets?")
    if not confirm:
        console.print("[yellow]Cancelled[/yellow]")
        return
    
    # Reset assets
    reset_count = 0
    for asset in assets:
        try:
            update_result = supabase.table('assets').update({
                'file_hash': None,
                'category': None,
                'subcategory': None,
                'width': None,
                'height': None,
                'aspect_ratio': None,
            }).eq('id', asset['id']).execute()
            
            if update_result.data:
                reset_count += 1
        except Exception as e:
            console.print(f"[red]Error resetting asset {asset['id']}: {e}[/red]")
    
    console.print(f"\n[bold green]✓ Reset {reset_count} assets[/bold green]")
    console.print("[cyan]Note: New uploads are automatically processed in the dashboard.[/cyan]")
    console.print("[cyan]This reset is for reprocessing old assets with updated logic.[/cyan]\n")


@app.command()
def list_envs(
    config_path: Optional[str] = typer.Option(None, help="Path to YAML config"),
    serial_name: Optional[str] = typer.Option(None, help="Filter by cloud phone name"),
    group_name: Optional[str] = typer.Option(None, help="Filter by group name"),
    remark: Optional[str] = typer.Option(None, help="Filter by remark"),
    tag: List[str] = typer.Option(None, "--tag", help="Filter by tag (repeatable)"),
    charge_mode: Optional[int] = typer.Option(None, help="Filter by charge mode 0=on-demand 1=monthly"),
    page_size: int = typer.Option(100, help="How many phones to fetch per request (max 100)"),
    verbose: bool = typer.Option(False, help="Print full rows instead of IDs only"),
    show_environments: bool = typer.Option(False, "--envs", help="Also fetch and display environment IDs from /api/env"),
):
    """Fetch and print cloud phone / environment IDs from GeeLark."""

    # Load config but don't require accounts for this command
    # (since we're trying to GET the account IDs)
    from src.config import GeeLarkConfig
    import os as os_module
    from dotenv import load_dotenv
    
    load_dotenv()
    
    # Load just the GeeLark config without requiring accounts
    geelark_cfg = GeeLarkConfig(
        api_base=os_module.getenv("GEELARK_API_BASE", "https://openapi.geelark.com"),
        api_key=os_module.getenv("GEELARK_API_KEY", ""),
    )
    
    if not geelark_cfg.api_key:
        typer.secho("Missing GEELARK_API_KEY (env or config)", fg=typer.colors.RED)
        raise typer.Exit(code=1)
    
    app_id = os_module.getenv("GEELARK_APP_ID")
    client = GeeLarkClient(geelark_cfg.api_base, geelark_cfg.api_key, app_id=app_id)

    # Fetch environments if requested
    if show_environments:
        try:
            typer.echo("\n=== Environments (from /api/env) ===")
            envs_data = client.list_environments()
            # The response structure may vary, try common formats
            if isinstance(envs_data, list):
                for env in envs_data:
                    env_id = env.get("id") or env.get("envId") or env.get("env_id")
                    env_name = env.get("name") or env.get("envName") or env.get("env_name") or ""
                    if env_id:
                        typer.echo(f"  env_id: {env_id}  name: {env_name}")
            elif isinstance(envs_data, dict):
                # Try to extract list from common keys
                items = envs_data.get("items") or envs_data.get("list") or envs_data.get("data") or []
                if items:
                    for env in items:
                        env_id = env.get("id") or env.get("envId") or env.get("env_id")
                        env_name = env.get("name") or env.get("envName") or env.get("env_name") or ""
                        if env_id:
                            typer.echo(f"  env_id: {env_id}  name: {env_name}")
                else:
                    # Maybe it's a single object or different structure
                    typer.echo(f"  Response: {envs_data}")
            else:
                typer.echo(f"  Response: {envs_data}")
        except Exception as e:
            typer.secho(f"  Error fetching environments: {e}", fg=typer.colors.YELLOW)

    # Fetch cloud phones
    typer.echo("\n=== Cloud Phones (from /open/v1/phone/list) ===")
    filters = {
        "serial_name": serial_name,
        "group_name": group_name,
        "remark": remark,
        "tags": tag or None,
        "charge_mode": charge_mode,
    }

    total = None
    page = 1
    seen = 0

    while True:
        data = client.list_phones(
            page=page,
            page_size=page_size,
            serial_name=filters["serial_name"],
            group_name=filters["group_name"],
            remark=filters["remark"],
            tags=filters["tags"],
            charge_mode=filters["charge_mode"],
        )
        items = data.get("items", []) or []
        if total is None:
            total = data.get("total", len(items))
            typer.echo(f"Total phones: {total}")
        if not items:
            break
        for item in items:
            _print_phone_row(item, verbose)
        seen += len(items)
        if total is not None and seen >= total:
            break
        page += 1

    typer.echo(f"\nListed {seen} phone(s)")
    typer.echo("\nNote: Use the phone 'id' as both env_id and cloud_phone_id in your config.yaml")


@app.command()
def export_templates_cmd(
    output_path: str = typer.Option(..., "--output", "-o", help="Output JSONL file path"),
    persona: Optional[str] = typer.Option(None, help="Filter by persona"),
    include_used: bool = typer.Option(False, "--include-used", help="Include used templates"),
):
    """Export templates from Supabase database to JSONL format."""
    try:
        count = export_templates(
            output_path=output_path,
            persona=persona,
            unused_only=not include_used,
        )
        typer.secho(f"✓ Exported {count} templates to {output_path}", fg=typer.colors.GREEN)
    except Exception as e:
        typer.secho(f"Error: {e}", fg=typer.colors.RED)
        raise typer.Exit(code=1) from e


@app.command()
def generate_config_cmd(
    output_path: str = typer.Option("./config.yaml", "--output", "-o", help="Output config file path"),
    persona: Optional[str] = typer.Option(None, help="Filter by persona"),
):
    """Generate config.yaml from Supabase accounts."""
    try:
        generate_config(
            output_path=output_path,
            persona=persona,
        )
        typer.secho(f"✓ Generated config.yaml at {output_path}", fg=typer.colors.GREEN)
    except Exception as e:
        typer.secho(f"Error: {e}", fg=typer.colors.RED)
        raise typer.Exit(code=1) from e


@app.command()
def worker(
    poll_interval: int = typer.Option(5, "--poll-interval", "-i", help="Poll interval in seconds"),
    output_dir: str = typer.Option("./output", "--output-dir", "-o", help="Output directory for generated videos"),
):
    """Run the job worker to process video generation jobs from the queue."""
    try:
        typer.secho("Starting job worker...", fg=typer.colors.GREEN)
        typer.secho(f"Polling every {poll_interval} seconds", fg=typer.colors.BLUE)
        typer.secho(f"Output directory: {output_dir}", fg=typer.colors.BLUE)
        typer.secho("Press Ctrl+C to stop", fg=typer.colors.YELLOW)
        run_worker(poll_interval=poll_interval, output_dir=output_dir)
    except KeyboardInterrupt:
        typer.secho("\nWorker stopped", fg=typer.colors.YELLOW)
    except Exception as e:
        typer.secho(f"Error: {e}", fg=typer.colors.RED)
        raise typer.Exit(code=1) from e


@app.command()
def daily_summary(
    date_str: Optional[str] = typer.Option(
        None, "--date", "-d",
        help="Date to summarize in YYYY-MM-DD format (defaults to today)",
    ),
    json_output: bool = typer.Option(False, "--json", help="Output as JSON instead of table"),
):
    """Print a daily summary of posting activity."""
    import json as _json
    from src.daily_summary import generate_daily_summary, print_daily_summary

    target_date = None
    if date_str:
        from datetime import timezone as _tz
        target_date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=_tz.utc)

    summary = generate_daily_summary(target_date)
    if json_output:
        typer.echo(_json.dumps(summary, indent=2))
    else:
        print_daily_summary(summary)


@app.command()
def run_daily(
    config_path: Optional[str] = typer.Option(None, help="Path to YAML config"),
    templates_path: Optional[str] = typer.Option(None, help="Override template JSONL path"),
    output_dir: str = typer.Option("./output", help="Directory for rendered videos"),
    plan_name: str = typer.Option("daily-auto", help="GeeLark plan name"),
    dry_run: bool = typer.Option(False, help="Render only; skip GeeLark + template writes"),
    default_video: Optional[str] = typer.Option(None, help="Fallback base video"),
    post_type: str = typer.Option("video", help="Post type: 'video', 'slideshow', or 'carousel'"),
):
    """Orchestrate a full daily posting run across all accounts.

    For each configured account this command will:
      1. Check whether the daily post quota has room left.
      2. Determine which intensity tier (T0/T1/T2) is most needed based on
         the account's target ratio and today's existing posts.
      3. Select an unused template matching the required intensity.
      4. Render the video (or slideshow).
      5. Upload to GeeLark and create a scheduled task.
      6. Mark the template as used.

    After all accounts are processed a daily summary is printed.
    """
    from src.daily_tracker import has_daily_quota, choose_next_intensity
    from src.daily_summary import generate_daily_summary, print_daily_summary
    from src.diversifier import get_random_effect_config, effect_config_to_dict

    logger.info("=== Starting daily orchestration ===")
    cfg = load_config(config_path)
    template_file = templates_path or cfg.template_library.path
    overlay_opts = _build_overlay_options(cfg)
    library = TemplateLibrary.load(template_file)
    logger.info("Loaded %s templates from %s", len(library.templates), template_file)

    os.makedirs(output_dir, exist_ok=True)

    client = None
    if not dry_run:
        client = _ensure_geelark_client(cfg)

    total_created = 0
    total_failed = 0

    for account in cfg.accounts:
        persona = account.persona
        daily_target = account.daily_post_target
        ratio = account.intensity_ratio or cfg.template_library.intensity_weights

        if not has_daily_quota(account.id, daily_target):
            logger.info(
                "Account %s already at daily quota (%d). Skipping.",
                account.id, daily_target,
            )
            continue

        # Determine how many posts this account still needs today
        from src.daily_tracker import get_total_posts_today
        posts_done = get_total_posts_today(account.id)
        posts_remaining = daily_target - posts_done

        for _ in range(posts_remaining):
            preferred_intensity = choose_next_intensity(
                account.id, daily_target, ratio
            )
            if preferred_intensity is None:
                break

            template = library.choose(
                persona=persona,
                intensity_weights=cfg.template_library.intensity_weights,
                fandom_preferences=account.preferred_fandoms,
                preferred_intensity=preferred_intensity,
            )
            if not template:
                logger.warning("No unused templates for %s / %s", persona, preferred_intensity)
                break

            # Render
            try:
                overlay_text = "\n".join(template.overlay)
                output_video = os.path.join(
                    output_dir, f"{account.id}-{template.id}.mp4"
                )

                if post_type == "video":
                    base_video = _resolve_base_video(account, default_video)
                    effects = effect_config_to_dict(get_random_effect_config())
                    overlay_text_on_video(
                        base_video, output_video, overlay_text, overlay_opts,
                        diversification=effects,
                    )
                elif post_type == "slideshow":
                    logger.info("Slideshow rendering requires --slide-images; skipping in daily mode")
                    continue
                else:
                    logger.info("Carousel rendering requires --slide-images; skipping in daily mode")
                    continue

                caption = _build_caption(template.caption, template.tags)

                if dry_run:
                    logger.info(
                        "[dry-run] %s -> template %s (%s)",
                        account.id, template.id, preferred_intensity,
                    )
                    continue

                # Upload and schedule
                schedule_at = get_scheduled_time(
                    account.id, cfg.posting.schedule_in_minutes
                )

                video_url = upload_video_to_supabase(
                    output_video, account.id, template.id
                )

                @retry_with_backoff(max_retries=3)
                def _upload():
                    return _upload_video(client, output_video)
                resource_url = _upload()

                @retry_with_backoff(max_retries=3)
                def _create_task():
                    task_data = {
                        "scheduleAt": schedule_at,
                        "envId": account.env_id,
                        "video": resource_url,
                        "videoDesc": caption,
                        "needShareLink": cfg.posting.need_share_link,
                        "markAI": cfg.posting.mark_ai,
                    }
                    ids = client.add_tasks(
                        task_type=1, tasks=[task_data], plan_name=plan_name,
                    )
                    return ids[0] if ids else None

                task_id = _create_task()
                if not task_id:
                    raise Exception("GeeLark returned no task ID")

                log_post(
                    template_id=template.id,
                    account_id=account.id,
                    post_type=post_type,
                    status="success",
                    scheduled_time=datetime.fromtimestamp(schedule_at, tz=timezone.utc),
                    render_path=output_video,
                    resource_url=resource_url,
                    video_url=video_url,
                    asset_combination_hash=_compute_asset_hash(
                        template.id, account.id, output_video,
                    ),
                )
                used_meta = UsedMeta(
                    timestamp=_timestamp(),
                    account_id=account.id,
                    account_display_name=account.display_name,
                    cloud_phone_id=account.cloud_phone_id,
                    status="success",
                    asset_hash=_compute_asset_hash(
                        template.id, account.id, output_video,
                    ),
                )
                library.mark_used(template.id, used_meta)
                total_created += 1
                logger.info(
                    "Posted %s -> %s (%s, task=%s)",
                    account.id, template.id, preferred_intensity, task_id,
                )

            except Exception as e:
                total_failed += 1
                logger.error(
                    "Failed posting for %s (template %s): %s",
                    account.id, template.id, e,
                )
                log_post(
                    template_id=template.id,
                    account_id=account.id,
                    post_type=post_type,
                    status="failed",
                    error_message=str(e),
                )

    library.save()

    typer.secho(
        f"\nDaily run complete: {total_created} succeeded, {total_failed} failed",
        fg=typer.colors.GREEN if total_failed == 0 else typer.colors.YELLOW,
    )

    # Print daily summary
    summary = generate_daily_summary()
    print_daily_summary(summary)


if __name__ == "__main__":
    app()

