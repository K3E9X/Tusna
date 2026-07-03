# OSINT tools landscape for Tusna (2026 research)

> Research done in July 2026 by an agent team (infra, email/phone, usernames, face, threat intel, frameworks) + expert synthesis.
> Goal: go **beyond the famous tools** and cover everything useful for **identity correlation** (a person/handle's presence on the net), **open source AND commercial**.
> Status legend: 🟢 free · 🟡 freemium · 🔴 paid · ⚠️ unstable/declining · ✝️ dead · ⚖️ legal/ethical caveat.
> Collection note: several official pages (Censys, Shodan store, ZoomEye, FOFA, Epieos, HIBP) return HTTP 403 to bots; figures come from official docs and cross-checked recent secondary sources — re-verify to the dollar live.

---

## Top "underrated but valuable" to integrate first

The ones that add the most to an aggregation platform, and are cited less than Maltego/SpiderFoot/theHarvester.

| # | Tool | What it unlocks | Access | Status |
|---|---|---|---|---|
| 1 | **Epieos** | Email/phone → Google account (name, photo, GAIA ID), Skype, 140+ services. Doesn't notify the target. | web + Maltego | 🟡 ~€30/mo |
| 2 | **Blackbird** | Fast username enum, **actively maintained** (2026), where Sherlock slows down. | CLI | 🟢 |
| 3 | **WhatsMyName** | The **JSON list** that powers half the username tools — ingest as an internal dataset. | data/JSON + web | 🟢 |
| 4 | **Netlas** | Shodan/Censys alternative with a **genuinely usable free tier** (50 req/day), clean API. | web + API | 🟡 from $49/mo |
| 5 | **IntelligenceX** | Search across leaks, pastes, darkweb, indexed historical data. | web + API | 🟡 ⚖️ |
| 6 | **FaceCheck.id** | Reverse face search covering social/darkweb (where Google/TinEye fail on faces). | web | 🟡 ⚖️ |
| 7 | **GreyNoise** | Filters the "noise": knows which IPs scan the Internet → cleans false infra signals. | web + API | 🟡 (Community 🟢) |
| 8 | **holehe** | Email → account existence on 120+ sites via "forgot password", silently. | CLI | 🟢 ⚠️ |
| 9 | **IPQualityScore** | Fraud scoring for email + phone + IP (VoIP/disposable, risk), 1000 free credits/mo. | API | 🟡 |
| 10 | **sn0int** | **Semi-automatic** OSINT framework with a module registry — close to Tusna's spirit. | CLI/pkg | 🟢 |
| 11 | **Castrickclues** | Reverse email/username/phone claiming **no breach databases** (GDPR-clean). | web | 🟡 |
| 12 | **Lenso.ai** | AI reverse image (faces, places, duplicates) — more "intelligent" than TinEye. | web | 🟡 |
| 13 | **GHunt** | Deep OSINT on a Google account via email/GAIA ID. Powerful but fragile. | CLI | 🟢 ⚠️ |
| 14 | **socialscan** | Checks in one call the availability/existence of an email **and** username (async, reliable). | CLI/lib | 🟢 |
| 15 | **cipher387 collections** | Meta-directory of 1000+ tools + `API-s-for-OSINT`: to **discover and replace** dead tools. | web/GitHub | 🟢 |
| 16 | **SEON** | Email/phone → footprint across 50+ networks + fraud scoring. Rarely cited in OSINT, very powerful for aggregation. | API | 🟡 |
| 17 | **Hudson Rock (Cavalier)** | Tells you if an identity appears in an **infostealer** log (infected machines). Free and defense-oriented. | web + API | 🟡 ⚖️ |

---

## 1. Username / handle — presence enumeration

The core of the "where is this person on the net" use-case.

- **Sherlock** — 🟢 the classic (username → ~400 sites). Still useful but **maintenance slowing** and breaking modules; don't use it alone.
- **Maigret** (soxoj) — 🟢 richer spiritual fork: ~2500 sites, **extracts profile data** (bio, avatar, dates), not just presence. Best default for ingestion.
- **Blackbird** — 🟢 **actively maintained (2026)**, fast, clean output (JSON/PDF), email + username. Underrated.
- **WhatsMyName** (WebBreacher) — 🟢 primarily a **community JSON list** of sites + detection rules; it's the *data* that powers Maigret/Recon-ng/etc. → **ingest as an internal dataset**, not just as a tool.
- **socialscan** — 🟢 ⚠️ async Python lib: tells whether an email/username is **taken or free** (strong inference distinction). Fast, but **aging lists** (dormant maintenance).
- **Marple** (soxoj) — 🟢 complementary approach: queries **search engines** (Google/Bing/DDG) rather than probing URLs. Catches what Sherlock/Maigret miss.
- **Nexfil** — 🟢 ⚠️ ~350 sites, fast, few false positives; intermittent maintenance.
- **Snoop Project** — 🟢 very large site base (CIS included); active but Russian docs, heavy packaging.
- **Toutatis** (megadose) — 🟢 ⚠️ extracts obfuscated email/phone from an **Instagram** profile; works intermittently depending on IG defenses. **Osintgram** ✝️ is broken/dead in 2026.

**For Tusna:** ingest the WhatsMyName dataset + wrap Maigret (profile data) + Blackbird (speed). Each hit becomes a candidate "body" on the Orbit board.

## 2. Email — enrichment

- **Epieos** — 🟡 (~€29.99/mo) — email → Google account (public name, photo, GAIA ID, Maps reviews), Skype, presence across 140+ services. Doesn't notify, doesn't log. **Investigator reference.**
- **holehe** — 🟢 ⚠️ — 120+ sites via "forgot password", silently. GPL-3.0, ~11.6k★ but **slowed maintenance** (breaking modules).
- **GHunt** — 🟢 ⚠️ — deep Google OSINT (profile, services, Maps/Photos, public Drive) via a throwaway Google account's cookies. **Unstable in 2026** (depends on Google's API).
- **EmailRep.io** (Sublime) — 🟡 — reputation/risk score + signals (networks, leaks, domain age). Good for **scoring**, not de-anonymization.
- **Castrickclues** — 🟡 (~$12–100/mo) — reverse email/username/phone **without breach databases** (clean positioning).
- **Hunter.io / Snov.io** — 🟡 — **B2B** email finder/verifier (domain → emails). Useful corporate, weaker on personal emails.
- **IPQualityScore (email)** — 🟡 — real-time validation + risk (disposable, fraudulent), 1000 free credits/mo.
- **HIBP (API)** — 🔴 — which breaches an email appears in (+ stealer logs on Pro). Reference, very reliable, but **paid API**.
- Dead/dormant to avoid: **mosint** ✝️ (2023), **h8mail** ✝️⚖️ (2022, breach dumps).

