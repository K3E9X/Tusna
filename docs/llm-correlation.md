# Corrélation LLM sans hallucination — architecture

> Contrainte produit : le LLM aide à corréler les identités **sans halluciner ni produire de faux positifs**.
> En OSINT, un faux lien = une fausse accusation. Le LLM doit donc être **subordonné aux preuves**, jamais générateur de vérité.

## Principe directeur

**Le LLM ne produit aucun fait. Il n'ordonne, n'explique et ne pondère que des preuves déjà collectées par les connecteurs.** Le score de corrélation est calculé par un moteur déterministe/probabiliste (Splink + signaux) ; le LLM n'y contribue que comme **juge contraint**, et uniquement quand une décision reste ambiguë après les signaux mécaniques.

Trois barrières, dans cet ordre :

1. **Déterministe d'abord** (pas de LLM). Normalisation + règles exactes + signaux calculables (pHash d'avatar, fingerprint PGP, email de commit, cross-link observé, distance de username). ~80 % des décisions se règlent ici, sans LLM.
2. **Probabiliste** (pas de LLM). Splink combine les signaux en un score explicable avec seuils. La zone grise (scores intermédiaires) part vers l'humain — éventuellement assistée par le LLM.
3. **LLM comme juge contraint** (tie-breaker only). Sur un cas ambigu, le LLM reçoit **uniquement les preuves collectées** et doit répondre en JSON structuré avec citation de chaque preuve utilisée. Il ne voit pas le web ; il ne peut pas inventer une source.

## Les 6 garde-fous techniques

### 1. Grounding strict (RAG sur nos propres observations)
Le LLM n'a accès qu'au **contexte de preuves** passé dans le prompt (les `observation_id` de la base), jamais à une recherche libre. Pas de preuve dans le contexte → le LLM n'a rien à dire. On supprime la source d'hallucination à la racine : il n'y a pas de « connaissance du monde » à halluciner, seulement des faits fournis.

### 2. Sortie structurée + citation obligatoire (au niveau du schéma)
Réponse forcée par **JSON Schema / grammar-constrained decoding**. Chaque assertion doit citer l'`evidence_id` qui la soutient. Une assertion sans citation est **rejetée au parsing** (invalide), pas affichée.

```json
{
  "verdict": "same_entity | different_entity | insufficient",
  "confidence": 0-100,
  "cited_evidence": ["ev_avatar_phash", "ev_crosslink_x_gh"],
  "rationale": "texte court",
  "contradictions_noticed": ["ev_geo_texas"]
}
```

### 3. Vérification d'entailment (post-génération)
Pour chaque `(assertion, evidence citée)`, un contrôle d'**implication** (entailment) vérifie que la preuve soutient réellement l'assertion. Assertion non entailée par sa preuve → écartée. C'est l'équivalent du « CiteCheck » : on ne fait pas confiance au LLM sur parole, on vérifie que la citation dit bien ce qu'il prétend.

### 4. Biais anti-faux-positif (asymétrie assumée)
Le prompt et le seuil sont **calibrés vers le doute** : en cas d'incertitude, la sortie par défaut est `insufficient`, pas `same_entity`. Un faux négatif (rater un lien) est rattrapable par l'humain ; un faux positif (affirmer un mauvais lien) est dangereux. Le coût d'erreur est asymétrique, la machine doit l'être aussi.

### 5. Panel + auto-cohérence (pour les décisions à fort enjeu)
Sur un « confirmer/rejeter » important, on interroge **plusieurs fois** (ou plusieurs modèles) avec des angles distincts (correctness / contradiction / provenance). On ne retient `same_entity` que si une **majorité** converge. Les « erreurs auto-cohérentes » (le modèle se trompe de façon stable) sont atténuées par la diversité des angles, pas par la répétition identique.

### 6. Calibration de la confiance
Le nombre de confiance sorti par le LLM n'est **jamais** affiché brut : il est recalibré contre un jeu de validation étiqueté (le LLM est chroniquement sur-confiant). Le score montré à l'analyste vient du moteur probabiliste, pas du LLM ; le LLM ne fait que **classer** et **expliquer**.

## Ce que l'humain garde toujours

- **Aucune fusion automatique** d'entités personnes. Le LLM propose, l'analyste dispose (confirmer / à vérifier / rejeter — les verbes du board).
- Toute décision est **journalisée** (qui, quand, sur quelles preuves) pour l'audit RGPD.
- L'UI affiche les **preuves et leur provenance**, pas seulement le verdict : l'analyste peut toujours remonter au fait brut.

## Usages LLM retenus (par ROI, tous grounded)

| Usage | Rôle du LLM | Garde-fou clé |
|---|---|---|
| Extraction d'entités (NER) sur texte libre | transformer texte → champs normalisés | sortie structurée, pas d'invention de champ |
| Résumé d'enquête | condenser N observations sourcées | chaque phrase cite ses `observation_id` |
| Tie-break de matching | juger un cas ambigu | grounding + entailment + biais doute + panel |
| Traduction / translittération | normaliser du multilingue | déterministe vérifiable |
| Requête langage naturel → filtre de table | traduire une intention en filtre | n'accède qu'au schéma, pas aux données |

**Usages exclus :** laisser le LLM chercher sur le web, inventer un lien non observé, produire un score affiché sans preuve, décider seul une fusion.

## Modèles

Open-weight self-host par défaut (coût maîtrisé, données sensibles hors API tierce) : **Qwen 3** ou **Mistral Small** (Apache 2.0, bon function-calling / JSON). Servis via **Ollama** (MVP) puis **vLLM** (débit). Le LLM est un **service découplé et asynchrone** : le produit fonctionne sans lui (dégradation gracieuse). Voir `docs/architecture.md` §5.

## Références
- Grounding & citation enforcement (schéma + registry check + entailment) : https://futureagi.com/blog/llm-hallucination-deep-dive-2026/
- CiteCheck — détection d'hallucinations de citation par vérification structurée : https://arxiv.org/html/2605.27700v1
- Retrieval-grounded / tiered retrieval : https://arxiv.org/html/2603.17872v1
- Calibration de la confiance LLM : https://arxiv.org/pdf/2505.21772
- Erreurs auto-cohérentes (pourquoi la répétition ne suffit pas) : https://arxiv.org/pdf/2505.17656
- Entity resolution probabiliste (Splink) : https://moj-analytical-services.github.io/splink/
