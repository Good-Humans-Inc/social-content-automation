## Template-driven TikTok automation

This tool pulls creative from a JSONL content library, renders overlays onto stock videos, uploads the results to GeeLark, and creates one scheduled TikTok task per configured account. Each template can only be used once—the moment it is assigned to an account it is marked as consumed in the JSONL library.

### Requirements

- Python 3.10+
- `ffmpeg` installed and available on `PATH`
- GeeLark API credentials (via `GEELARK_API_KEY` and optional `GEELARK_APP_ID`)

Install dependencies:

```bash
pip install -r requirements.txt
```

### Configuration

`config.yaml` drives everything:

- `template_library` – persona name, JSONL file path (e.g. `input/anime_otome.jsonl`), and optional intensity weights.
- `accounts[]` – one entry per TikTok account/cloud phone including its `env_id`, optional `video_source` (path to a dedicated base clip), fandom/intensity preferences, and metadata used when marking templates as consumed. If `video_source` is omitted you can supply `--default-video` at runtime and every account will reuse that file.
- `overlay` – font, colors, padding, and wrapping instructions for ffmpeg’s `drawtext`.
- `posting` – scheduling offset plus GeeLark flags (share link, AI markers).

All paths can be absolute or relative to the repo. Make sure the `video_source` files actually exist on disk even if they are git-ignored.

### Template library format

`input/anime_otome.jsonl` is a newline-delimited JSON file. Each line matches:

```jsonc
{
  "id": "anime_otome_genshin_001",
  "persona": "anime_otome",
  "fandom": "genshin_impact",
  "intensity": "T0",
  "overlay": ["line 1", "line 2"],
  "caption": "time dilation is real when resin exists",
  "tags": ["#genshinimpact", "#otakutok"],
  "used": null
}
```

When a template is successfully queued for posting it is rewritten with:

```jsonc
"used": {
  "timestamp": "2025-12-02T09:32:11Z",
  "account_id": "acc_01",
  "account_display_name": "anime.vibes.daily",
  "cloud_phone_id": "586551963773046967"
}
```

### Running the autoposter

Render, upload, schedule:

```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --plan-name anime-daily \
  --default-video ./input/videos/loop.mp4
```

Useful flags:

- `--persona anime_otome` – override the persona in the config.
- `--account-id acc_04` – run the workflow for a single account.
- `--templates-path ./input/custom.jsonl` – point at a different JSONL file.
- `--dry-run` – render videos and log intentions without uploading or mutating the JSONL file.

During a full run the CLI:

1. Loads the JSONL templates and filters for `persona` + `used === null`.
2. Pick one entry per account (respecting fandom/intensity preferences).
3. Render overlay text onto each account’s base video using ffmpeg.
4. Upload each rendered video to GeeLark’s temporary storage, assemble the final caption (`caption + tags`), and create scheduled video tasks.
5. Mark each template as used with the account + cloud phone metadata and write the JSONL file back to disk.

### Manual video overlay

You can still call the raw overlay helper:

```bash
python -m src.cli overlay-video ./input.mov ./output.mp4 --text "hello from templates"
```

This reuses the same font + layout settings from `config.yaml`.

### Listing cloud phone / environment IDs

To dump every cloud phone (`envId`) available to your GeeLark API key:

```bash
python -m src.cli list-envs --config-path ./config.yaml --verbose
```

Add filters such as `--serial-name foo`, `--group-name creators`, or repeatable `--tag JP` to narrow the list. Without `--verbose` the command prints just the IDs—perfect for copy/pasting into `config.yaml`.

### GeeLark endpoints

- `GET upload url`: `https://openapi.geelark.com/open/v1/upload/getUrl`
- `POST tasks`: `https://openapi.geelark.com/open/v1/task/add`

Documentation: https://open.geelark.com/api