## 3. Phone — enrichment

- **IPQualityScore (phone)** — 🟡 — validity, carrier, line type, VoIP/disposable, fraud; 150+ countries, without calling.
- **Numverify / apilayer** — 🟡 (100 free req/mo) — validation + carrier lookup, 232 countries. Static data (no identity).
- **PhoneInfoga** — 🟢 ⚠️ — phone recon framework (country, carrier, dorks); the repo declares itself **"unmaintained, may be archived"**. Core OK, periphery broken.
- **Epieos (phone)** — 🟡 — number → WhatsApp/Telegram/Facebook and other sign-ups. Less rich than the email side but useful.
- **Truecaller / Sync.me** — 🟡 ⚖️ — reverse phone → name, via a **"give-to-get"** model (address-book upload) → **major GDPR issue**, numbers added without consent. Handle with care in the EU.
- **Numlookup / Spydialer** — 🟢 ⚠️ — free US-oriented reverse lookup; Spydialer **degraded/near-unusable in late 2025**.

## 4. Face / avatar / reverse image

Differentiating brick to link profiles by photo (internal **perceptual hashing** + external engines).

- **Internal pHash** — 🟢 — perceptual hashing (imagehash) of avatars to match profiles **locally**, no external dependency. **Do this in-house** (strong matching signal).
- **PimEyes** — 🔴 ⚖️ — the most powerful reverse face search, highly controversial (privacy). Paid, legally sensitive.
- **FaceCheck.id** — 🟡 ⚖️ — reverse face covering social + darkweb; where general engines fail.
- **Yandex Images** — 🟢 — the best **free** face search among general engines.
- **Lenso.ai** — 🟡 — AI reverse image (faces, places, duplicates), more "semantic" than TinEye.
- **TinEye** — 🟡 — great for finding **exact copies** of an image (not faces); useful to trace a reused avatar. Non-biometric = cleaner legally.
- **Search4Faces** — 🟡 ⚖️ — facial recognition on **VK / Odnoklassniki / TikTok** (Russian bases). Useful on CIS targets; **unstable** availability (geopolitics/sanctions).
- **PDQ** (Meta, in ThreatExchange) — 🟢 — robust perceptual hash, complements imagehash to match the same avatar despite crop/compression. Integrate in-house.
- **ExifTool** — 🟢 — image metadata extraction (GPS, device, software); essential, wrap as a file connector.
- **Google Lens** — 🟢 — general context, weak on faces (deliberately limited).

