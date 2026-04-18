# Haoma — Instructions Projet

> ⚠️ **CLAUDE.md GLOBAL DU PROJET** — Ce fichier est automatiquement chargé dans TOUTE session Claude Code ouverte dans `/home/puppetmaster/Haoma/` ou un sous-dossier. Les 3 devs le partagent. Toute modification impacte l'équipe entière — en discuter avant d'éditer.

> Hackathon MIT Hacking Medicine Paris. Temps critique. Décisions figées ci-dessous : ne pas débattre les choix d'architecture, exécuter.

---

## Projet en 2 phrases

Haoma détecte la dégradation micro-vasculaire silencieuse chez l'enfant en réanimation, **des heures avant que les constantes vitales ne bougent**, via un modèle PINN (Physics-Informed Neural Network) branché sur les données du scope hospitalier. Cible jury : Pr. Bergounioux (neuro-pédiatre), Dr. Preka (néphro-pédiatrique), Dr. Sallette (biologiste).

**Sentence pitch :** *"We detect microvascular collapse in critically ill children hours before vital signs show anything is wrong."*

---

## Équipe & répartition

**3 développeurs + 1 médecin référent.**

| Rôle | Responsabilité |
|---|---|
| **Dev 1** | Simulateur patient (étape 1) + moteur de features (étape 3) + génération du dataset + labels |
| **Dev 2** | Modèle PINN (étape 4) + entraînement + SHAP pré-calculé (étape 5) |
| **Dev 3** | FastAPI + WebSocket (étapes 2, 6) + Frontend React (`vite/`) + script de démo (étape 7) |
| **Médecin** | Ne code pas. Calibre le simulateur (plages cliniquement réalistes, corrélations physiologiques), valide les seuils d'alerte (vert/orange/rouge), vérifie la cohérence clinique de SHAP, fournit le vocabulaire des recommandations, répond aux questions cliniques du jury. |

**Le témoignage médecin est pierre angulaire du pitch.** Une phrase du type *"en garde, si j'avais eu ce signal..."* change le ton de "projet hackathon" à "projet crédible devant un jury clinique".

**Chaque dev code sur sa propre machine.** Le dépôt Git est la source de vérité. Tout doit être reproductible par `./scripts/setup.sh` sans intervention manuelle.

---

## Arborescence

```
Haoma/
├── CLAUDE.md              (ce fichier — chargé automatiquement dans toute session)
├── README.md              (présentation publique en anglais)
├── .gitignore
├── backend/
│   ├── pyproject.toml     (dépendances Python — source de vérité)
│   ├── README.md          (setup backend détaillé)
│   ├── scripts/
│   │   ├── setup.sh            (crée .venv + installe tout)
│   │   ├── train.sh            (entraîne le PINN — Dev 2)
│   │   └── precompute_demo.sh  (pré-calcule un scénario — Dev 2 + Dev 3)
│   ├── src/haoma/
│   │   ├── simulator/     (Dev 1 — patient synthétique, corrélations physio)
│   │   ├── features/      (Dev 1 — delta-T, HRV, PI/FC, pente 30min)
│   │   ├── model/         (Dev 2 — PINN PyTorch 3 têtes)
│   │   ├── xai/           (Dev 2 — SHAP DeepExplainer pré-calculé)
│   │   ├── api/           (Dev 3 — FastAPI + WebSocket)
│   │   └── demo/          (Dev 3 — orchestrateur + scénarios JSON)
│   ├── tests/
│   └── data/              (gitignoré — poids et pré-calcul regénérés localement)
│       ├── weights/
│       └── precomputed/
└── vite/                  (Frontend React + Vite + Tailwind + Recharts)
    └── src/
```

## Setup sur une nouvelle machine

**Pré-requis :** Python 3.11 ou 3.12 (**pas 3.13** — PyTorch), Node 20+, Git.

```bash
git clone <repo> Haoma
cd Haoma

# Backend
cd backend
./scripts/setup.sh           # crée .venv + installe tout
source .venv/bin/activate
pytest                       # smoke test — DOIT passer avant de coder

# Frontend (autre terminal)
cd vite
npm install
npm run dev
```

**Règle :** si `pytest` échoue au premier clonage, **arrêter et débugger le setup avant toute autre chose**. Ne pas accumuler des problèmes de setup sur du code buggy.

