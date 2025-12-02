import os
import logging
from pathlib import Path
from typing import List

import typer
from tqdm import tqdm

from src.config import load_config
from src.geelark_client import GeeLarkClient
from src.openai_text import OpenAITextGenerator
from src.image_overlay import OverlayOptions, overlay_text
from src.video_overlay import overlay_text_on_video


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

app = typer.Typer(help="TikTok automation with GeeLark")


def _collect_images(images_dir: str) -> List[str]:
    paths = []
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        paths.extend([str(p) for p in Path(images_dir).glob(f"*{ext}")])
    return sorted(paths)


@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
    prompt: str = typer.Option(None, help="Prompt for generating captions (falls back to config.default_prompt)"),
    images_dir: str = typer.Option("./images", help="Input images directory"),
    output_dir: str = typer.Option("./output", help="Output images directory"),
    config_path: str = typer.Option(None, help="Path to YAML config (auto-detects ./config.yaml)"),
    plan_name: str = typer.Option("auto-plan", help="GeeLark plan name"),
):
    # If a subcommand (like 'run') is invoked, do nothing here
    if ctx.invoked_subcommand is not None:
        return
    # Otherwise, behave like the 'run' command
    run(prompt=prompt, images_dir=images_dir, output_dir=output_dir, config_path=config_path, plan_name=plan_name)


