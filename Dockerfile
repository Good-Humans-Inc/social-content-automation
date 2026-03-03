# Video generation job worker for Cloud Run Jobs (Python + ffmpeg)
FROM python:3.11-slim

# Install ffmpeg and a fallback font for text overlay (if fonts/ not provided)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies (worker only; avoid heavy optional deps if possible)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src ./src
# Custom font optional: add "COPY fonts ./fonts" before this if you have fonts/AutourOne-Regular.ttf
# Default font in image is DejaVu (installed above); override with FONT_PATH in Cloud Run if needed.
ENV FONT_PATH=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf

# Default: run the worker (Cloud Run Job will override env vars)
ENV OUTPUT_DIR=/tmp/output
ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "src.run_worker"]