**Fichiers jamais versionnés :**
- `backend/.venv/` — environnement local
- `backend/data/weights/` — poids PINN (régénérés par `./scripts/train.sh`)
- `backend/data/precomputed/` — scénarios démo (régénérés par `./scripts/precompute_demo.sh`)
- `.env*` — variables d'environnement

Si un dev a besoin des poids de quelqu'un d'autre pour aller vite : partager hors Git (Drive, scp). Jamais de commit.

## Workflow Git — 3 devs sur machines différentes

- **Branches par dev** : `dev1/simulator-features`, `dev2/pinn-xai`, `dev3/api-frontend-demo`
- **main reste démobilisable** à tout moment — ne jamais pousser du code cassé sur main
- **Merges** : rebase avant merge, pas de merge commit bruyant
- **Commits** : un par feature fonctionnelle, message clair, pas de WIP mergé
- **Avant un push** : `pytest` + `ruff check src tests` côté backend (les deux doivent passer)
- **CLAUDE.md, README.md, pyproject.toml** sont partagés — prévenir l'équipe avant édition
- **Claude Code génère souvent du code — relire avant commit**, ne pas commit en aveugle

---

## Stack — figé, ne pas discuter

- **Backend :** Python 3.11+, FastAPI, PyTorch, SHAP (DeepExplainer), Pydantic
- **Frontend :** React + Vite (déjà en place), Tailwind CSS, Recharts, client WebSocket natif → **design system figé dans [`vite/CLAUDE.md`](vite/CLAUDE.md)** (typographie Instrument Serif + Lexend, palette IEC 60601-1-8, WCAG AAA, encodage dual alarm). À lire avant toute modification UI.
- **Machine :** HP EliteBook i7, 16 Go RAM, **pas de GPU**, WSL Ubuntu
- **Modèle :** Petit (3-4 couches, 64-128 neurones), entraîné UNE FOIS en amont, inférence seule à la démo

---

## Règles non-négociables (les piliers)

1. **Cohérence physiologique** — Paramètres du simulateur INTERDÉPENDANTS. FC monte → HRV baisse. Vasoconstriction → delta-T se creuse ET PI chute simultanément. Jamais de paramètres générés indépendamment.
2. **Valeurs pédiatriques** — Enfant ~4 ans : FC 80-120, TA systolique 90-110, SpO2 95-100, FR 20-30. Néonatal si track change : recalibrer, ne pas changer de projet.
3. **Dégradation sigmoïde** — Longue compensation, puis bascule rapide. JAMAIS une rampe linéaire. Un score qui monte linéairement sent le synthétique à 10 mètres.
4. **Contraintes physiques sur les SORTIES du réseau** — Les λ contraignent R̂, Q̂ prédits par le réseau, PAS des relations entre features d'entrée. C'est ce qui en fait un vrai PINN au sens de Raissi et al.
5. **SHAP cliniquement cohérent** — Si le gradient thermique se creuse, SHAP DOIT le remonter comme contributeur principal. Un juré médical repère une explication incohérente en une seconde.
6. **FHIR honnête** — Codes LOINC oui, structure inspirée FHIR oui, "HL7-ready" oui. PAS de faux FHIR prétendant à la conformité stricte. On dit "API façonnée sur le modèle FHIR Observation" et rien de plus.
7. **Démo blindée** — Seed FIXE, scénario pré-calculé, zéro random entre runs, testée 10× minimum avant le jury, backup vidéo prêt.

---

## Architecture technique — décisions figées

### Simulateur (Dev 1)

