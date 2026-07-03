# Panorama des outils OSINT pour Tusna (recherche 2026)

> Recherche menée en juillet 2026 par une équipe d'agents (infra, email/téléphone, pseudos, visage, threat intel, frameworks) + synthèse experte.
> Objectif : aller **au-delà des outils célèbres** et couvrir tout ce qui sert la **corrélation d'identité** (présence d'une personne/pseudo sur le net), **open source ET commercial**.
> Convention de statut : 🟢 gratuit · 🟡 freemium · 🔴 payant · ⚠️ instable/déclin · ✝️ mort · ⚖️ réserve légale/éthique.
> Note collecte : plusieurs pages officielles (Censys, Shodan store, ZoomEye, FOFA, Epieos, HIBP) renvoient un HTTP 403 aux robots ; chiffres issus de la doc officielle et de sources secondaires récentes recoupées, à re-vérifier au dollar près en direct.

---

## Top « sous-cotés mais précieux » à intégrer en priorité

Ceux qui apportent le plus à une plateforme d'agrégation, et qu'on cite moins que Maltego/SpiderFoot/theHarvester.

| # | Outil | Ce qu'il débloque | Accès | Statut |
|---|---|---|---|---|
| 1 | **Epieos** | Email/tél → compte Google (nom, photo, GAIA ID), Skype, 140+ services. Ne notifie pas la cible. | web + Maltego | 🟡 ~30 €/mois |
| 2 | **Blackbird** | Username enum rapide et **activement maintenu** (2026), là où Sherlock ralentit. | CLI | 🟢 |
| 3 | **WhatsMyName** | La **liste JSON** qui alimente la moitié des outils de pseudo — à ingérer comme dataset interne. | data/JSON + web | 🟢 |
| 4 | **Netlas** | Alternative Shodan/Censys avec un **vrai tier gratuit exploitable** (50 req/j), API propre. | web + API | 🟡 dès 49 $/mois |
| 5 | **IntelligenceX** | Recherche dans leaks, pastes, darkweb, données historiques indexées. | web + API | 🟡 ⚖️ |
| 6 | **FaceCheck.id** | Reverse face search couvrant réseaux/darkweb (là où Google/TinEye échouent sur les visages). | web | 🟡 ⚖️ |
| 7 | **GreyNoise** | Filtre le « bruit » : sait quelles IP scannent Internet → nettoie les faux signaux infra. | web + API | 🟡 (Community 🟢) |
| 8 | **holehe** | Email → existence de compte sur 120+ sites via « mot de passe oublié », sans alerter. | CLI | 🟢 ⚠️ |
| 9 | **IPQualityScore** | Scoring fraude email + téléphone + IP (VoIP/jetable, risque), 1000 crédits/mois gratuits. | API | 🟡 |
| 10 | **sn0int** | Framework OSINT **semi-automatique** avec registry de modules — proche de l'esprit Tusna. | CLI/pkg | 🟢 |
| 11 | **Castrickclues** | Reverse email/username/tél se revendiquant **sans bases de brèches** (propre RGPD). | web | 🟡 |
| 12 | **Lenso.ai** | Reverse image par IA (visages, lieux, duplicatas) — plus « intelligent » que TinEye. | web | 🟡 |
| 13 | **GHunt** | OSINT profond sur compte Google via email/GAIA ID. Puissant mais fragile. | CLI | 🟢 ⚠️ |
| 14 | **socialscan** | Vérifie en un appel la dispo/l'existence email **et** username (async, fiable). | CLI/lib | 🟢 |
| 15 | **cipher387 collections** | Méta-annuaire de 1000+ outils + `API-s-for-OSINT` : pour **découvrir et remplacer** les outils morts. | web/GitHub | 🟢 |
| 16 | **SEON** | Email/tél → empreinte sur 50+ réseaux + scoring de fraude. Rarement cité en OSINT, très puissant pour l'agrégation. | API | 🟡 |
| 17 | **Hudson Rock (Cavalier)** | Dit si une identité apparaît dans un log d'**infostealer** (machines infectées). Gratuit et orienté défense. | web + API | 🟡 ⚖️ |

---

## 1. Username / pseudonyme — énumération de présence

Le cœur du use-case « où est cette personne sur le net ».

