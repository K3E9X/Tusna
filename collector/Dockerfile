FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Pre-warm / update the Maigret site database into the image so runtime scans
# (which pass --no-autoupdate) use a fresh DB without a per-call download.
RUN maigret warmup --no-progressbar --no-color --timeout 1 --top-sites 1 || true

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
