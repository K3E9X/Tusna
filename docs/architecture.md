# Tusna — Architecture & Stratégie Produit (Plateforme OSINT d'agrégation et de corrélation)

> Document d'architecture v1. Rôle : architecte produit + lead engineer + OSINT research assistant.
> Objectif : construire **Tusna**, une plateforme web d'agrégation d'outils/sources OSINT publics,
> avec table de recherche dynamique, moteur de matching / entity resolution, et couche LLM légère.

---

## 0. Cadre & hypothèses

**Hypothèses posées (à confirmer) :**

1. **Cible utilisateur** : analystes cyber / journalistes d'investigation / DPO-fraude / due diligence. Pas du grand public. → impacte l'UX (dense, pro) et la conformité.
2. **Échelle initiale** : 1–20 utilisateurs concurrents, quelques centaines d'enquêtes/mois au MVP. Pas de « scan de masse ».
3. **Équipe** : petite (1 à 3 devs). → on privilégie **une stack mono-langage, mono-monolithe modulaire**, pas un essaim de micro-services.
4. **Hébergement** : self-host / VPS UE (RGPD) au départ, cloud-agnostique ensuite.
5. **Budget** : bootstrap. On maximise l'open-source et les tiers gratuits ; on isole les coûts variables (APIs payantes, GPU LLM).

**Garde-fous légaux et éthiques (non négociables, à intégrer dès le MVP) :**

- **RGPD** : Tusna traite des données personnelles. Base légale (intérêt légitime), minimisation, rétention limitée, droit à l'effacement, journal d'accès. → une **couche audit dès le jour 1**, pas en option.
- **Respect des ToS** des sources : on n'intègre pas de scraping qui viole explicitement des CGU (ex. LinkedIn, Meta). On préfère **APIs officielles + outils OSINT réputés**. Chaque connecteur porte un flag `legal_status` + `rate_policy`.
- **Périmètre défensif** : investigation légitime, threat intel, due diligence, protection de marque. Pas de harcèlement/stalking. → **consentement/mandat d'enquête** loggué, quotas, watermark d'export.
- **Pas d'« illusion de complétude »** : toute source rate-limitée, freemium, instable ou géo-restreinte est **étiquetée dans l'UI** (badge fiabilité + fraîcheur).

---

## 1. Résumé exécutif

Tusna n'est **pas** un lanceur de scripts : c'est un **hub d'orchestration + un data-store d'entités corrélées**. La valeur n'est pas « lancer theHarvester », c'est **fusionner les résultats de 30 outils en une vue entité unique, dédupliquée, reliée et scorée**.

Le marché open-source a déjà résolu deux briques que vous **ne devez pas réécrire** :

- **L'agrégation de connecteurs** → modèle **IntelOwl** (Django + Celery + plugins « analyzers/connectors »). C'est exactement votre besoin. On s'en inspire fortement, voire on l'étend.
- **L'entity resolution** → **Splink** (probabiliste, scalable, explicable). État de l'art open-source, gratuit, licence MIT.

**Recommandation directe :** monolithe modulaire **Python (FastAPI ou Django)** + **PostgreSQL** (source de vérité + `pgvector`) + **OpenSearch** (recherche/full-text) + **Redis + Celery/RQ** (jobs) + workers-connecteurs isolés + **Splink** pour le matching + **PostgreSQL/Apache AGE ou Neo4j** pour le graphe d'entités. Frontend **Next.js (React) + TanStack Table/Query**. LLM branché en **service découplé** (Ollama/vLLM en self-host, ou API par token), jamais dans le chemin critique.

Le risque n°1 n'est pas technique : c'est **la fragilité des sources** (rate-limits, casse, légalité). L'architecture doit rendre chaque connecteur **remplaçable, isolable et dégradable** sans faire tomber le produit.

---

## 2. Analyse de l'existant

### 2.1 Catégories d'outils/sources OSINT à intégrer

Structure dérivée d'**OSINT Framework** et des grands répertoires (awesome-osint, IntelOwl analyzers). Priorisation MVP → V2.