- **Sherlock** — 🟢 le classique (username → ~400 sites). Toujours utile mais **maintenance qui ralentit** et modules qui cassent ; à ne pas utiliser seul.
- **Maigret** (soxoj) — 🟢 fork spirituel plus riche : ~2500 sites, **extrait des données de profil** (bio, avatar, dates) et non juste la présence. Meilleur choix par défaut pour l'ingestion.
- **Blackbird** — 🟢 **activement maintenu (2026)**, rapide, sortie propre (JSON/PDF), email + username. Sous-coté.
- **WhatsMyName** (WebBreacher) — 🟢 avant tout une **liste JSON communautaire** de sites + règles de détection ; c'est la *donnée* qui alimente Maigret/Recon-ng/etc. → à **ingérer comme dataset** interne, pas juste comme outil.
- **socialscan** — 🟢 ⚠️ lib Python async : dit si un email/username est **pris ou libre** (distinction inférence forte). Rapide, mais **listes vieillissantes** (maintenance en sommeil).
- **Marple** (soxoj) — 🟢 approche complémentaire : interroge les **moteurs de recherche** (Google/Bing/DDG) plutôt que de tester les URLs. Rattrape ce que Sherlock/Maigret ratent.
- **Nexfil** — 🟢 ⚠️ ~350 sites, rapide, peu de faux positifs ; maintenance intermittente.
- **Snoop Project** — 🟢 base de sites très large (CEI incluse) ; actif mais doc en russe, packaging lourd.
- **Toutatis** (megadose) — 🟢 ⚠️ extrait email/tél obfusqués d'un profil **Instagram** ; marche par intermittence selon les défenses d'IG. **Osintgram** ✝️ est cassé/mort en 2026.

**Pour Tusna :** ingérer la base WhatsMyName + wrapper Maigret (données de profil) + Blackbird (vitesse). Chaque hit devient un « corps » candidat sur le board Orbit.

## 2. Email — enrichissement

- **Epieos** — 🟡 (~29,99 €/mois) — email → compte Google (nom public, photo, GAIA ID, avis Maps), Skype, présence sur 140+ services. Ne notifie pas, ne journalise pas. **Référence enquêteurs.**
- **holehe** — 🟢 ⚠️ — 120+ sites via « forgot password », sans alerter. GPL-3.0, ~11,6k★ mais **maintenance ralentie** (modules qui cassent).
- **GHunt** — 🟢 ⚠️ — OSINT Google profond (profil, services, Maps/Photos, Drive public) via cookies d'un compte Google jetable. **Instable en 2026** (dépend de l'API Google).
- **EmailRep.io** (Sublime) — 🟡 — score de réputation/risque + signaux (réseaux, fuites, âge domaine). Bon pour le **scoring**, pas la désanonymisation.
- **Castrickclues** — 🟡 (~12-100 $/mois) — reverse email/username/tél **sans bases de brèches** (positionnement propre).
- **Hunter.io / Snov.io** — 🟡 — email finder/verifier **B2B** (domaine → emails). Utile corporate, moins sur emails perso.
- **IPQualityScore (email)** — 🟡 — validation temps réel + risque (jetable, frauduleux), 1000 crédits/mois gratuits.
- **HIBP (API)** — 🔴 — dans quelles fuites apparaît un email (+ stealer logs en Pro). Référence, très fiable, mais **API payante**.
- Morts/dormants à éviter : **mosint** ✝️ (2023), **h8mail** ✝️⚖️ (2022, dumps de brèches).

## 3. Téléphone — enrichissement

