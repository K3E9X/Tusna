# Tusna Collector (Maigret worker)

Tusna's automated connectors are clean but shallow (existence + a few fields). For
**deep collection from a username** — 3000+ sites *with* profile-data extraction and
identifier discovery (real name, other usernames, emails, locations found in profiles)
— Tusna delegates to **Maigret** and pulls the result. This worker is that bridge.

```
username ──▶ Tusna /api/scan ──(COLLECTOR_URL set)──▶ collector /scan ──▶ Maigret
                     ◀── normalized entity graph ◀── { sites, identifiers } ◀──┘
```

## Endpoint

```
GET /scan?username=<u>&top=<N>&timeout=<s>[&token=<secret>]
→ { username, count, sites: [{ name, url, ids }], identifiers: { fullname:[], username:[], … } }
```

`sites` = claimed accounts (with any profile fields Maigret extracted); `identifiers` =
aggregated discovered data (other handles, emails, names) that Tusna turns into graph nodes.

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

## Deploy (free tiers)

Any host that runs a Docker container or a Python web service works:

- **Render** — New → Web Service → this repo, root `collector/`, it detects the Dockerfile. Free instance.
- **Railway / Fly.io** — `fly launch` / Railway "Deploy from repo" pointed at `collector/`.

Then, in your **Tusna Vercel project**, set env vars:

- `COLLECTOR_URL` = the worker's public URL (e.g. `https://tusna-collector.onrender.com`)
- optionally `COLLECTOR_TOKEN` = a shared secret (also set `COLLECTOR_TOKEN` on the worker)

Tusna auto-detects `COLLECTOR_URL`: when present, a username scan pulls Maigret's rich
data; when absent, it falls back to the built-in connectors. Nothing else to change.

## Notes

- Maigret does many outbound requests; keep `top` modest (200–400) and `timeout` low (6–8s)
  so a scan returns quickly. Free hosts sleep when idle — the first call after a nap is slow.
- Respect the law and platform ToS. Maigret reads public profile pages; use it for
  legitimate, authorized investigation only.