| Catégorie (pivot) | Ce qu'on cherche | Outils/sources open-source ou API | Priorité |
|---|---|---|---|
| **Domaine / DNS / Infra** | sous-domaines, DNS, WHOIS, certs | Amass, Subfinder, dnsx, crt.sh, **theHarvester**, SecurityTrails*, DNSDumpster | **MVP** |
| **IP / Réseau** | géoloc, ASN, ports, réputation | **Shodan***, Censys*, GreyNoise*, AbuseIPDB*, IPinfo*, MaxMind GeoLite (gratuit) | **MVP** |
| **Email** | validité, breach, réputation | **Have I Been Pwned*** (API payante), holehe, Hunter*, EmailRep, mailfilter MX-check | **MVP** |
| **Username / Pseudo** | présence multi-plateforme | **Sherlock**, **Maigret**, WhatsMyName (liste JSON) | **MVP** |
| **Personne / Identité** | agrégation identité | corrélation interne + connecteurs ci-dessus | V2 |
| **Fichiers / Media** | métadonnées, hash, malware | **ExifTool**, VirusTotal*, YARA, reverse image (limité) | V2 |
| **Réseaux sociaux** | posts, profils | APIs officielles quand dispo ; **sinon exclu/étiqueté** (ToS) | V2 (prudent) |
| **Threat Intel / IoC** | enrichissement indicateurs | MISP, OpenCTI (connecteur), OTX AlienVault*, URLScan* | V2 |
| **Fuites / Breach / Paste** | credentials exposés | HIBP*, Dehashed* (payant), sources paste publiques | V2 (sensible) |
| **Géospatial / Images** | imagerie, cartes | OpenStreetMap, Sentinel/Copernicus (gratuit), Overpass | V3 |
| **Entreprises / Registres** | corporate, KYB | OpenCorporates* (freemium), registres publics UE, GLEIF (gratuit) | V2 |
| **Blockchain** | adresses, flux | explorateurs publics, Blockchair* | V3 |

`*` = **freemium / clé requise / quotas / potentiellement payant → à étiqueter dans l'UI.**

### 2.2 Types de sources pertinentes (par mode d'accès)

1. **CLI open-source packagés** (Sherlock, Amass, theHarvester, ExifTool, Subfinder…) → wrappés dans des workers dockerisés. Gratuits, mais casse/maintenance à surveiller.
2. **APIs publiques officielles** (Shodan, HIBP, VirusTotal, IPinfo, crt.sh, GLEIF…) → connecteurs HTTP avec gestion de clé/quota. **Le plus fiable, mais coûts/limites.**
3. **Datasets statiques** (MaxMind GeoLite, WhatsMyName, listes ASN) → ingérés en base, requêtables offline. **Le plus rapide, zéro dépendance runtime.**
4. **Scraping** → **dernier recours**, uniquement sources sans ToS restrictives, isolé et clairement identifié comme fragile.

### 2.3 Interne vs délégué

| Doit être **interne** (votre différenciateur) | Doit être **délégué** (ne pas réinventer) |
|---|---|
| Table de recherche dynamique + UX | Collecte brute par source (CLI/API existants) |
| **Entity resolution / dédup / matching** | Résolution DNS, scan de ports, breach lookup |
| Graphe de relations entre entités | Géoloc IP (MaxMind), certs (crt.sh) |
| Normalisation & schéma d'entité unifié | Reverse image, malware scan (VT) |
| Orchestration jobs + cache + fraîcheur | Modèle LLM (Ollama/vLLM/API), pas d'entraînement |
| Scoring de confiance & provenance | Cartographie (OSM/tuiles) |
| Audit / conformité / RBAC | — |

**Règle d'or :** vous possédez le **modèle d'entité, la corrélation et l'expérience**. Tout le reste est un **plugin remplaçable**.

---

## 3. Recommandation d'architecture

### 3.1 Vue d'ensemble (monolithe modulaire + workers)