@app.command()
def run(
    prompt: str = typer.Option(None, help="Prompt for generating captions (falls back to config.default_prompt)"),
    images_dir: str = typer.Option("./images", help="Input images directory"),
    output_dir: str = typer.Option("./output", help="Output images directory"),
    config_path: str = typer.Option(None, help="Path to YAML config (auto-detects ./config.yaml)"),
    plan_name: str = typer.Option("auto-plan", help="GeeLark plan name"),
):
    logger.info("=== Starting TikTok Automation Workflow ===")
    logger.info(f"Images directory: {images_dir}")
    logger.info(f"Output directory: {output_dir}")
    logger.info(f"Config path: {config_path or 'auto-detect ./config.yaml'}")
    
    cfg = load_config(config_path)
    logger.info(f"Loaded config: {len(cfg.posting.env_ids)} environments, task_type={cfg.posting.task_type}")

    os.makedirs(output_dir, exist_ok=True)
    images = _collect_images(images_dir)
    logger.info(f"Found {len(images)} images in {images_dir}")
    
    if not images:
        typer.secho("No images found in images_dir", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    # Resolve prompt; allow fallback to generator's built-in default if none provided
    effective_prompt = prompt or cfg.default_prompt
    logger.info(f"Using prompt: {'custom' if prompt else 'from config' if cfg.default_prompt else 'built-in default'}")

    # Generate captions (enough for each environment)
    num_envs = len(cfg.posting.env_ids)
    if num_envs == 0:
        typer.secho("No env_ids configured in posting.env_ids", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    logger.info(f"Generating {num_envs} captions (one per environment)")
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        typer.secho("Missing OPENAI_API_KEY", fg=typer.colors.RED)
        raise typer.Exit(code=1)
    generator = OpenAITextGenerator(openai_api_key, cfg.openai.model, cfg.openai.temperature)
    logger.info(f"Using OpenAI model: {cfg.openai.model}, temperature: {cfg.openai.temperature}")
    
    if effective_prompt:
        captions = generator.generate_list(effective_prompt, n=num_envs)
    else:
        # Use generator's internal default prompt
        captions = generator.generate_list(n=num_envs)
    
    logger.info(f"Generated {len(captions)} captions")
    for i, cap in enumerate(captions):
        logger.info(f"  Caption {i}: {cap[:60]}..." if len(cap) > 60 else f"  Caption {i}: {cap}")
    
    # Validate we have enough captions for all environments
    if len(captions) < num_envs:
        typer.secho(f"Generated {len(captions)} captions but need {num_envs} (one per environment)", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    # Determine how many images each environment gets based on images_per_post
    images_per_env = cfg.posting.images_per_post
    total_images_needed = num_envs * images_per_env
    
    logger.info(f"Distribution plan: {num_envs} envs × {images_per_env} images/post = {total_images_needed} images needed")
    
    if len(images) < total_images_needed:
        typer.secho(
            f"Not enough images: need {total_images_needed} ({num_envs} envs × {images_per_env} images/post) but found {len(images)}",
            fg=typer.colors.RED
        )
        raise typer.Exit(code=1)
    
    # Use only the exact number of images needed
    images_to_use = images[:total_images_needed]
    logger.info(f"Using {len(images_to_use)} images from {len(images)} available")
    
    # Overlay text on images (pair each caption with corresponding images)
    overlay_opts = OverlayOptions(
        font_path=cfg.image_overlay.font_path,
        font_size=cfg.image_overlay.font_size,
        color=cfg.image_overlay.color,
        stroke_color=cfg.image_overlay.stroke_color,
        stroke_width=cfg.image_overlay.stroke_width,
        position=cfg.image_overlay.position,
        padding=cfg.image_overlay.padding,
        wrap_width_chars=cfg.image_overlay.wrap_width_chars,
    )

    # Render images with captions: each environment gets unique images
    # env0 gets images[0:images_per_env], env1 gets images[images_per_env:2*images_per_env], etc.
    logger.info(f"Rendering images with overlay (font: {cfg.image_overlay.font_path}, size: {cfg.image_overlay.font_size})")
    rendered_items_by_env: List[List[dict]] = [[] for _ in range(num_envs)]
    
    for env_idx in range(num_envs):
        start_idx = env_idx * images_per_env
        end_idx = start_idx + images_per_env
        env_images = images_to_use[start_idx:end_idx]
        caption = captions[env_idx]
        
        logger.info(f"Env {env_idx}: rendering {len(env_images)} images with caption: {caption[:60]}...")
        for img_idx, img in enumerate(tqdm(env_images, desc=f"Rendering env {env_idx+1}/{num_envs}")):
            outfile = os.path.join(output_dir, f"rendered_env{env_idx:02d}_{img_idx:03d}.jpg")
            overlay_text(img, outfile, caption, overlay_opts)
            rendered_items_by_env[env_idx].append({"path": outfile, "caption": caption})
    
    logger.info(f"Rendered {sum(len(items) for items in rendered_items_by_env)} total images")

    # GeeLark interactions
    if not cfg.geelark.api_key:
        typer.secho("Missing GEELARK_API_KEY (env or config)", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    logger.info(f"Connecting to GeeLark API: {cfg.geelark.api_base}")
    # Pass app_id if available for key verification, otherwise use token verification
    app_id = os.getenv("GEELARK_APP_ID")
    client = GeeLarkClient(cfg.geelark.api_base, cfg.geelark.api_key, app_id=app_id)

    # Upload rendered files per environment
    logger.info("Starting upload to GeeLark temporary storage")
    uploaded_items_by_env: List[List[dict]] = []
    for env_idx, rendered_items in enumerate(rendered_items_by_env):
        uploaded_env: List[dict] = []
        logger.info(f"Uploading {len(rendered_items)} files for env {env_idx}")
        for item in tqdm(rendered_items, desc=f"Uploading env {env_idx+1}/{num_envs}"):
            fpath = item["path"]
            ext = client.infer_file_type(fpath)
            urls = client.get_upload_url(ext)
            client.upload_file_via_put(urls["uploadUrl"], fpath)
            uploaded_env.append({"url": urls["resourceUrl"], "caption": item["caption"]})
            logger.debug(f"Uploaded: {fpath} -> {urls['resourceUrl']}")
        uploaded_items_by_env.append(uploaded_env)
    
    logger.info(f"Uploaded {sum(len(items) for items in uploaded_items_by_env)} total files")

    # Prepare tasks per envId
    schedule_at = client.schedule_timestamp(cfg.posting.schedule_in_minutes)
    logger.info(f"Scheduling tasks for {cfg.posting.schedule_in_minutes} minutes from now (timestamp: {schedule_at})")
    
    tasks = []
    if cfg.posting.task_type == "image_set":
        logger.info("Creating image_set tasks")
        # Each environment gets unique images and caption
        for env_idx, env_id in enumerate(cfg.posting.env_ids):
            uploaded_items = uploaded_items_by_env[env_idx]
            caption = captions[env_idx]
            
            # Split uploads into chunks per post
            chunk_size = max(1, cfg.posting.images_per_post)
            chunks = [uploaded_items[i:i + chunk_size] for i in range(0, len(uploaded_items), chunk_size)]
            
            logger.info(f"Env {env_idx} ({env_id}): creating {len(chunks)} task(s) with {chunk_size} image(s) each")
            for chunk_idx, chunk in enumerate(chunks):
                images_urls = [x["url"] for x in chunk]
                task = {
                    "scheduleAt": schedule_at,
                    "envId": env_id,
                    "images": images_urls,
                    "videoDesc": cfg.posting.video_desc_template.format(text=caption),
                    "videoTitle": cfg.posting.video_title_template.format(text=caption),
                    "needShareLink": cfg.posting.need_share_link,
                    "markAI": cfg.posting.mark_ai,
                }
                tasks.append(task)
                logger.debug(f"Task {len(tasks)}: env={env_id}, images={len(images_urls)}, desc={task['videoDesc'][:50]}...")
        task_type = 3
    elif cfg.posting.task_type == "video":
        logger.info("Creating video tasks")
        # Each environment gets unique video and caption
        for env_idx, env_id in enumerate(cfg.posting.env_ids):
            uploaded_items = uploaded_items_by_env[env_idx]
            caption = captions[env_idx]
            
            # Use first video from this environment's uploads
            if uploaded_items:
                task = {
                    "scheduleAt": schedule_at,
                    "envId": env_id,
                    "video": uploaded_items[0]["url"],
                    "videoDesc": cfg.posting.video_desc_template.format(text=caption),
                    "needShareLink": cfg.posting.need_share_link,
                    "markAI": cfg.posting.mark_ai,
                }
                tasks.append(task)
                logger.info(f"Env {env_idx} ({env_id}): video task with desc={task['videoDesc'][:50]}...")
        task_type = 1
    else:  # warmup
        logger.info("Creating warmup tasks")
        for env_id in cfg.posting.env_ids:
            task = {
                "scheduleAt": schedule_at,
                "envId": env_id,
                "action": cfg.warmup.action,
                "keywords": cfg.warmup.keywords,
                "duration": cfg.warmup.duration_minutes,
            }
            tasks.append(task)
            logger.info(f"Warmup task for {env_id}: action={cfg.warmup.action}, duration={cfg.warmup.duration_minutes}m")
        task_type = 2

    # Submit tasks in batches of <= 100
    BATCH = 100
    logger.info(f"Submitting {len(tasks)} tasks to GeeLark (plan: {plan_name})")
    created_ids: List[str] = []
    num_batches = (len(tasks) + BATCH - 1) // BATCH
    
    for i in range(0, len(tasks), BATCH):
        batch = tasks[i:i + BATCH]
        batch_num = (i // BATCH) + 1
        logger.info(f"Submitting batch {batch_num}/{num_batches} ({len(batch)} tasks)")
        try:
            ids = client.add_tasks(task_type=task_type, tasks=batch, plan_name=plan_name)
            created_ids.extend(ids)
            logger.info(f"Batch {batch_num} created {len(ids)} task(s): {ids}")
        except Exception as e:
            logger.error(f"Failed to submit batch {batch_num}: {e}")
            raise

    logger.info(f"=== Workflow Complete ===")
    logger.info(f"Total tasks created: {len(created_ids)}")
    logger.info(f"Task IDs: {created_ids}")
    typer.secho(f"✓ Created {len(created_ids)} tasks successfully", fg=typer.colors.GREEN)


@app.command()
def overlay_video(
    input_video: str = typer.Argument(..., help="Path to input video (.mov or .mp4)"),
    output_video: str = typer.Argument(..., help="Path to output .mp4 file"),
    text: str = typer.Option(..., "--text", help="Caption text to overlay"),
    config_path: str = typer.Option(None, help="Path to YAML config (auto-detects ./config.yaml)"),
):
    """Overlay caption text onto a single video using ffmpeg drawtext.

    Examples:
      python -m src.cli overlay-video ./input.mov ./output.mp4 --text "Hello world"
    """
    logger.info("Overlaying video: %s -> %s", input_video, output_video)
    cfg = load_config(config_path)
    overlay_opts = OverlayOptions(
        font_path=cfg.image_overlay.font_path,
        font_size=cfg.image_overlay.font_size,
        color=cfg.image_overlay.color,
        stroke_color=cfg.image_overlay.stroke_color,
        stroke_width=cfg.image_overlay.stroke_width,
        position=cfg.image_overlay.position,
        padding=cfg.image_overlay.padding,
        wrap_width_chars=cfg.image_overlay.wrap_width_chars,
    )
    overlay_text_on_video(input_video, output_video, text, overlay_opts)
    typer.secho("✓ Video overlay complete", fg=typer.colors.GREEN)


if __name__ == "__main__":
    app()

