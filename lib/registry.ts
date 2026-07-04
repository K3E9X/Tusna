// App registry — the catalogue shown in the APPS panel.
//  - "builtin" apps are real connectors/engine stages: toggling them changes what
//    the scan runs and correlates (enable more → richer, cross-linked results).
//  - "manual" apps are cipher387-style external tools: "Add" installs them, then
//    they open pre-filled with the current seed (analyst pastes findings back).

export type AppInput = "username" | "email" | "both" | "image" | "phone" | "domain";
export type AppStatus = "free" | "freemium" | "paid";

export interface AppDef {
  id: string;
  name: string;
  category: string;
  kind: "builtin" | "manual";
  input: AppInput;
  status: AppStatus;
  /** manual apps: URL with {seed} substituted at open time */
  url?: string;
  desc: string;
}

// Built-in connectors + engine stages (ids match the scan pipeline).
export const BUILTIN_APPS: AppDef[] = [
  { id: "github", name: "GitHub", category: "Dev", kind: "builtin", input: "username", status: "free", desc: "Public profile, name, bio, avatar." },
  { id: "gitlab", name: "GitLab", category: "Dev", kind: "builtin", input: "username", status: "free", desc: "Public user profile." },
  { id: "npm", name: "npm", category: "Dev", kind: "builtin", input: "username", status: "free", desc: "Registry user." },
  { id: "dockerhub", name: "Docker Hub", category: "Dev", kind: "builtin", input: "username", status: "free", desc: "Public user." },
  { id: "codeforces", name: "Codeforces", category: "Dev", kind: "builtin", input: "username", status: "free", desc: "Competitive-programming profile." },
  { id: "reddit", name: "Reddit", category: "Social", kind: "builtin", input: "username", status: "free", desc: "Public about.json." },
  { id: "bluesky", name: "Bluesky", category: "Social", kind: "builtin", input: "username", status: "free", desc: "Public AppView profile." },
  { id: "mastodon", name: "Mastodon", category: "Social", kind: "builtin", input: "username", status: "free", desc: "mastodon.social lookup." },
  { id: "hn", name: "Hacker News", category: "Social", kind: "builtin", input: "username", status: "free", desc: "Public user + karma." },
  { id: "keybase", name: "Keybase", category: "Identity", kind: "builtin", input: "username", status: "free", desc: "Cryptographically-verified linked accounts." },
  { id: "gravatar", name: "Gravatar", category: "Identity", kind: "builtin", input: "both", status: "free", desc: "Profile + declared linked accounts." },
  { id: "chesscom", name: "Chess.com", category: "Games", kind: "builtin", input: "username", status: "free", desc: "Public player profile." },
  { id: "wikipedia", name: "Wikipedia", category: "Reference", kind: "builtin", input: "username", status: "free", desc: "User existence + edit count." },
  { id: "whatsmyname", name: "WhatsMyName", category: "Coverage", kind: "builtin", input: "username", status: "free", desc: "600+ sites by URL pattern (unverified layer)." },
  { id: "maigret", name: "Maigret (deep)", category: "Coverage", kind: "builtin", input: "username", status: "free", desc: "3000+ sites WITH profile data + identifier discovery. Needs the collector worker (COLLECTOR_URL)." },
  { id: "intelx", name: "Intelligence X", category: "Leaks", kind: "builtin", input: "both", status: "freemium", desc: "Breaches / pastes / darkweb. Needs INTELX_API_KEY. Sensitive — legal basis required." },
  { id: "phash", name: "Avatar pHash", category: "Correlation", kind: "builtin", input: "image", status: "free", desc: "Links accounts by matching profile photos." },
];

// Curated cipher387-style manual pivots (open externally with the seed).
export const MANUAL_APPS: AppDef[] = [
  { id: "wmn-web", name: "WhatsMyName (web)", category: "Username", kind: "manual", input: "username", status: "free", url: "https://whatsmyname.app/?q={seed}", desc: "Web UI over the WhatsMyName ruleset." },
  { id: "instantusername", name: "Instant Username", category: "Username", kind: "manual", input: "username", status: "free", url: "https://instantusername.com/#/{seed}", desc: "Fast availability across many sites." },
  { id: "sherlock", name: "Sherlock", category: "Username", kind: "manual", input: "username", status: "free", url: "https://github.com/sherlock-project/sherlock", desc: "CLI username hunter (~400 sites)." },
  { id: "maigret", name: "Maigret", category: "Username", kind: "manual", input: "username", status: "free", url: "https://github.com/soxoj/maigret", desc: "CLI, ~2500 sites + profile data." },
  { id: "epieos", name: "Epieos", category: "Email", kind: "manual", input: "email", status: "freemium", url: "https://epieos.com/", desc: "Email/phone → Google account + services." },
  { id: "hibp", name: "Have I Been Pwned", category: "Email", kind: "manual", input: "email", status: "freemium", url: "https://haveibeenpwned.com/account/{seed}", desc: "Which breaches an email appears in." },
  { id: "emailrep", name: "EmailRep", category: "Email", kind: "manual", input: "email", status: "freemium", url: "https://emailrep.io/{seed}", desc: "Email reputation/risk score." },
  { id: "holehe", name: "holehe", category: "Email", kind: "manual", input: "email", status: "free", url: "https://github.com/megadose/holehe", desc: "Email → account existence on 120+ sites." },
  { id: "phoneinfoga", name: "PhoneInfoga", category: "Phone", kind: "manual", input: "phone", status: "free", url: "https://github.com/sundowndev/phoneinfoga", desc: "Phone recon (country, carrier, dorks)." },
  { id: "truecaller", name: "Truecaller", category: "Phone", kind: "manual", input: "phone", status: "freemium", url: "https://www.truecaller.com/search/global/{seed}", desc: "Reverse phone → name (GDPR-sensitive)." },
  { id: "epieos-phone", name: "Epieos (phone)", category: "Phone", kind: "manual", input: "phone", status: "freemium", url: "https://epieos.com/", desc: "Number → WhatsApp/Telegram/Facebook sign-ups." },
  { id: "numverify", name: "Numverify", category: "Phone", kind: "manual", input: "phone", status: "freemium", url: "https://numverify.com/", desc: "Validation + carrier/line-type API." },
  { id: "pimeyes", name: "PimEyes", category: "Face", kind: "manual", input: "image", status: "paid", url: "https://pimeyes.com/en", desc: "Reverse face search (biometric caveat)." },
  { id: "facecheck", name: "FaceCheck.id", category: "Face", kind: "manual", input: "image", status: "freemium", url: "https://facecheck.id/", desc: "Reverse face over social/news." },
  { id: "yandex-img", name: "Yandex Images", category: "Face", kind: "manual", input: "image", status: "free", url: "https://yandex.com/images/", desc: "Best free reverse-image for faces." },
  { id: "shodan", name: "Shodan", category: "Infra", kind: "manual", input: "domain", status: "freemium", url: "https://www.shodan.io/search?query={seed}", desc: "Exposed devices/services search." },
  { id: "crtsh", name: "crt.sh", category: "Infra", kind: "manual", input: "domain", status: "free", url: "https://crt.sh/?q={seed}", desc: "Certificate transparency → subdomains." },
  { id: "intelx", name: "Intelligence X", category: "Leaks", kind: "manual", input: "both", status: "freemium", url: "https://intelx.io/?s={seed}", desc: "Leaks, pastes, darkweb, historical data." },
];

export const ALL_APPS: AppDef[] = [...BUILTIN_APPS, ...MANUAL_APPS];
export const BUILTIN_IDS = BUILTIN_APPS.map((a) => a.id);