```
                         ┌──────────────────────────┐
                         │   Frontend Next.js/React │
                         │  TanStack Table + Query  │
                         │  Graphe (Sigma/Cytoscape)│
                         └────────────┬─────────────┘
                                      │ REST/GraphQL + WebSocket (progress)
                         ┌────────────▼─────────────┐
                         │      API (FastAPI/Django) │
                         │  Auth/RBAC · Audit · Jobs │
                         └───┬──────────┬─────────┬──┘
             enqueue jobs    │          │ read    │ read/write
                     ┌───────▼───┐  ┌───▼────┐ ┌──▼─────────┐
                     │ Redis +   │  │OpenSearch│ │ PostgreSQL │
                     │ Celery/RQ │  │ (search) │ │  (vérité)  │
                     └─────┬─────┘  └──────────┘ │ + pgvector │
                           │                     │ + AGE(graph)│
        ┌──────────────────┼──────────────┐      └────┬───────┘
        │                  │              │           │ index sync (CDC/outbox)
  ┌─────▼─────┐     ┌──────▼──────┐  ┌────▼─────┐ ┌───▼──────────┐
  │Connector  │ ... │ Connector   │  │ Matching │ │ LLM service  │
  │worker (CLI│     │ worker (API)│  │ (Splink) │ │ (Ollama/vLLM │
  │ dockerisé)│     │             │  │  ER/dedup│ │  ou API)     │
  └───────────┘     └─────────────┘  └──────────┘ └──────────────┘
```

### 3.2 Frontend

