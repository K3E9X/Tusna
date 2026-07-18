// Reverse image search — find the SAME PERSON, not just the same file.
//
// pHash (lib/phash) already catches a recompressed copy of the identical image.
// What it cannot do is match the same face across DIFFERENT photos — that needs a
// face model or a reverse-image index. Rather than fake it, Octopus does the honest,
// battle-tested thing: it hands the analyst pre-filled deep links into the engines
// that do it well (Yandex is best for faces; PimEyes is face-specialised). The human
// runs the visual match — Octopus never invents a hit it cannot verify.

export interface ReverseImageEngine {
  id: string;
  label: string;
  /** builds the deep link for a given image URL */
  url: (imageUrl: string) => string;
  /** honest note on what this engine is good for */
  note: string;
}

export const REVERSE_IMAGE_ENGINES: ReverseImageEngine[] = [
  {
    id: "yandex",
    label: "Yandex Images",
    url: (u) => `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(u)}`,
    note: "Best general-purpose face/scene matcher — start here.",
  },
  {
    id: "google-lens",
    label: "Google Lens",
    url: (u) => `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(u)}`,
    note: "Strong for objects, landmarks and exact copies.",
  },
  {
    id: "bing",
    label: "Bing Visual",
    url: (u) => `https://www.bing.com/images/search?q=imgurl:${encodeURIComponent(u)}&view=detailv2&iss=sbi`,
    note: "Good coverage, occasionally finds what others miss.",
  },
  {
    id: "tineye",
    label: "TinEye",
    url: (u) => `https://tineye.com/search?url=${encodeURIComponent(u)}`,
    note: "Exact-copy tracking + first-seen date (provenance).",
  },
  {
    id: "pimeyes",
    label: "PimEyes",
    url: (u) => `https://pimeyes.com/en?query=${encodeURIComponent(u)}`,
    note: "Face-specialised. Paid for full results; use lawfully.",
  },
];

/** All engine deep links for one image URL. */
export function reverseImageLinks(imageUrl: string): { id: string; label: string; url: string; note: string }[] {
  const u = imageUrl.trim();
  if (!/^https?:\/\//i.test(u)) return [];
  return REVERSE_IMAGE_ENGINES.map((e) => ({ id: e.id, label: e.label, url: e.url(u), note: e.note }));
}
