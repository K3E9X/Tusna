"""
Octopus collector worker — wraps Maigret (3000+ sites, WITH profile-data extraction
and identifier discovery) behind a small HTTP API that Octopus pulls from.

Octopus calls  GET /scan?username=<u>&top=<N>  and normalizes the rich result into
its entity graph. This is the "let a tool do the heavy collection, we pull the
info" model — Maigret does the crawling/extraction, Octopus does correlation.

Run locally:   uvicorn main:app --host 0.0.0.0 --port 8000
Deploy:        see collector/README.md (Render / Railway / Fly, free tiers)
"""
import json
import os
import re
import subprocess
import tempfile
import threading
import time
import uuid
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

ANSI = re.compile(r"\x1b\[[0-9;]*m")
SPIDERFOOT = os.environ.get("SPIDERFOOT_PATH", "/opt/spiderfoot/sf.py")

app = FastAPI(title="Octopus Collector", version="0.1")
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


def run_spiderfoot(target: str, timeout: int = 240) -> list[dict]:
    """Run a passive SpiderFoot scan (async job — can take minutes). Returns events."""
    if not os.path.exists(SPIDERFOOT):
        return []
    try:
        proc = subprocess.run(
            ["python3", SPIDERFOOT, "-s", target, "-o", "json", "-q", "-u", "passive"],
            capture_output=True, timeout=timeout, text=True,
        )
    except Exception:
        return []
    try:
        data = json.loads(proc.stdout or "[]")
    except Exception:
        return []
    events: list[dict] = []
    for row in data if isinstance(data, list) else []:
        if isinstance(row, dict):
            events.append({
                "type": row.get("type") or row.get("event_type"),
                "data": row.get("data"),
                "module": row.get("module") or row.get("source_module"),
            })
        elif isinstance(row, list) and len(row) >= 5:
            events.append({"type": row[4], "data": row[1], "module": row[3]})
    return [e for e in events if e.get("type") and e.get("data")]


# ---- async job runner (long scans that exceed a serverless timeout) ----
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()


def _set(jid: str, **kw):
    with JOBS_LOCK:
        if jid in JOBS:
            JOBS[jid].update(kw)


def _run_job(jid: str, jtype: str, target: str, opts: dict):
    try:
        if jtype == "maigret":
            result = normalize(target, run_maigret(target, opts.get("top", 400), opts.get("timeout", 10)))
        elif jtype == "holehe":
            result = {"used": run_holehe(target)}
        elif jtype == "spiderfoot":
            result = {"events": run_spiderfoot(target, opts.get("timeout", 240))}
        else:
            raise ValueError("unknown job type")
        _set(jid, status="done", result=result, finished=time.time())
    except Exception as e:  # noqa: BLE001
        _set(jid, status="error", error=str(e), finished=time.time())


@app.get("/health")
def health():
    return {"ok": True, "spiderfoot": os.path.exists(SPIDERFOOT)}


@app.post("/jobs")
def create_job(
    type: str = Query(..., pattern="^(maigret|holehe|spiderfoot)$"),
    target: str = Query(..., min_length=1, max_length=120),
    top: int = Query(400, ge=10, le=1500),
    timeout: int = Query(10, ge=2, le=30),
    token: str = Query(""),
):
    if TOKEN and token != TOKEN:
        return {"error": "unauthorized"}
    jid = uuid.uuid4().hex[:16]
    with JOBS_LOCK:
        # keep the store bounded
        if len(JOBS) > 200:
            for k in sorted(JOBS, key=lambda k: JOBS[k].get("started", 0))[:100]:
                JOBS.pop(k, None)
        JOBS[jid] = {"type": type, "target": target, "status": "running", "started": time.time()}
    threading.Thread(target=_run_job, args=(jid, type, target, {"top": top, "timeout": timeout}), daemon=True).start()
    return {"jobId": jid, "status": "running"}


@app.get("/jobs/{jid}")
def get_job(jid: str, token: str = Query("")):
    if TOKEN and token != TOKEN:
        return {"error": "unauthorized"}
    with JOBS_LOCK:
        j = JOBS.get(jid)
    if not j:
        return {"status": "not_found"}
    return {
        "status": j["status"], "type": j["type"],
        "result": j.get("result"), "error": j.get("error"),
        "elapsed": round(time.time() - j["started"], 1),
    }


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
