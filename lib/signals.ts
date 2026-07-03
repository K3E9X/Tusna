// Mock correlation data for the Orbit view.
// In production these objects are produced by the ingestion pipeline
// (connectors → normalization → matching engine) — never invented by the LLM.

export type Status = "confirmed" | "review" | "candidate" | "rejected";

export interface Evidence {
  /** short name of the signal, e.g. "Avatar identique" */
  name: string;
  /** human-readable detail */
  detail: string;
  /** provenance: how this fact was obtained (must be verifiable) */
  source: string;
  /** signal strength 0-100 */
  weight: number;
}

export interface Signal {
  id: string;
  /** platform / source label, uppercase */
  platform: string;
  /** the handle / identifier found */
  handle: string;
  /** 2-3 letter monochrome disc tag */
  disc: string;
  /** aggregated match confidence 0-100 (from the matching engine, not the LLM) */
  confidence: number;
  status: Status;
  evidence: Evidence[];
}

export const SEED = "j0hn_doe";

export const SIGNALS: Signal[] = [
  {
    id: "x", platform: "X / TWITTER", handle: "@j0hn_doe", disc: "X", confidence: 96, status: "confirmed",
    evidence: [
      { name: "Avatar identique", detail: "Hash perceptuel du portrait — collision quasi exacte.", source: "pHash · agrégé localement", weight: 98 },
      { name: "Cross-link explicite", detail: "La bio pointe vers github.com/j0hndoe.", source: "observé · page publique", weight: 95 },
      { name: "Username exact", detail: "j0hn_doe ≡ graine, aucune variation.", source: "déterministe", weight: 90 },
    ],
  },
  {
    id: "gh", platform: "GITHUB", handle: "j0hndoe", disc: "GH", confidence: 92, status: "confirmed",
    evidence: [
      { name: "Email de commit", detail: "j***@proton.me réutilisé sur 3 comptes liés.", source: "observé · métadonnées git", weight: 93 },
      { name: "Avatar identique", detail: "pHash 97% avec le portrait X.", source: "pHash", weight: 97 },
      { name: "Cross-link", detail: "README → profil X.", source: "observé", weight: 88 },
    ],
  },
  {
    id: "ma", platform: "MASTODON", handle: "@johndoe@infosec.exchange", disc: "MA", confidence: 81, status: "review",
    evidence: [
      { name: "Bio dupliquée", detail: "Texte de bio copié mot pour mot depuis X.", source: "similarité textuelle", weight: 88 },
      { name: "Avatar proche", detail: "pHash 95%.", source: "pHash", weight: 95 },
      { name: "Fuseau d'activité", detail: "Pics d'activité UTC+1 cohérents.", source: "statistique · indice faible", weight: 55 },
    ],
  },
  {
    id: "kb", platform: "KEYBASE", handle: "johndoe", disc: "KB", confidence: 88, status: "review",
    evidence: [
      { name: "Clé PGP", detail: "Fingerprint lié à l'email connu.", source: "cryptographique", weight: 92 },
      { name: "Username proche", detail: "johndoe.", source: "déterministe", weight: 70 },
    ],
  },
  {
    id: "rd", platform: "REDDIT", handle: "u/john_doe_", disc: "RD", confidence: 74, status: "review",
    evidence: [
      { name: "Username fuzzy", detail: "john_doe_ · distance 0.82.", source: "déterministe", weight: 72 },
      { name: "Style d'écriture", detail: "Tournures récurrentes (indice, non probant).", source: "stylométrie · indice", weight: 60 },
    ],
  },
  {
    id: "hf", platform: "FORUM", handle: "d0e", disc: "HF", confidence: 62, status: "candidate",
    evidence: [
      { name: "Fragment PGP", detail: "4 derniers octets identiques.", source: "cryptographique · partiel", weight: 65 },
      { name: "Fuseau", detail: "UTC+1.", source: "statistique · indice", weight: 55 },
    ],
  },
  {
    id: "st", platform: "STEAM", handle: "johndoe1990", disc: "ST", confidence: 58, status: "candidate",
    evidence: [
      { name: "Racine + millésime", detail: "johndoe + 1990.", source: "déterministe", weight: 60 },
      { name: "Cohérence d'âge", detail: "1990 aligné avec autres profils.", source: "corrélation faible", weight: 50 },
    ],
  },
  {
    id: "tg", platform: "TELEGRAM", handle: "@jd_1990", disc: "TG", confidence: 46, status: "candidate",
    evidence: [
      { name: "Téléphone partiel", detail: "+33 6 ** ** *1 90.", source: "observé · partiel", weight: 48 },
      { name: "Initiales + millésime", detail: "jd + 1990.", source: "spéculatif", weight: 40 },
    ],
  },
  {
    id: "ig", platform: "INSTAGRAM", handle: "john.doe.real", disc: "IG", confidence: 21, status: "rejected",
    evidence: [
      { name: "Avatar divergent", detail: "pHash 21% — visage différent.", source: "pHash · contradiction", weight: 21 },
      { name: "Géo incohérente", detail: "Profil localisé au Texas.", source: "observé · contradiction", weight: 15 },
    ],
  },
];

export const BANDS: Record<Status, { r0: number; r1: number; label: string }> = {
  confirmed: { r0: 0.16, r1: 0.27, label: "CONFIRMÉ" },
  review: { r0: 0.32, r1: 0.47, label: "À VÉRIFIER" },
  candidate: { r0: 0.52, r1: 0.70, label: "CANDIDAT" },
  rejected: { r0: 0.86, r1: 0.98, label: "ORBITE FROIDE" },
};

export const BAND_ORDER: Status[] = ["confirmed", "review", "candidate", "rejected"];
