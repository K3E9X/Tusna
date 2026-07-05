"""
Tusna collector worker — wraps Maigret (3000+ sites, WITH profile-data extraction
and identifier discovery) behind a small HTTP API that Tusna pulls from.

Tusna calls  GET /scan?username=<u>&top=<N>  and normalizes the rich result into
its entity graph. This is the "let a tool do the heavy collection, we pull the
info" model — Maigret does the crawling/extraction, Tusna does correlation.

Run locally:   uvicorn main:app --host 0.0.0.0 --port 8000
Deploy:        see collector/README.md (Render / Railway / Fly, free tiers)
"""
import json
import os
import re
import subprocess
import tempfile
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

ANSI = re.compile(r"\x1b\[[0-9;]*m")

app = FastAPI(title="Tusna Collector", version="0.1")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"]
)

# Optional shared secret: if COLLECTOR_TOKEN is set, callers must pass ?token=
TOKEN = os.environ.get("COLLECTOR_TOKEN", "")


def run_maigret(username: str, top: int, timeout: int) -> dict:
    """Run Maigret and return its parsed JSON report (claimed sites + extracted ids)."""
    out_dir = tempfile.mkdtemp(prefix="maigret_")
    cmd = [
        "maigret", username,
        "--json", "simple",
        "--folderoutput", out_dir,
        "--no-progressbar",
        "--no-color",
        "--no-autoupdate",  # DB is baked/updated at image build; keep per-call fast
        "--timeout", str(timeout),
        "--top-sites", str(top),
        "--no-recursion",
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=timeout * 6 + 30, check=False)
    except subprocess.TimeoutExpired:
        pass
    # Maigret writes report_<username>_simple.json into the output folder
    for fn in os.listdir(out_dir):
        if fn.endswith(".json"):
            try:
                with open(os.path.join(out_dir, fn), encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                continue
    return {}


def normalize(username: str, report: dict) -> dict:
    """Flatten Maigret's report into { sites:[...], identifiers:{...} }."""
    sites = []
    identifiers: dict[str, list[str]] = {}
    for name, data in (report or {}).items():
        if not isinstance(data, dict):
            continue
        status = (data.get("status") or {})
        state = (status.get("status") or "").lower() if isinstance(status, dict) else str(status).lower()
        if state and "claimed" not in state:
            continue
        url = data.get("url_user") or data.get("url") or ""
        ids = {}
        raw_ids = (status.get("ids") if isinstance(status, dict) else None) or data.get("ids") or {}
        if isinstance(raw_ids, dict):
            for k, v in raw_ids.items():
                vals = v if isinstance(v, list) else [v]
                ids[k] = [str(x) for x in vals if x]
                identifiers.setdefault(k, [])
                for x in ids[k]:
                    if x not in identifiers[k]:
                        identifiers[k].append(x)
        sites.append({"name": name, "url": url, "ids": ids})
    return {"username": username, "count": len(sites), "sites": sites, "identifiers": identifiers}


def run_holehe(email: str, timeout: int = 55) -> list[str]:
    """Run holehe (email → registered accounts, no alert to target). Returns used domains."""
    try:
        proc = subprocess.run(
            ["holehe", email, "--only-used"],
            capture_output=True, timeout=timeout, text=True,
        )
    except Exception:
        return []
    used: list[str] = []
    for line in proc.stdout.splitlines():
        line = ANSI.sub("", line).strip()
        if line.startswith("[+]"):
            token = line[3:].strip().split()[0]
            if token and token not in used:
                used.append(token)
    return used


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/holehe")
def holehe_scan(email: str = Query(..., min_length=3, max_length=120), token: str = Query("")):
    if TOKEN and token != TOKEN:
        return {"error": "unauthorized"}
    used = run_holehe(email)
    return {"email": email, "used": used, "count": len(used)}


@app.get("/scan")
def scan(
    username: str = Query(..., min_length=1, max_length=64),
    top: int = Query(300, ge=10, le=1500),
    timeout: int = Query(8, ge=2, le=30),
    token: str = Query(""),
):
    if TOKEN and token != TOKEN:
        return {"error": "unauthorized"}
    report = run_maigret(username, top, timeout)
    return normalize(username, report)