> ⚖️ **Major biometric caveat**: facial search falls under GDPR Art. 9 and BIPA (Illinois); Clearview AI case law (banned/fined in the EU, UK, Canada, Australia). PimEyes/FaceCheck impose "search-on-yourself" ToS often ignored but legally important. Only expose with a legal basis + logging. **Internal avatar pHash** limits legal exposure since it's non-biometric (compares images, not faces).

## 5. Infrastructure / attack surface (domain, IP, certs)

- **Shodan** — 🟡 — reference device search. **Lifetime membership $49** (often ~$5 on Black Friday); API Freelancer $69/mo → Corporate $1099/mo. Web + API + CLI.
- **Censys** — 🟡 — research-grade data, excellent cert coverage. **2026 overhaul**: Legacy Search deprecated, **credit** model; Free = **100 credits/mo**; Starter from $100/500 credits. Free tier now thin.
- **Netlas** — 🟡 — rising alternative, **free lifetime Community 50 req/day**, clean API, from $49/mo. Good value.
- **GreyNoise** — 🟡 — identifies **who is scanning** the Internet (benign/malicious/RIOT) → reduces alert noise. Community API 🟢, Enterprise on quote.
- **ZoomEye** — 🟡 ⚖️ — Chinese Shodan equivalent, good Asia coverage. Lifetime membership $149. **Chinese vendor (Knownsec)** → jurisdiction/query-confidentiality caveat.
- **FOFA** — 🟡 ⚖️ — Chinese cyberspace mapping, powerful syntax. Credit system. **Chinese vendor** → same caveats; interface/payment partly in Chinese.
- **BinaryEdge** — ✝️ — **shut down March 31, 2025** (absorbed by Coalition). Stop integrating it.
- Free complements: **crt.sh** (certs/subdomains) 🟢, **DNSDumpster** 🟢, **MaxMind GeoLite** (offline IP geo) 🟢, **Amass/Subfinder/dnsx** (CLI) 🟢.

## 6. Threat intel / breach / leaks ⚖️

**Sensitive** area: legality depends on jurisdiction and the data's source. Strictly bound it (legal basis, no credential redistribution).

