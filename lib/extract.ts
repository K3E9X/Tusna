// Entity extraction — pulls real identifiers out of the text we collect
// (bios, display names, profile fields) so the board grows from "platform
// presences" into a knowledge graph: emails, other aliases, links, real names.

export interface Extracted {
  emails: string[];
  aliases: string[]; // @handles mentioned in text
  urls: string[];
}

const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const HANDLE_RE = /(?:^|[\s(:,>])@([a-z0-9_](?:[a-z0-9_.]{2,29}))\b/gi;
const URL_RE = /https?:\/\/[^\s)"'<>]+/gi;

function uniq(arr: string[]): string[] {
  return [...new Set(arr)];
}

export function extractFromText(...parts: (string | undefined)[]): Extracted {
  const text = parts.filter(Boolean).join("  \n  ");
  const emails = uniq((text.match(EMAIL_RE) || []).map((s) => s.toLowerCase()));
  const aliases: string[] = [];
  let m: RegExpExecArray | null;
  HANDLE_RE.lastIndex = 0;
  while ((m = HANDLE_RE.exec(text)) !== null) aliases.push(m[1].toLowerCase());
  const urls = uniq((text.match(URL_RE) || []).map((u) => u.replace(/[.,);]+$/, "")));
  return { emails, aliases: uniq(aliases), urls };
}

export function normId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
