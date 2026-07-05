FROM python:3.11-slim

# git for the SpiderFoot checkout
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# SpiderFoot (200+ modules) — used by the async 'spiderfoot' job type, mainly for
# domain / infra targets. Optional; if the clone fails the worker just reports it
# unavailable (health.spiderfoot=false) and the other job types still work.
RUN git clone --depth 1 https://github.com/smicallef/spiderfoot.git /opt/spiderfoot && \
    pip install --no-cache-dir -r /opt/spiderfoot/requirements.txt || true
ENV SPIDERFOOT_PATH=/opt/spiderfoot/sf.py

COPY main.py .

# Pre-warm / update the Maigret site database into the image so runtime scans
# (which pass --no-autoupdate) use a fresh DB without a per-call download.
RUN maigret warmup --no-progressbar --no-color --timeout 1 --top-sites 1 || true

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