- **Hudson Rock — Cavalier** — 🟡 ⚖️ — **infostealer intelligence** (machines/credentials compromised by stealer malware). **Free tools + API**, clearly **defense-oriented** (≠ grey resale). Very underrated; great to know if an identity appeared in an infostealer log.
- **IntelligenceX (intelx.io)** — 🟡 — search across leaks, pastes, darkweb, historical Whois, indexed data. Freemium + API. Very useful, must be bounded.
- **Dehashed** — 🔴 ⚖️ — breach search engine (email/username/name/phone → credentials). Powerful but **grey zone**; defensive use only.
- **LeakCheck / Snusbase** — 🔴 ⚖️ — search accounts in leaks. Same caveats.
- **HIBP** — 🔴 — the **clean** choice for breaches (doesn't redistribute passwords). Prefer in the EU.
- **MISP / OpenCTI** — 🟢 — threat-intel platforms (IoC export/enrichment connectors), relevant in V2 for the pro ecosystem.

## 6b. Commercial people / identity APIs ⚖️

Mostly paid, but they provide coverage no OSS tool matches. Clearly separate **KYC/fraud** APIs (legitimate B2B use) from consumer people-search (risky OSINT use). In the US: **FCRA** bans employment/credit/housing use. In the EU: most are **hard to reconcile with GDPR** without a solid legal basis.

- **SEON** — 🟡 — email/phone → **footprint across 50+ social networks** + enrichment + fraud scoring. Clean API, trial/freemium. **Very underrated for identity aggregation.**
- **People Data Labs (PDL)** — 🟡 — person/company enrichment (aggregated professional profiles), clean API with a **real free tier** (monthly credits). GDPR compliance to watch depending on use.
- **Epieos / OSINT Industries** — 🟡/🔴 — "email/phone → accounts" aggregators for investigators (OSINT Industries claims 3000+ accounts). Direct product competitors to benchmark.
- **Trestle** (ex-Ekata / Whitepages Pro) — 🔴 — identity/phone API (reverse phone, caller-ID, scoring), KYC/fraud-oriented.
- **Endato / Enformion** — 🔴 ⚖️ — **US** people-search via API (addresses, relatives, phone), **FCRA-restricted**.
- **Pipl** — 🔴 — the former reverse email/phone reference, now **B2B fraud/KYC only** (closed to independent investigators since ~2019). **FullContact** pivoted to marketing identity resolution.
- **Social Links (SL Professional)** — 🔴 — Maltego-style commercial extension (500+ sources: social, blockchain, darkweb). Enterprise.
- **Predicta Search** — 🔴 — people-search engine for investigators (email/phone/name → accounts, leaks, images).
- **RocketReach / Lusha / ZoomInfo / Clearbit** — 🟡/🔴 — **B2B contact** enrichment (work email/phone from name+company).
- Consumer US (web, rare API, scraping against ToS, FCRA): **TruePeopleSearch / FastPeopleSearch** 🟢, **Spokeo / BeenVerified / Intelius** 🔴.

## 7. Self-host aggregation frameworks (competitors & inspirations)

- **IntelOwl** — 🟢 — **the reference model** for Tusna: Django + Celery + Postgres, analyzers/connectors/pivots/playbooks plugins. Study closely (or extend).
- **sn0int** — 🟢 — **semi-automatic** OSINT framework with a module registry and entity graph. Very close to Tusna's spirit.
- **Recon-ng** — 🟢 — modular framework (module marketplace) à la Metasploit of recon. Good for domain/person connectors.
- **SpiderFoot** — 🟢 (HX 🔴) — automates 100+ sources from a seed. Powerful, but more "scan" than "fine identity correlation".
- **Maltego CE** — 🟡 ⚖️ — the visual link-analysis reference, but **CE heavily limited** and commercial model; Tusna aims to be a modern web alternative.
- **OSINT Industries** — 🔴 — **commercial aggregator** email/phone → very broad, clean multi-service presence. Direct "correlation" competitor; watch as a product benchmark.
- **Lampyre / Predicta Search** — 🔴 — commercial investigation platforms; UX benchmarks.
- Dead: **Datasploit** ✝️, **Skiptracer** ⚠️.

## 8. Meta-directories (to stay current and replace dead tools)

- **cipher387/osint_stuff_tool_collection** 🟢 — 1000+ tools, username/email/phone/face/social sections; + **cipher387/API-s-for-OSINT** (APIs). Best for **discovering and replacing** abandoned tools.
- **jivoi/awesome-osint** 🟢 — the community reference list.
- **OSINT Framework** 🟢 — the tree map by investigation type.
- **Bellingcat Toolkit** / **IntelTechniques** 🟢 — pro-investigator selections, often ahead of generic lists.

---

## Implications for Tusna

1. **Priority auto connectors** (reliable, API/CLI): Maigret + Blackbird (username), crt.sh + Netlas (infra), Epieos + holehe + EmailRep (email), IPQualityScore + Numverify (phone), internal pHash (avatar). → feed the Orbit board automatically.
2. **Paid APIs behind feature flags + quotas**: Shodan, HIBP, IntelligenceX, PimEyes/FaceCheck. Variable cost isolated and monitored, labeled in the UI.
3. **Manual-pivot catalogue** (cipher387 import): ~1000 "click-through" web tools, filterable, to fill what automation doesn't cover — the analyst pastes the result back onto the board.
4. **Flag in the UI**: status (freemium/paid/unstable/dead), freshness, and **legal caveats** (Truecaller/Sync.me GDPR; Dehashed/Snusbase breaches; ZoomEye/FOFA Chinese jurisdiction).
5. **Watch maintenance**: holehe, GHunt, PhoneInfoga are declining — plan replacements (via cipher387) and per-connector contract tests.

## Main sources
- cipher387: https://github.com/cipher387/osint_stuff_tool_collection · https://github.com/cipher387/API-s-for-OSINT
- Username: https://github.com/p1ngul1n0/blackbird · https://github.com/soxoj/maigret · https://github.com/WebBreacher/WhatsMyName · https://github.com/iojw/socialscan
- Email/phone: https://epieos.com/pricing · https://github.com/megadose/holehe · https://github.com/mxrch/GHunt · https://emailrep.io/ · https://www.ipqualityscore.com/plans · https://numverify.com/pricing · https://haveibeenpwned.com/API/Key · https://castrickclues.com/
- Infra: https://account.shodan.io/billing · https://censys.com/blog/legacy-search-deprecation/ · https://netlas.io/pricing/ · https://www.greynoise.io/plans · https://www.zoomeye.ai/pricing · https://en.fofa.info/vip · https://www.binaryedge.io/pricing.html
- Face: https://facecheck.id/ · https://yandex.com/images/ · https://lenso.ai/ · https://tineye.com/
- Threat intel: https://intelx.io/ · https://haveibeenpwned.com/
- Frameworks: https://github.com/intelowlproject/IntelOwl · https://github.com/kpcyrd/sn0int · https://github.com/lanmaster53/recon-ng · https://osint.industries/