Deux modes : `stable` / `degradation`. Paramètres générés chaque seconde, **corrélés entre eux** :
- FC + intervalles R-R (pour HRV)
- SpO2, TA sys/dia, T_centrale, T_périphérique, PI, FR
- Pléthysmographie (forme d'onde brute)
- **R_sim, Q_sim** à chaque pas de temps (nécessaires pour supervision faible du PINN)

Scénarios configurables via fichier JSON (âge, poids, pathologie, valeurs de base, moment/vitesse de dégradation). Code générique, scénario = config.

### Pipeline FHIR-like (Dev 3)

Service FastAPI qui reçoit les données et les expose. Chaque mesure est taggée avec son code LOINC :
- FC → `8867-4` · SpO2 → `2708-6` · TA sys → `8480-6` · TA dia → `8462-4`
- T_centrale → `8329-5` · T_périphérique → `8310-5` · PI → `61006-3` · FR → `9279-1`

Buffer glissant 60 min en mémoire. Pas de vrai parseur FHIR, pas de HAPI. Juste la structure inspirée.

### Features (Dev 1) — 4 features seulement

1. **delta-T** = T_centrale − T_périphérique (vasoconstriction périphérique)
2. **Tendance HRV** sur fenêtre glissante (pentes 5/10/30 min à partir des R-R)
3. **Ratio PI/FC** (flux pulsatile capillaire normalisé)
4. **Pente de dégradation 30 min** (dérivée temporelle agrégée)

Les features 5 et 6 du spec original (temps hors plage, variabilité TA) sont coupées.

### Modèle PINN (Dev 2) — 3 têtes (pas 4)

Architecture :
- Couches partagées : 3-4 couches FC, 64-128 neurones, **Tanh ou GELU** (pas ReLU)
- **Tête 1 : R̂** — résistance vasculaire périphérique (softplus + clamp [0.5, 5.0])
- **Tête 2 : Q̂** — débit micro-vasculaire (softplus + clamp [0.1, 3.0])
- **Tête 3 : Haoma Index** — score de risque clinique (sigmoïde, 0-1)

⚠️ Pas de tête compliance Ĉ — retirée pour simplifier la loss et éviter la tête la plus mal contrainte.

**Loss composite :**
```
L_total = L_data + α × L_supervision + λ₁ × L_pression_débit + λ₂ × L_conservation
```
- `L_data` = MSE(score_prédit, score_cible)
- `L_supervision` = MSE(R̂, R_sim) + MSE(Q̂, Q_sim) — supervision faible depuis simulateur
- `L_pression_débit` = (Q̂ − ΔP/R̂)²  — contrainte physique sur les sorties
- `L_conservation` = pénalité sur incohérence temporelle de Q̂

**Entraînement :** ~500-1000 séjours synthétiques, sur i7 CPU ≈ 5-15 min. Poids sauvegardés dans `backend/data/weights/`.

### XAI — SHAP pré-calculé (Dev 2)

- `shap.DeepExplainer` sur la tête 3 (Haoma Index)
- **Pré-calcul complet** : lancer le scénario de démo, calculer SHAP pour chaque point, sauvegarder dans `backend/data/precomputed/demo_scenario.json`
- Pendant la démo : on LIT le fichier, on ne calcule pas. Zéro risque de lag.
- **Interdit** : hardcoder à la main les valeurs pour "aider le narratif". SHAP doit vraiment tourner, juste en amont.

### WebSocket (Dev 3)

Push toutes les 2-3s. Payload JSON :
```json
{
  "timestamp": "...", "patient_id": "...",
  "vitals": {...}, "features": {...},
  "physics": { "resistance": 1.82, "flow": 0.61, ... },
  "haoma_index": 0.72, "alert_level": "orange",
  "shap_contributions": [
    {"feature": "hrv_trend_30min", "value": 0.09, "label": "Chute de la variabilité cardiaque"}
  ],
  "recommendation": "..."
}
```

### Script de démo (Dev 3) — 4 phases, ~6 min

- **Phase 1 (~1.5 min)** — Patient stable. Haoma Index 0.10→0.25. Constantes vertes.
- **Phase 2 (~2.5 min)** — Dérive silencieuse. Haoma Index 0.25→0.55. Constantes **encore vertes**. Moment "wow".
- **Phase 3 (~1 min)** — Alerte imminente. Haoma Index 0.55→0.88. Constantes macro commencent ENFIN à bouger.
- **Phase 4 (~1 min)** — ⚠️ **PAS de split-screen live**. Slide backup "ablation study : sans contraintes physiques, le modèle est bruyant et déclenche des faux positifs". Tableau de métriques comparatives uniquement.

---

## Ce qu'on NE fait PAS

- ❌ Pas de vrai parseur FHIR / serveur HAPI (perte de 3-4h pour zéro valeur démo)
- ❌ Pas de tête compliance Ĉ
- ❌ Pas de Phase 4 split-screen live (risque asymétrique trop élevé)
- ❌ Pas de SHAP temps réel en démo (pré-calculé uniquement)
- ❌ Pas de KernelExplainer (trop lent sans GPU)
- ❌ Pas de ReLU dans le PINN (instable avec physics loss)
- ❌ Pas de Next.js (overhead inutile pour une single-page dashboard)
- ❌ Pas de random non-seedé
- ❌ Pas de deployment cloud, Vercel, Docker — tout tourne en local pendant la démo

---

## Règles de démo — critiques

- **Seed fixe** dans tout le code (numpy, torch, python random)
- Le backend de démo = lecteur du fichier `demo_scenario.json` pré-calculé, pas un simulateur live
- Pas de race condition sur le WebSocket (tester la séquence dans l'ordre)
- Pas de calcul qui bloque le front (toute opération > 50ms est interdite côté front)
- **Backup** : screen recording du run parfait, prêt à lancer si le laptop meurt
- **Testé 10 fois minimum** en conditions identiques à la démo jury

---

## Pitch & réponses jury (à garder en tête en codant)

- **"6 heures" dans le pitch visuel** : dire **"des heures avant"** plutôt que "6h" (littérature adulte septique, extrapolation pédiatrique)
- **Etiometry** : à mentionner proactivement. "Eux font du macro, nous du micro, en amont dans la cascade physiopathologique."
- **Circularité / apprentissage sur nos règles** : réponse apprise par cœur : *"En hackathon on valide l'architecture. En production, le label devient un outcome binaire (crash oui/non dans N heures), la métrique devient PR-AUC sur cohorte rétrospective."*
- **Pourquoi PINN vs ML classique** : *"Le réseau prédit des grandeurs physiques (R̂, Q̂) et les contraintes de Navier-Stokes s'appliquent sur ces sorties. Le score partage les couches latentes avec ces grandeurs, donc il hérite de leur cohérence physique."*
- **Jamais dire** "fiabilité médicale absolue". Toujours dire "support à la décision, le jugement clinique reste souverain".

---

## Consignes diverses (du spec original, maintenues)

- Ne pas mentionner **Cerba**
- Ne pas utiliser le terme **"jumeau numérique"** sauf si solidement ancré techniquement
- Le **code est générique**, le **scénario est un fichier de configuration**
- Si le track devient **néonatologie** : recalibrer les paramètres pédiatriques, pas changer de projet

---

## Conventions de code

- **Python** : type hints partout, Pydantic pour les schémas d'API, `ruff` pour le lint
- **TypeScript** : strict mode, pas de `any` sauf justifié
- **Commentaires** : seulement sur le POURQUOI non-évident (contraintes physiques, seuils cliniques, calibrations empiriques). Pas de commentaires qui répètent le code.
- **Nommage** : variables en anglais dans le code, messages utilisateur en français
- **Commits** : un par feature fonctionnelle, pas de WIP mergé
- **Pas d'over-engineering** : c'est un hackathon, pas une V2. Hardcoder est OK quand c'est justifié.

---

## Checklist avant démo

- [ ] Poids PINN sauvegardés et rechargés proprement
- [ ] Scénario démo pré-calculé présent localement sur la machine de démo
- [ ] WebSocket ne perd pas de frame sur 6 min
- [ ] Frontend reste fluide sur toute la durée
- [ ] Les 3 niveaux d'alerte (vert/orange/rouge) se déclenchent aux bons moments
- [ ] Les contributions SHAP sont cohérentes avec le scénario clinique (validé par le médecin)
- [ ] Grandeurs physiques R̂ et Q̂ affichées en %-variation (plus lisible)
- [ ] Backup vidéo prêt (screen recording d'un run parfait)
- [ ] Métriques (matrice de confusion, PR-AUC, comparaison avec/sans contraintes) prêtes en slide backup
- [ ] Démo répétée 10 fois minimum
- [ ] Médecin briefé sur sa partie du pitch, réponses jury répétées

## Onboarding pour un nouveau dev (ordre de lecture)

1. `README.md` — comprendre le projet en 5 min
2. Ce fichier (`CLAUDE.md`) — règles et décisions
3. `backend/README.md` — setup technique
4. Le module qu'il va toucher (Dev 1 / 2 / 3) — code + tests existants

**Règle d'or :** si quelque chose n'est pas clair, demander à l'équipe avant de coder. Pas d'assumption silencieuse.