- **Next.js (React, TypeScript)** — SSR pour la vitesse de premier rendu, écosystème mature, recrutement facile.
- **TanStack Table** (table dynamique : tri/filtre/colonnes/virtualisation) + **TanStack Query** (cache réseau, invalidation, statut de jobs).
- **Graphe d'entités** : **Cytoscape.js** ou **Sigma.js + Graphology** (WebGL, tient des milliers de nœuds). Éviter D3 pur pour de gros graphes.
- **UI kit** : shadcn/ui + Tailwind (rapide, cohérent, gratuit).
- **Temps réel** : WebSocket/SSE pour la progression des jobs (un scan OSINT = latence variable → jamais bloquer l'UI).

### 3.3 Backend

- **Python** (langage du terrain OSINT : la majorité des outils sont Python/CLI, bindings directs).
- **MVP → FastAPI** (léger, async, parfait pour orchestrer des I/O réseau) **OU Django + DRF** si vous voulez admin/ORM/RBAC/migrations « batteries incluses » (c'est le choix d'IntelOwl, et il est défendable).
  - **Verdict interne :** **Django + DRF** au MVP si vous voulez aller vite sur l'auth/admin/audit ; **FastAPI** si l'équipe est à l'aise et veut du full-async. Les deux tiennent.
- **Monolithe modulaire** : modules `sources/`, `entities/`, `matching/`, `search/`, `audit/`. Pas de micro-services avant d'en avoir *vraiment* besoin.

### 3.4 Base de données

- **PostgreSQL = source de vérité unique.** Robuste, transactionnel, JSONB pour les payloads hétérogènes des connecteurs.
- **`pgvector`** pour les embeddings (similarité sémantique, dédup assistée, recherche « fuzzy »).
- **Graphe** : commencer avec **Apache AGE** (extension Postgres, openCypher) pour rester mono-DB ; migrer vers **Neo4j** seulement si le graphe devient le cœur analytique (requêtes de chemins complexes à grande échelle).
- **Modèle d'entité canonique** (clé du produit) :
  - `entity` (type: person/email/domain/ip/username/org…), `observation` (fait brut + source + timestamp + confiance), `relationship` (entity↔entity, typé), `source_run` (provenance/job).
  - Chaque fait garde **sa source et sa fraîcheur** → provenance traçable, RGPD-compatible.

### 3.5 Moteur de recherche

- **OpenSearch** (fork Apache 2.0 d'Elasticsearch, pas de risque de licence) : full-text, facettes, agrégations, autocomplétion, requêtes floues.
- Postgres reste la vérité ; OpenSearch est un **index dérivé** (synchronisé via pattern **outbox/CDC**, jamais écrit directement par l'utilisateur).
- Alternative légère MVP : **Postgres full-text (`tsvector`) + `pg_trgm`** suffit pour < ~1M docs. → **on peut démarrer sans OpenSearch** et l'ajouter quand le volume l'exige. (Recommandé : MVP en Postgres FTS, OpenSearch en V2.)

### 3.6 Pipeline d'ingestion

Flux normalisé pour **chaque** connecteur :

```
seed (ex: domaine) → job → connector worker → payload brut (JSONB)
   → normalisation vers schéma d'entité canonique
   → dédup/matching (Splink)  → upsert entités + relations (Postgres)
   → indexation (OpenSearch/FTS)  → notification UI (WebSocket)
```

- **Contrat de connecteur** standardisé : `input_types`, `output_entities`, `rate_policy`, `legal_status`, `cost_tier`, `reliability`. → un nouveau connecteur = une classe + un manifeste, testable en isolation.
- **Cache + TTL par source** : ne pas re-frapper Shodan pour la même IP en 24 h. Économise quotas et argent.
- **Idempotence** : rejouer un job ne duplique pas les entités (clé naturelle + hash de fait).

### 3.7 Orchestration des jobs

- **Redis + Celery** (mûr, monitoring via Flower) **ou RQ** (plus simple au MVP). Multi-queues par profil : `fast` (API), `slow` (CLI lourds), `paid` (quota-limité), `llm`.
- **Playbooks** (concept IntelOwl) : enchaînements « si domaine → sous-domaines → IPs → géoloc → breach » = **pivots automatiques**. C'est le cœur de la corrélation.
- Backpressure & retries avec backoff ; **circuit breaker** par source (si une API tombe, on dégrade, on n'échoue pas tout).
- **Workflow avancé (V2)** : si les DAG deviennent complexes, envisager **Temporal** (durable execution) — mais pas au MVP (sur-ingénierie).

### 3.8 Couche matching / dédup / entity resolution — *le cœur différenciant*

- **Splink** (MIT, probabiliste, explicable, scalable via DuckDB/Spark) = choix par défaut. Gère blocking rules, poids de match, seuils, clustering — et **explique pourquoi** deux enregistrements matchent (crucial en investigation & en conformité).
- **Complément déterministe** en amont : normalisation (emails lowercased, domaines punycode, téléphones E.164, noms translittérés) + règles exactes → réduit le bruit avant le probabiliste.
- **Assistance sémantique** : `pgvector` + embeddings pour rapprocher des variantes « floues » (alias, fautes) que le probabiliste seul rate.
- **Humain dans la boucle** : file de « candidats à fusionner » avec score → l'analyste valide/rejette (Splink + UI). **Jamais de fusion auto silencieuse** sur données personnelles.
- Alternatives : **Zingg** (si vous partez data-engineering/Spark), **dedupe** (petite échelle, active learning — ne scale pas > ~10k). **Senzing/Tilores** = puissants mais propriétaires/coûteux → à éviter au bootstrap.

### 3.9 Sécurité & audit

- **AuthN/AuthZ** : OIDC (Keycloak self-host, gratuit) ou Auth.js ; **RBAC** (analyste / lead / admin).
- **Audit log immuable** : qui a cherché quoi, quand, sur quelle base légale (append-only, hash-chaîné).
- **Secrets** : toutes les clés API en vault (Doppler/Infisical/Vault), jamais en base ni en repo.
- **Isolation des workers** : conteneurs sans privilège, réseau egress filtré (un connecteur ne parle qu'à sa source).
- **RGPD by design** : rétention configurable, purge, export/effacement par sujet, minimisation, watermark & log d'export.
- **Multi-tenant** (si SaaS) : cloisonnement strict par organisation (row-level security Postgres).

---

## 4. Proposition de stack — tableau comparatif

### 4.1 Comparatif des options

| Couche | Option **simple / MVP** | Option **robuste / scalable** | Déconseillé (et pourquoi) |
|---|---|---|---|
| Frontend | Next.js + TanStack Table/Query + shadcn | idem + Sigma/Cytoscape (WebGL) + design system | SPA maison / jQuery ; Angular (poids inutile ici) |
| Backend | **Django+DRF** (ou FastAPI) monolithe | idem, modules extraits en services *si* besoin | Micro-services d'emblée ; Node pour l'orchestration OSINT (écosystème outils = Python) |
| Vérité | PostgreSQL + JSONB | Postgres + partitions + réplicas lecture | MongoDB comme vérité (perte relationnel/ACID) |
| Recherche | Postgres FTS (`tsvector`+`pg_trgm`) | **OpenSearch** | Elasticsearch (risque licence SSPL) ; Algolia (coût, données sensibles hors UE) |
| Vecteurs | `pgvector` | pgvector + index HNSW, ou Qdrant si volume | Pinecone (coût, hébergement tiers de données perso) |
| Graphe | Apache AGE (dans Postgres) | **Neo4j** (community/enterprise) | Graphe « émulé » en jointures SQL non typées |
| Jobs | Redis + RQ | Redis + Celery multi-queue (+ Temporal V2) | Cron maison ; jobs synchrones dans l'API |
| Connecteurs | wrappers CLI dockerisés + clients API | plugins IntelOwl-like + registry + sandbox | scraping fragile non isolé ; tout en process API |
| Matching | Splink (DuckDB backend) | Splink (Spark) + pgvector + review UI | fusion par règles SQL ad hoc ; ML maison from scratch |
| LLM | Ollama (Qwen/Mistral) *hors chemin critique* | vLLM sur GPU dédié, ou API à l'usage | LLM synchrone bloquant l'UI ; fine-tuning prématuré |
| Auth/Audit | Auth.js + audit append-only Postgres | Keycloak OIDC + RBAC + hash-chain | auth maison ; pas d'audit (bloquant RGPD) |
| Infra | Docker Compose (1 VPS UE) | Kubernetes (quand ≥ plusieurs nœuds) | K8s dès le jour 1 (sur-coût opérationnel) |

### 4.2 Stack recommandée — **MVP** (time-to-market, 1–3 devs)

- **Front** : Next.js + TypeScript + TanStack Table/Query + shadcn/ui + Cytoscape.js.
- **Back** : **Django + DRF** (auth/admin/migrations/RBAC inclus) — monolithe modulaire.
- **Data** : **PostgreSQL** (JSONB + `pgvector` + `pg_trgm` FTS + Apache AGE pour un graphe minimal).
- **Jobs** : **Redis + Celery** (multi-queue), Flower pour le monitoring.
- **Connecteurs** : 8–10 max pour démarrer — theHarvester, Amass/Subfinder, Sherlock/Maigret, crt.sh, MaxMind GeoLite, IPinfo, HIBP (si budget), Shodan (si budget). Chacun : worker dockerisé + manifeste.
- **Matching** : **Splink** (backend DuckDB) + normalisation déterministe + review UI.
- **LLM** : **Ollama** local (Qwen 3 / Mistral Small) pour extraction & résumé, **asynchrone**, optionnel.
- **Infra** : **Docker Compose** sur 1 VPS UE. CI simple (GitHub Actions).
- **Sécurité** : Auth.js/OIDC + audit append-only + secrets en vault.

> Pourquoi : un seul langage dominant (Python), une seule DB à opérer, pas de Kubernetes, brique matching état de l'art gratuite. **Livrable en semaines, pas en mois.**

### 4.3 Stack recommandée — **version scalable / long terme**

- **Recherche** : migration Postgres FTS → **OpenSearch** (facettes, gros volumes, agrégations).
- **Graphe** : Apache AGE → **Neo4j** dédié si l'analyse de graphe devient centrale.
- **Orchestration** : Celery → ajout **Temporal** pour workflows durables/longs (playbooks multi-étapes reprenables).
- **Vecteurs** : `pgvector` → **Qdrant** si le volume d'embeddings explose.
- **LLM** : Ollama → **vLLM** sur GPU dédié (batching, débit) ou API par token avec routeur/cache.
- **Infra** : Compose → **Kubernetes** (auto-scaling des workers-connecteurs, isolation forte).
- **Connecteurs** : registry de plugins type IntelOwl + sandbox + marketplace interne.
- **Multi-tenant** : Row-Level Security + facturation à l'usage des sources payantes.

### 4.4 Ce que je déconseille explicitement

- **Micro-services dès le départ** : tue la vélocité d'une petite équipe. Monolithe modulaire d'abord.
- **Elasticsearch** (licence SSPL) → préférez **OpenSearch** (Apache 2.0).
- **MongoDB comme source de vérité** : vous perdez l'ACID et le relationnel dont l'entity resolution a besoin.
- **LLM dans le chemin critique** (rendu de page bloqué par une inférence) : fragilise tout. Toujours async, toujours dégradable.
- **Scraper des plateformes à ToS restrictives** (LinkedIn, Meta…) : risque juridique + casse permanente. Étiqueter/exclure.
- **Fine-tuning LLM au MVP** : coûteux, prématuré. Prompting + RAG suffisent.
- **Réécrire l'entity resolution from scratch** : Splink existe, il est meilleur que ce que vous ferez en 6 mois.

---

## 5. Stratégie LLM

**Principe : le LLM assiste, il ne décide pas, et il ne bloque jamais.** En OSINT, l'hallucination est un risque de sécurité (faux positif = mauvaise accusation). Donc : **outillage assistif, avec citation de source obligatoire**.

### 5.1 Usages qui valent vraiment le coup (ROI décroissant)

1. **Extraction d'entités** (NER) sur texte libre (pastes, WHOIS, articles) → normalise vers le schéma. **Fort ROI.**
2. **Résumé & narration d'enquête** : condenser 200 observations en une fiche lisible. **Fort ROI.**
3. **Aide au matching (tie-breaker)** : « ces deux profils sont-ils la même personne ? » avec justification — **en complément de Splink, jamais à sa place.**
4. **Traduction / translittération** de contenus multilingues. **Bon ROI.**
5. **Requêtes en langage naturel → filtres de table** (« montre les IPs russes vues cette semaine »). **Bon UX, ROI moyen.**
6. **Classement/priorisation** des résultats par pertinence. ROI moyen.

**À éviter :** laisser le LLM *inventer* des faits/liens non sourcés ; l'utiliser comme moteur de recherche ; le mettre synchrone dans le rendu.

### 5.2 Modèles open-weight candidats (self-host)

- **Qwen 3 (Apache 2.0)** — meilleur rapport qualité/taille/multilingue, bon function-calling & JSON structuré. **Défaut recommandé.**
- **Mistral Small (Apache 2.0)** — excellent pour agents/JSON/function-calling en production, léger.
- **Gemma 3 27B** / **Phi-4 14B** — tiennent sur un seul GPU (16/8 Go VRAM) pour extraction/résumé.
- **DeepSeek** — top raisonnement, mais plus lourd à opérer ; réserver aux tâches dures.

> Licences : privilégier **Apache 2.0 / MIT** (usage commercial propre). Vérifier la licence exacte de chaque poids avant prod.

### 5.3 Comment les brancher sans fragiliser

- **Service LLM découplé** derrière une API interne (OpenAI-compatible) → on swappe le backend sans toucher au produit.
  - MVP : **Ollama** (simple, CPU/GPU modeste, quantifié).
  - Scale : **vLLM** (débit/batching) sur GPU dédié, ou **API par token** (routeur + cache).
- **Toujours asynchrone** : tâche `llm` en queue, résultat poussé via WebSocket. Le produit fonctionne **sans** LLM (dégradation gracieuse).
- **Sorties structurées obligatoires** : JSON Schema / grammar-constrained → pas de texte libre à parser.
- **Ancrage & provenance** : RAG sur *vos* observations ; chaque assertion LLM cite l'`observation_id` source. Pas de source → pas d'affichage.
- **Garde-fous** : timeouts, budget tokens/enquête, cache (même prompt → même réponse), révision humaine sur décisions sensibles.

### 5.4 Maîtrise des coûts

- Self-host quantifié pour le volume constant (extraction/résumé) ; API par token pour les pics/tâches dures.
- **Cache agressif** (embeddings + réponses), batch, prompts courts, **router** : petit modèle par défaut, gros modèle seulement si nécessaire.
- Compter le LLM comme **coût variable isolé** (comme les APIs payantes) — visible dans le dashboard de coûts.

---

## 6. Stratégie produit

### 6.1 Table de recherche dynamique

- **Une ligne = une entité** (person/email/domain/ip/username/org), pas un résultat brut d'outil (sinon noyade).
- Colonnes : type, valeur canonique, **score de confiance**, **fraîcheur**, **nb de sources**, tags, dernière MAJ.
- Fonctions : tri/filtre multi-critères, facettes (par type, source, pays, fiabilité), colonnes configurables, **virtualisation** (10k+ lignes fluides), sélection multi → actions groupées (enrichir, exporter, fusionner).
- **Vue détail entité** (drawer) : timeline d'observations **avec source + date + confiance** pour chacune, relations, historique d'enrichissement.
- **Badges de qualité** partout : `freemium`, `rate-limited`, `stale`, `unverified` → l'analyste sait ce qu'il regarde.

### 6.2 Indexation des résultats

- **Postgres = vérité**, **OpenSearch/FTS = index dérivé** (jamais l'inverse).
- Sync par **pattern outbox** (event `entity.updated` → réindexation) → cohérence sans couplage fort.
- Index : full-text (valeurs, notes), facettes (type/source/pays), vectoriel (`pgvector`) pour le « similaire à ».
- **Provenance indexée** : filtrer par source, par fiabilité, par fraîcheur = requête directe, pas un post-traitement.

### 6.3 Affichage des relations entre entités

- **Graphe interactif** (Cytoscape/Sigma) : nœuds = entités (couleur/forme par type), arêtes = relations typées (`resolves_to`, `same_as`, `registered_by`, `seen_with`).
- Interactions : expand progressif (charger les voisins à la demande — jamais tout le graphe d'un coup), filtres par type d'arête, chemins entre 2 entités, clustering visuel.
- **Épaisseur/couleur d'arête = confiance** ; arêtes issues du matching Splink marquées « inférées » vs « observées ».
- Bascule **table ↔ graphe** sur la même sélection (deux vues d'un même sous-graphe).

### 6.4 Garder l'UX rapide

- **Tout est async** : lancer un scan retourne un `job_id` immédiat ; résultats en streaming (WebSocket) → **jamais de spinner de 30 s**.
- **Optimistic UI** + cache TanStack Query ; pagination serveur + virtualisation client.
- **Cache par source (TTL)** : résultat déjà connu = instantané, pas de re-scan.
- **Rendu progressif du graphe** (WebGL, lazy-expand).
- **Budget perf** : recherche < 200 ms (index chaud), première ligne de résultat de scan < 2 s.

---

## 7. Risques

### 7.1 Risques techniques

| Risque | Impact | Mitigation |
|---|---|---|
| **Fragilité des connecteurs** (APIs cassent, rate-limits, outils CLI abandonnés) | Élevé | Isolation par worker, circuit breaker, dégradation gracieuse, tests de contrat, health-checks par source |
| **Qualité de l'entity resolution** (faux positifs/négatifs) | Élevé | Splink explicable + humain dans la boucle + seuils tunables + jamais de fusion auto silencieuse |
| **Explosion des coûts** (APIs payantes, GPU LLM) | Moyen | Cache/TTL, quotas, coût variable isolé & monitoré, self-host quantifié |
| **Scalabilité recherche/graphe** | Moyen | Démarrer simple (Postgres), migrer OpenSearch/Neo4j sur signaux réels, pas par anticipation |
| **Hallucination LLM** | Moyen-élevé | Sorties structurées + citation obligatoire + révision humaine + dégradation sans LLM |
| **Cohérence vérité ↔ index** | Moyen | Pattern outbox/CDC, réindexation idempotente |

### 7.2 Risques produit & légaux

| Risque | Impact | Mitigation |
|---|---|---|
| **RGPD / données personnelles** | Critique | Audit dès J1, base légale, rétention/purge, minimisation, droits des personnes, hébergement UE |
| **Violation de ToS des sources** | Élevé | `legal_status` par connecteur, exclure sources interdites, préférer APIs officielles |
| **Usage malveillant** (stalking/harcèlement) | Élevé | Mandat d'enquête loggué, RBAC, quotas, watermark export, CGU strictes |
| **« Illusion de complétude »** (résultats partiels pris pour exhaustifs) | Moyen | Badges fraîcheur/fiabilité, affichage explicite des sources non interrogées/échouées |
| **Dépendance à une source dominante** | Moyen | Plusieurs sources par catégorie, fallback, ne jamais reposer sur un seul fournisseur |

---

## 8. Plan de mise en œuvre (par étapes)

**Étape 0 — Fondations (1–2 sem.)**
Repo, Docker Compose (Postgres, Redis, API, worker, front). **Modèle d'entité canonique** (entity/observation/relationship/source_run). Auth + **audit append-only** + RBAC minimal. CI.

**Étape 1 — Ingestion + 3 connecteurs (2–3 sem.)**
Contrat de connecteur + manifeste. 3 connecteurs gratuits fiables : **crt.sh** (domaine→certs/sous-domaines), **Sherlock/Maigret** (username), **MaxMind GeoLite** (IP→géoloc). Normalisation → upsert. Jobs Celery async + progression WebSocket.

**Étape 2 — Table dynamique + recherche (2 sem.)**
TanStack Table + facettes + vue détail entité (timeline sourcée). Recherche Postgres FTS + `pg_trgm`. Badges fraîcheur/fiabilité.

**Étape 3 — Matching / Entity Resolution (2–3 sem.)**
Splink (DuckDB) + normalisation déterministe + `pgvector`. **File de fusion à valider** (humain dans la boucle). Dédup à l'ingestion.

**Étape 4 — Graphe de relations (2 sem.)**
Apache AGE + Cytoscape.js. Expand progressif, chemins entre entités, bascule table↔graphe. Arêtes observées vs inférées.

**Étape 5 — Playbooks / pivots (1–2 sem.)**
Enchaînements auto (domaine→sous-domaines→IPs→géoloc→breach). Multi-queue (fast/slow/paid). Circuit breakers + cache TTL.

**Étape 6 — LLM assistif (1–2 sem.)**
Service Ollama découplé (Qwen/Mistral), async. Extraction NER + résumé d'enquête, **sorties structurées + citations**. Dégradation gracieuse.

**Étape 7 — Durcissement & conformité (continu)**
Secrets en vault, egress filtré des workers, rétention/purge RGPD, export watermarké, dashboard de coûts. Connecteurs payants (Shodan/HIBP/VT) derrière feature flags + quotas.

**Étape 8 — Scale (sur signaux réels)**
OpenSearch, Neo4j, Temporal, vLLM/GPU, Kubernetes — **uniquement quand les métriques le justifient**, pas par anticipation.

---

## 9. Verdict

**Si je devais choisir aujourd'hui, je partirais sur :**

> Un **monolithe modulaire Django + DRF en Python**, avec **PostgreSQL** comme source de vérité unique (JSONB + `pgvector` + `pg_trgm` + Apache AGE pour le graphe), **Redis + Celery** pour l'orchestration de jobs async, des **connecteurs dockerisés isolés** (modèle IntelOwl : un manifeste + une classe par source), **Splink** pour l'entity resolution explicable avec **humain dans la boucle**, un frontend **Next.js + TanStack Table/Query + Cytoscape.js**, et un **LLM open-weight (Qwen 3 / Mistral Small via Ollama) branché de façon découplée et asynchrone**, jamais dans le chemin critique.
>
> Le tout déployé en **Docker Compose sur un VPS UE** au MVP, avec **audit et conformité RGPD dès le premier jour**. On ne migre vers OpenSearch, Neo4j, Temporal, vLLM/GPU et Kubernetes **que lorsque des métriques réelles le justifient**.

**La conviction de fond :** votre produit ne gagne pas en ayant *plus d'outils* — il gagne en **fusionnant, dédupliquant, reliant et scorant** ce que ces outils crachent, dans une expérience rapide et traçable. Investissez votre temps d'ingénierie sur le **modèle d'entité, le matching et l'UX de corrélation**. Traitez tout le reste comme des **plugins jetables et remplaçables**.

---

### Sources & références

- OSINT Framework — cartographie des catégories : https://osintframework.com
- osint.club free tools : https://osint.club/free-tools/
- IntelOwl (modèle plugins/analyzers, Django+Celery+Postgres) : https://github.com/intelowlproject/IntelOwl · https://intelowlproject.github.io/docs/IntelOwl/usage/
- Splink (entity resolution probabiliste, MIT) : https://moj-analytical-services.github.io/splink/
- Comparatif ER open-source (Splink/Zingg/dedupe) : https://tilores.io/content/best-open-source-entity-resolution-and-record-linkage-libraries-splink-zingg-dedupe-and-when-to-move-beyond-them/
- Awesome Entity Resolution : https://github.com/OlivierBinette/Awesome-Entity-Resolution
- Outils OSINT (SpiderFoot, theHarvester, Recon-ng, Sherlock, Maigret, Amass…) : https://www.pynetlabs.com/osint-tools/
- LLM open-weight 2026 (Qwen/Mistral/Gemma, licences) : https://huggingface.co/blog/daya-shankar/open-source-llms