- **IPQualityScore (phone)** — 🟡 — validité, opérateur, type de ligne, VoIP/jetable, fraude ; 150+ pays, sans appeler.
- **Numverify / apilayer** — 🟡 (100 req/mois gratuites) — validation + carrier lookup, 232 pays. Données statiques (pas d'identité).
- **PhoneInfoga** — 🟢 ⚠️ — framework recon numéro (pays, opérateur, dorks) ; le dépôt se déclare **« non maintenu, peut être archivé »**. Noyau OK, périphérie cassée.
- **Epieos (phone)** — 🟡 — numéro → WhatsApp/Telegram/Facebook et autres inscriptions. Moins riche que le volet email mais utile.
- **Truecaller / Sync.me** — 🟡 ⚖️ — reverse phone → nom, via modèle **« give-to-get »** (upload de carnet d'adresses) → **enjeu RGPD majeur**, numéros ajoutés sans consentement. À traiter avec prudence en UE.
- **Numlookup / Spydialer** — 🟢 ⚠️ — reverse gratuit orienté US ; Spydialer **dégradé/quasi inutilisable fin 2025**.

## 4. Visage / avatar / reverse image

Brique différenciante pour lier des profils par la photo (le **perceptual hashing** interne + moteurs externes).

- **pHash interne** — 🟢 — hachage perceptuel (imagehash) des avatars pour matcher les profils **localement**, sans dépendance externe. **À faire en interne** (signal fort du matching).
- **PimEyes** — 🔴 ⚖️ — reverse face search le plus puissant, très controversé (vie privée). Payant, à encadrer légalement.
- **FaceCheck.id** — 🟡 ⚖️ — reverse face couvrant réseaux + darkweb ; là où les moteurs généralistes échouent.
- **Yandex Images** — 🟢 — le meilleur **gratuit** pour la recherche par visage parmi les moteurs généraux.
- **Lenso.ai** — 🟡 — reverse image par IA (visages, lieux, duplicatas), plus « sémantique » que TinEye.
- **TinEye** — 🟡 — excellent pour retrouver des **copies exactes** d'une image (pas les visages) ; utile pour tracer un avatar réutilisé. Non biométrique = plus propre légalement.
- **Search4Faces** — 🟡 ⚖️ — reconnaissance faciale sur **VK / Odnoklassniki / TikTok** (bases russes). Utile sur cibles CEI ; disponibilité **instable** (géopolitique/sanctions).
- **PDQ** (Meta, dans ThreatExchange) — 🟢 — hachage perceptuel robuste, complément d'imagehash pour matcher un même avatar malgré recadrage/compression. À intégrer en interne.
- **ExifTool** — 🟢 — extraction de métadonnées image (GPS, appareil, logiciel) ; incontournable, à wrapper comme connecteur fichier.
- **Google Lens** — 🟢 — contexte général, faible sur les visages (bridé volontairement).

> ⚖️ **Réserve biométrique majeure** : la recherche faciale relève de l'art. 9 RGPD et du BIPA (Illinois) ; jurisprudence Clearview AI (banni/condamné en UE, UK, Canada, Australie). PimEyes/FaceCheck imposent des CGU « recherche sur soi-même » souvent ignorées mais juridiquement importantes. N'exposer qu'avec base légale + journalisation. Le **pHash interne d'avatars** limite l'exposition juridique car non-biométrique (compare des images, pas des visages).

## 5. Infrastructure / surface d'attaque (domaine, IP, certs)

*(Rapport détaillé de l'agent infra.)*

- **Shodan** — 🟡 — device search de référence. **Membership à vie 49 $** (souvent bradé ~5 $ Black Friday) ; API Freelancer 69 $/mois → Corporate 1099 $/mois. Web + API + CLI.
- **Censys** — 🟡 — données de qualité recherche, excellente couverture certs. **Refonte 2026** : Legacy Search dépréciée, modèle en **crédits** ; Free = **100 crédits/mois** ; Starter dès 100 $/500 crédits. Tier gratuit devenu maigre.
- **Netlas** — 🟡 — alternative montante, **Community gratuit à vie 50 req/j**, API propre, dès 49 $/mois. Bon rapport qualité/prix.
- **GreyNoise** — 🟡 — identifie **qui scanne** Internet (benign/malicious/RIOT) → réduit le bruit d'alerte. Community API 🟢, Enterprise sur devis.
- **ZoomEye** — 🟡 ⚖️ — équivalent chinois de Shodan, bonne couverture Asie. Membership à vie 149 $. **Éditeur chinois (Knownsec)** → réserve de juridiction/confidentialité des requêtes.
- **FOFA** — 🟡 ⚖️ — cyberspace mapping chinois, syntaxe puissante. Système de crédits. **Éditeur chinois** → mêmes réserves ; interface/paiement partiellement en chinois.
- **BinaryEdge** — ✝️ — **fermé le 31 mars 2025** (absorbé par Coalition). Ne plus l'intégrer.
- Compléments gratuits : **crt.sh** (certs/sous-domaines) 🟢, **DNSDumpster** 🟢, **MaxMind GeoLite** (géoloc IP offline) 🟢, **Amass/Subfinder/dnsx** (CLI) 🟢.

## 6. Threat intel / breach / leaks ⚖️

Zone **sensible** : la légalité dépend de la juridiction et de la source des données. À encadrer strictement (base légale, pas de rediffusion de credentials).

- **Hudson Rock — Cavalier** — 🟡 ⚖️ — **intelligence infostealer** (machines/credentials compromis par des malwares voleurs). **Outils gratuits + API**, nettement **orienté défense** (≠ revente grise). Très sous-coté ; excellent pour savoir si une identité est apparue dans un log d'infostealer.
- **IntelligenceX (intelx.io)** — 🟡 — recherche dans leaks, pastes, darkweb, Whois historique, données indexées. Freemium + API. Très utile, à encadrer.
- **Dehashed** — 🔴 ⚖️ — moteur de recherche de brèches (email/username/nom/tél → credentials). Puissant mais **zone grise** ; usage défensif uniquement.
- **LeakCheck / Snusbase** — 🔴 ⚖️ — recherche de comptes dans des fuites. Mêmes réserves.
- **HIBP** — 🔴 — le choix **propre** pour les brèches (ne rediffuse pas les mots de passe). À privilégier en UE.
- **MISP / OpenCTI** — 🟢 — plateformes de threat intel (connecteurs d'export/enrichissement d'IoC), pertinentes en V2 pour l'écosystème pro.

## 6bis. APIs people / identity commerciales ⚖️

Payantes pour la plupart, mais elles apportent une couverture qu'aucun outil OSS n'égale. Distinguer nettement les APIs **KYC/fraude** (usage B2B légitime) des people-search grand public (usage OSINT à risque). Aux US : **FCRA** interdit l'usage emploi/crédit/logement. En UE : la plupart sont **difficilement compatibles RGPD** hors base légale solide.

- **SEON** — 🟡 — email/téléphone → **empreinte sur 50+ réseaux sociaux** + enrichissement + scoring de fraude. API propre, essai/freemium. **Très sous-coté pour l'agrégation d'identité.**
- **People Data Labs (PDL)** — 🟡 — enrichissement personne/entreprise (profils pro agrégés), API propre avec **free tier réel** (crédits mensuels). Conformité RGPD à surveiller selon l'usage.
- **Epieos / OSINT Industries** — 🟡/🔴 — agrégateurs « email/tél → comptes » orientés enquêteurs (OSINT Industries revendique 3000+ comptes). Concurrents produits directs à benchmarker.
- **Trestle** (ex-Ekata / Whitepages Pro) — 🔴 — API identité/téléphone (reverse phone, caller-ID, scoring), orientée KYC/fraude.
- **Endato / Enformion** — 🔴 ⚖️ — people-search **US** par API (adresses, proches, tél), **FCRA-restricted**.
- **Pipl** — 🔴 — l'ex-référence du reverse email/tél, désormais **B2B fraude/KYC uniquement** (fermé aux enquêteurs indépendants depuis ~2019). **FullContact** a pivoté vers l'identity resolution marketing.
- **Social Links (SL Professional)** — 🔴 — extension commerciale type Maltego (500+ sources : réseaux, blockchain, darkweb). Entreprise.
- **Predicta Search** — 🔴 — moteur people-search pour enquêteurs (email/tél/nom → comptes, fuites, images).
- **RocketReach / Lusha / ZoomInfo / Clearbit** — 🟡/🔴 — enrichissement **contact B2B** (email/tél pro depuis nom+société).
- Grand public US (web, API rare, scraping contre CGU, FCRA) : **TruePeopleSearch / FastPeopleSearch** 🟢, **Spokeo / BeenVerified / Intelius** 🔴.

## 7. Frameworks d'agrégation self-host (concurrents & inspirations)

- **IntelOwl** — 🟢 — **le modèle de référence** pour Tusna : Django + Celery + Postgres, plugins analyzers/connectors/pivots/playbooks. À étudier de près (voire étendre).
- **sn0int** — 🟢 — framework OSINT **semi-automatique** avec registry de modules et graphe d'entités. Esprit très proche de Tusna.
- **Recon-ng** — 🟢 — framework modulaire (marketplace de modules) façon Metasploit du recon. Bon pour les connecteurs domaine/personne.
- **SpiderFoot** — 🟢 (HX 🔴) — automatise 100+ sources depuis une graine. Puissant, mais orienté « scan » plus que « corrélation d'identité fine ».
- **Maltego CE** — 🟡 ⚖️ — référence du link-analysis visuel, mais **CE très bridée** et modèle commercial ; Tusna vise justement une alternative web moderne.
- **OSINT Industries** — 🔴 — **agrégateur commercial** email/tél → présence multi-services très large et propre. Concurrent direct côté « corrélation » ; à observer comme benchmark produit.
- **Lampyre / Predicta Search** — 🔴 — plateformes commerciales d'investigation ; benchmarks UX.
- Morts : **Datasploit** ✝️, **Skiptracer** ⚠️.

## 8. Méta-annuaires (pour rester à jour et remplacer les outils morts)

- **cipher387/osint_stuff_tool_collection** 🟢 — 1000+ outils, sections username/email/phone/face/social ; + **cipher387/API-s-for-OSINT** (APIs). Le meilleur pour **découvrir et remplacer** les outils abandonnés.
- **jivoi/awesome-osint** 🟢 — la liste communautaire de référence.
- **OSINT Framework** 🟢 — la carte arborescente par type d'enquête.
- **Bellingcat Toolkit** / **IntelTechniques** 🟢 — sélections d'enquêteurs pros, souvent en avance sur les listes génériques.

---

## Implications pour Tusna

1. **Connecteurs auto prioritaires** (fiables, API/CLI) : Maigret + Blackbird (username), crt.sh + Netlas (infra), Epieos + holehe + EmailRep (email), IPQualityScore + Numverify (tél), pHash interne (avatar). → alimentent le board Orbit automatiquement.
2. **APIs payantes derrière feature flags + quotas** : Shodan, HIBP, IntelligenceX, PimEyes/FaceCheck. Coût variable isolé et monitoré, étiqueté dans l'UI.
3. **Catalogue de pivots manuels** (import cipher387) : ~1000 outils web « à cliquer », filtrables, pour combler ce que l'auto ne couvre pas — l'analyste recolle le résultat sur le board.
4. **Signaler dans l'UI** : statut (freemium/payant/instable/mort), fraîcheur, et **réserves légales** (Truecaller/Sync.me RGPD ; Dehashed/Snusbase brèches ; ZoomEye/FOFA juridiction chinoise).
5. **Surveiller la maintenance** : holehe, GHunt, PhoneInfoga déclinent — prévoir des remplaçants (via cipher387) et des tests de contrat par connecteur.

## Sources principales
- cipher387 : https://github.com/cipher387/osint_stuff_tool_collection · https://github.com/cipher387/API-s-for-OSINT
- Username : https://github.com/p1ngul1n0/blackbird · https://github.com/soxoj/maigret · https://github.com/WebBreacher/WhatsMyName · https://github.com/iojw/socialscan
- Email/tél : https://epieos.com/pricing · https://github.com/megadose/holehe · https://github.com/mxrch/GHunt · https://emailrep.io/ · https://www.ipqualityscore.com/plans · https://numverify.com/pricing · https://haveibeenpwned.com/API/Key · https://castrickclues.com/
- Infra : https://account.shodan.io/billing · https://censys.com/blog/legacy-search-deprecation/ · https://netlas.io/pricing/ · https://www.greynoise.io/plans · https://www.zoomeye.ai/pricing · https://en.fofa.info/vip · https://www.binaryedge.io/pricing.html
- Visage : https://facecheck.id/ · https://yandex.com/images/ · https://lenso.ai/ · https://tineye.com/
- Threat intel : https://intelx.io/ · https://haveibeenpwned.com/
- Frameworks : https://github.com/intelowlproject/IntelOwl · https://github.com/kpcyrd/sn0int · https://github.com/lanmaster53/recon-ng · https://osint.industries/
