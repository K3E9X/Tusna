# Tusna Collector (Maigret worker)

Tusna's automated connectors are clean but shallow (existence + a few fields). For
**deep collection from a username** — 3000+ sites *with* profile-data extraction and
identifier discovery (real name, other usernames, emails, locations found in profiles)
— Tusna delegates to **Maigret** and pulls the result. This worker is that bridge.

```
username ──▶ Tusna /api/scan ──(COLLECTOR_URL set)──▶ collector /scan ──▶ Maigret
                     ◀── normalized entity graph ◀── { sites, identifiers } ◀──┘
```

This worker is Tusna's **collection hub** — plug best-in-class OSS collectors here and
let Tusna pull & correlate. It currently exposes **Maigret** (username → deep profiles)
and **Holehe** (email → accounts on 120+ mainstream sites, *no alert to the target*).
Natural next modules: **SpiderFoot** (200+ modules, one target → everything) and
**theHarvester** (domain → emails/subdomains).

## Endpoints

```
GET /scan?username=<u>&top=<N>&timeout=<s>[&token=<secret>]
→ { username, count, sites: [{ name, url, ids }], identifiers: { fullname:[], username:[], … } }

GET /holehe?email=<e>[&token=<secret>]
→ { email, used: ["instagram.com", "spotify.com", …], count }
```

`sites` = claimed accounts (with any profile fields Maigret extracted); `identifiers` =
aggregated discovered data (other handles, emails, names). `used` = mainstream sites where
the email is registered (via password-recovery probing, silent). Tusna turns all of it into
graph nodes.

## Run locally

```bash
cd collector
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
# test: curl "http://localhost:8000/scan?username=johndoe&top=100"
```

Or with Docker:

```bash
docker build -t tusna-collector collector/
docker run -p 8000:8000 tusna-collector
```

## Deploy — one click (Render, free)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/K3E9X/Tusna)

The repo ships a [`render.yaml`](../render.yaml) blueprint, so:

1. Click the button (or Render → **New → Blueprint** → pick this repo). Render builds
   `collector/Dockerfile`, runs the free web service, and **auto-generates** a
   `COLLECTOR_TOKEN`.
2. Copy the service URL (e.g. `https://tusna-collector.onrender.com`) and the generated
   token (Render → the service → **Environment**).
3. In your **Tusna Vercel project → Settings → Environment Variables**, add:
   - `COLLECTOR_URL` = the worker URL
   - `COLLECTOR_TOKEN` = the same token
   Redeploy Tusna. The **"Maigret (deep)"** app now feeds every username scan.

Other hosts work too (Railway "Deploy from repo" → root `collector/`, or `fly launch`
in `collector/`).

Tusna auto-detects `COLLECTOR_URL`: present → scans pull Maigret's rich data; absent →
built-in connectors. Nothing else to change.

> First call after the free instance sleeps is slow (cold start + Maigret warm-up).
> Keep `top` at 200–400 for a snappy scan.

## Notes

- Maigret does many outbound requests; keep `top` modest (200–400) and `timeout` low (6–8s)
  so a scan returns quickly. Free hosts sleep when idle — the first call after a nap is slow.
- Respect the law and platform ToS. Maigret reads public profile pages; use it for
  legitimate, authorized investigation only.
