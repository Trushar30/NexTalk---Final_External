FROM python:3.11-slim

WORKDIR /app

# No heavy system dependencies needed (no OpenCV/DeepFace)
# Just basic image processing via Pillow (pure Python)

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Remove unnecessary files
RUN rm -rf __pycache__ venv .DS_Store

EXPOSE 8000

# Health check for Render
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Lightweight service — single worker is fine
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-keep-alive", "65"]
