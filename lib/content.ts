// Content mining — read WHAT the person actually wrote, not just when. Post text,
// commit messages and toots are where the real identifiers hide: the people they
// @-mention (close contacts), emails dropped in the open, and self-reported location
// or employer. Everything here is DETERMINISTIC pattern extraction — no NLP guessing,
// no LLM — so it can only surface things that are literally present in the text.

export interface MinedContent {
  /** @handles mentioned across posts, most-frequent first */
  mentions: { handle: string; count: number }[];
  /** email addresses found in post text */
  emails: string[];
  /** external URLs shared */
  urls: string[];
  /** hashtags used (interests) */
  hashtags: { tag: string; count: number }[];
  /** self-reported places ("based in Paris") — WEAK, flagged as inferred */
  places: string[];
  /** self-reported employer ("works at Acme") — WEAK, flagged as inferred */
  employers: string[];
}

const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const MENTION_RE = /(?:^|[\s(:,>])@([a-z0-9_](?:[a-z0-9_.]{1,29}))\b/gi;
const URL_RE = /https?:\/\/[^\s)"'<>]+/gi;
const HASHTAG_RE = /(?:^|\s)#([a-z0-9_]{2,30})\b/gi;
// conservative self-report patterns — require a leading cue so we don't grab any
// random capitalised word. Still a WEAK signal, and labelled as such downstream.
const PLACE_RE = /\b(?:[Bb]ased in|[Ll]iving in|[Ll]ocated in|[Ll]ives in|[Ii] live in|[Ff]rom)\s+([A-Z][a-zA-Z.'-]+(?:[ ,]+[A-Z][a-zA-Z.'-]+){0,2})/g;
const EMPLOYER_RE = /\b(?:[Ww]orks? at|[Ww]orking at|[Ee]mployed at|[Ee]ngineer at|[Dd]ev(?:eloper)? at)\s+([A-Z][A-Za-z0-9.&'-]+(?:[ ][A-Z][A-Za-z0-9.&'-]+){0,2})/g;

const STOP_PLACES = new Set(["the", "my", "home", "here", "there", "work", "now", "today"]);

function topCounts(items: string[]): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items) m.set(it, (m.get(it) || 0) + 1);
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export function mineContent(texts: string[], selfHandle = ""): MinedContent {
  const blob = texts.filter(Boolean).join("\n");
  const self = selfHandle.replace(/^@/, "").toLowerCase();

  const mentionsRaw: string[] = [];
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(blob)) !== null) {
    const h = m[1].toLowerCase();
    if (h !== self && !h.includes("..")) mentionsRaw.push(h);
  }

  const hashtagsRaw: string[] = [];
  HASHTAG_RE.lastIndex = 0;
  while ((m = HASHTAG_RE.exec(blob)) !== null) hashtagsRaw.push(m[1].toLowerCase());

  const places = new Set<string>();
  PLACE_RE.lastIndex = 0;
  while ((m = PLACE_RE.exec(blob)) !== null) {
    const p = m[1].trim();
    if (p.length >= 3 && !STOP_PLACES.has(p.toLowerCase())) places.add(p);
  }

  const employers = new Set<string>();
  EMPLOYER_RE.lastIndex = 0;
  while ((m = EMPLOYER_RE.exec(blob)) !== null) {
    const e = m[1].trim();
    if (e.length >= 2 && !STOP_PLACES.has(e.toLowerCase())) employers.add(e);
  }

  const emails = [...new Set((blob.match(EMAIL_RE) || []).map((s) => s.toLowerCase()))];
  const urls = [...new Set((blob.match(URL_RE) || []).map((u) => u.replace(/[.,);]+$/, "")))].slice(0, 20);

  return {
    mentions: topCounts(mentionsRaw).map((x) => ({ handle: x.key, count: x.count })).slice(0, 20),
    emails,
    urls,
    hashtags: topCounts(hashtagsRaw).map((x) => ({ tag: x.key, count: x.count })).slice(0, 20),
    places: [...places].slice(0, 6),
    employers: [...employers].slice(0, 6),
  };
}
