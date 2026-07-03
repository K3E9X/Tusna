# Tusna

**Plateforme OSINT d'agrégation et de corrélation d'identité.**
Tusna n'est pas un lanceur de scripts : c'est un hub qui fusionne, déduplique, relie et **score** ce que produisent des dizaines d'outils OSINT, dans une expérience rapide et traçable.

La vue signature est **Orbit** : la corrélation d'identité présentée comme un **système gravitationnel**. La graine (un pseudo, un email, une personne) est au centre ; chaque présence trouvée sur le net est un corps en orbite ; **la confiance du moteur de matching = la force d'attraction**. Preuve forte → orbite serrée (le « soi confirmé ») ; preuve faible ou contredite → dérive vers le froid. Physique à ressorts : tout glisse, rien n'est figé.

> État : prototype d'interface (données simulées). Le pipeline d'ingestion, les connecteurs et le moteur de matching sont décrits dans [`docs/architecture.md`](docs/architecture.md) et arrivent par étapes.

## Démarrer en local

```bash
npm install
npm run dev
# http://localhost:3000
```

Build de production :

```bash
npm run build && npm start
```

## Déployer sur Vercel (gratuit)

L'app est une application Next.js standard, déployable sans configuration.

1. Pousser ce dépôt sur GitHub (déjà fait : `K3E9X/Tusna`).
2. Aller sur [vercel.com/new](https://vercel.com/new) et se connecter avec GitHub.
3. **Import** du dépôt `K3E9X/Tusna`.
4. Vercel détecte Next.js automatiquement — aucun réglage à changer :
   - Framework : **Next.js**
   - Build command : `next build` (auto)
   - Output : `.next` (auto)
5. **Deploy**. L'URL de preview est prête en ~1 minute ; chaque push redéploie.

Aucune variable d'environnement n'est requise à ce stade (données simulées). Les clés d'API des connecteurs (Shodan, HIBP, etc.) seront ajoutées comme variables d'environnement Vercel quand le backend sera branché — jamais commitées.

## Structure

```
app/            # Next.js App Router (layout, page, styles globaux)
components/     # OrbitBoard.tsx — la vue Orbit (canvas + physique à ressorts)
lib/            # signals.ts — modèle de données de corrélation (typé)
docs/           # architecture.md, osint-tools-research.md, llm-correlation.md
```

## Direction artistique

Puriste, minimaliste, épurée. Un void, des anneaux en filet, du monospace comme face héroïque (instrument scientifique), **un seul accent** cyan désaturé. La confiance est encodée par la **distance et la luminosité**, pas par des couleurs criardes. Le vide (negative space) fait partie du design.

## Principe de corrélation LLM — sans hallucination

Le LLM **assiste, il ne décide pas, et il n'invente jamais**. Le score de corrélation n'agrège que des **preuves rattachées à une source vérifiable** (avatar pHash, cross-link observé, clé PGP, email de commit…). Chaque preuve porte sa provenance et son poids. Aucune assertion non sourcée n'est produite. L'humain tranche (confirmer / à vérifier / rejeter) — jamais de fusion automatique silencieuse sur une personne. Détails dans [`docs/llm-correlation.md`](docs/llm-correlation.md).

## Feuille de route (résumé)

1. **Fait** — vue Orbit (prototype UI), archi de référence, recherche outils.
2. Connecteurs réels (Maigret/Sherlock, crt.sh, Epieos…) alimentant le board.
3. Moteur de matching (Splink + pHash + embeddings) + file de triage.
4. Couche LLM de corrélation sourcée (extraction, tie-break, résumé).
5. Auth, audit, conformité RGPD, multi-tenant.

Voir [`docs/architecture.md`](docs/architecture.md) et [`docs/osint-tools-research.md`](docs/osint-tools-research.md).

## Cadre légal

Outil destiné à l'investigation OSINT **légitime** (threat intel, due diligence, protection de marque, journalisme). Traitement de données personnelles → RGPD by design (base légale, minimisation, rétention limitée, audit, droits des personnes). Respect des CGU des sources ; les sources à CGU restrictives sont exclues ou clairement étiquetées.
