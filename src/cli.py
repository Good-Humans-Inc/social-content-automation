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
from src.video_overlay import overlay_text_on_video


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

        try:
            base_video = _resolve_base_video(account, default_video)
        except FileNotFoundError as exc:
            typer.secho(str(exc), fg=typer.colors.RED)
            raise typer.Exit(code=1) from exc

        output_video = os.path.join(output_dir, f"{account.id}-{template.id}.mp4")
        overlay_text = "\n".join(template.overlay)
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
    schedule_at = client.schedule_timestamp(cfg.posting.schedule_in_minutes)

    tasks = []
    for post in prepared_posts:
        resource_url = _upload_video(client, post.video_path)
        post.resource_url = resource_url
        tasks.append(
            {
                "scheduleAt": schedule_at,
                "envId": post.account.env_id,
                "video": resource_url,
                "videoDesc": post.caption,
                "needShareLink": cfg.posting.need_share_link,
                "markAI": cfg.posting.mark_ai,
            }
        )

    BATCH = 100
    created_ids: List[str] = []
    for i in range(0, len(tasks), BATCH):
        batch = tasks[i : i + BATCH]
        batch_num = (i // BATCH) + 1
        logger.info("Submitting batch %s/%s (%s tasks)", batch_num, (len(tasks) + BATCH - 1) // BATCH, len(batch))
        created_ids.extend(client.add_tasks(task_type=1, tasks=batch, plan_name=plan_name))

    # Mark templates as used
    for post in prepared_posts:
        used_meta = UsedMeta(
            timestamp=_timestamp(),
            account_id=post.account.id,
            account_display_name=post.account.display_name,
            cloud_phone_id=post.account.cloud_phone_id,
        )
        library.mark_used(post.template.id, used_meta)

    library.save()

    typer.secho(f"✓ Created {len(created_ids)} GeeLark task(s)", fg=typer.colors.GREEN)
    logger.info("Task IDs: %s", created_ids)


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
def list_envs(
    config_path: Optional[str] = typer.Option(None, help="Path to YAML config"),
    serial_name: Optional[str] = typer.Option(None, help="Filter by cloud phone name"),
    group_name: Optional[str] = typer.Option(None, help="Filter by group name"),
    remark: Optional[str] = typer.Option(None, help="Filter by remark"),
    tag: List[str] = typer.Option(None, "--tag", help="Filter by tag (repeatable)"),
    charge_mode: Optional[int] = typer.Option(None, help="Filter by charge mode 0=on-demand 1=monthly"),
    page_size: int = typer.Option(100, help="How many phones to fetch per request (max 100)"),
    verbose: bool = typer.Option(False, help="Print full rows instead of IDs only"),
):
    """Fetch and print cloud phone / environment IDs from GeeLark."""

    cfg = load_config(config_path)
    client = _ensure_geelark_client(cfg)

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

    typer.echo(f"Listed {seen} phone(s)")


if __name__ == "__main__":
    app()

