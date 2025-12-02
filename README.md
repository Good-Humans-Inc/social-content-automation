## TikTok automation with GeeLark

End-to-end workflow:

- Generate captions via OpenAI
- Render text onto images using Pillow and a chosen font
- Upload images to GeeLark temporary storage
- Create publish tasks (image set/video/warmup) across multiple env IDs

### Setup

1. Python 3.10+
2. Create and activate a virtualenv
3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Copy `.env.example` to `.env` and fill in values
5. Copy `config.yaml.example` to `config.yaml` and adjust as needed

### Usage

Prepare input images under `images/` and a font under `fonts/`.

```bash
python -m src.cli run --prompt "你的中文文案提示" --images-dir ./images --output-dir ./output --config-path ./config.yaml --plan-name my-plan
```

The tool will:

- Generate captions using `OPENAI_API_KEY` and `OPENAI_MODEL`
- Render captions onto images to `output/`
- Upload rendered images to GeeLark via `https://openapi.geelark.com` Add Task and Upload APIs
- Create tasks for each `envId` in `config.yaml`

### APIs Referenced

- GeeLark Add Task: `https://openapi.geelark.com/open/v1/task/add`
- GeeLark Get Upload URL: `https://openapi.geelark.com/open/v1/upload/getUrl`

Source: [`https://open.geelark.com/api`](https://open.geelark.com/api)



